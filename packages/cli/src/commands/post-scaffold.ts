import path from 'node:path'
import * as p from '@clack/prompts'
import { execa, type ResultPromise } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { parseForgeBroadcast, parseForgeStdout } from '../lib/deploy/forge-parser.js'
import { writeStructuredDeployment } from '../lib/deploy/deployments.js'
import { renderDeploymentSummary } from '../utils/summary.js'
import { findDeployScript, diagnoseAndFix, detectPackageManager } from '../utils/foundry.js'
import { getAiConfig } from '../ai/config.js'
import { runAiFix } from '../ai/fix.js'

const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ANVIL_RPC = 'http://127.0.0.1:8545'

/**
 * Post-scaffold: start full dev environment.
 * Delegates to the unified runDev() in dev.ts.
 */
export async function runPostScaffoldDev(projectDir: string, projectName: string): Promise<void> {
  process.chdir(projectDir)
  const { runDev } = await import('./dev.js')
  await runDev({ port: '3000', anvil: true })
}

/**
 * Deploy locally to Anvil — no auth required, starts Anvil if needed.
 * Used from workspace menu "Deploy contracts" → "Local (Anvil)".
 */
export async function runLocalDeploy(projectDir: string): Promise<void> {
  const contractsDir = path.join(projectDir, 'contracts')
  const startTime = Date.now()

  const subprocesses: ResultPromise[] = []
  const killAnvil = () => {
    for (const proc of subprocesses) {
      try { proc.kill('SIGTERM') } catch {}
    }
  }

  // 1. Start Anvil
  logger.step('Starting Anvil local chain...')
  try {
    const anvil = execa('anvil', ['--port', '8545'], { stdio: 'pipe' })
    subprocesses.push(anvil)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    logger.success('Anvil running on ' + pc.underline(ANVIL_RPC))
  } catch {
    logger.warn('Could not start Anvil — is Foundry installed?')
  }

  try {
    // 2. Auto-install node deps if missing
    const nodeModulesExist = await fs.pathExists(path.join(projectDir, 'node_modules'))
    if (!nodeModulesExist) {
      const pm = await detectPackageManager()
      logger.step('Installing dependencies...')
      try {
        await execa(pm, ['install'], { cwd: projectDir, stdio: 'pipe' })
        logger.success('Dependencies installed')
      } catch {
        logger.warn(`Could not install dependencies — run ${pm} install manually`)
      }
    }

    // 3. Diagnose and auto-fix common issues
    const healthy = await diagnoseAndFix(contractsDir)
    if (!healthy) {
      killAnvil()
      return
    }

    // 4. Build contracts with retry loop
    let buildSuccess = false
    while (!buildSuccess) {
      logger.step('Building contracts...')
      try {
        await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
        logger.success('Contracts compiled')
        buildSuccess = true
      } catch (error: any) {
        const stderr: string = error?.stderr || error?.message || 'Unknown error'
        logger.error('Contract compilation failed')
        console.log('')
        const lines = stderr.split('\n').filter(Boolean).slice(0, 30)
        for (const line of lines) {
          console.log(pc.dim('  ┃ ') + line)
        }
        console.log('')

        // Auto-diagnose: missing dependency errors
        if (stderr.includes('Source') && stderr.includes('not found')) {
          const fixed = await diagnoseAndFix(contractsDir)
          if (fixed) {
            logger.info('Dependencies were missing — retrying build...')
            continue
          }
        }

        // Can't auto-fix mechanically — offer AI fix or manual
        const hasAi = getAiConfig() !== null
        const options: Array<{ value: string; label: string; hint?: string }> = []

        if (hasAi) {
          options.push({ value: 'ai-fix', label: 'Fix with AI', hint: 'Recommended' })
        } else {
          options.push({ value: 'ai-setup', label: 'Set up AI to auto-fix', hint: 'Claude, GPT, or custom' })
        }
        options.push(
          { value: 'manual', label: 'I\'ll fix manually, then retry' },
          { value: 'cancel', label: 'Cancel' },
        )

        const action = await p.select({ message: 'How would you like to proceed?', options })
        if (p.isCancel(action) || action === 'cancel') {
          killAnvil()
          return
        }

        if (action === 'ai-fix' || action === 'ai-setup') {
          const result = await runAiFix({
            projectRoot: projectDir,
            contractsDir,
            errorOutput: stderr,
            maxRetries: 2,
          })
          if (result.success) continue
          // AI couldn't fix — fall back to manual retry
          const retryAfterAi = await p.confirm({ message: 'AI could not fix all errors. Retry manually?' })
          if (p.isCancel(retryAfterAi) || !retryAfterAi) {
            killAnvil()
            return
          }
        }
        // 'manual' — user fixes and we loop back
      }
    }

    // 4. Deploy to local chain with retry loop
    const deployScript = findDeployScript(contractsDir)
    const scriptFileName = deployScript.split('/').pop()!
    let parsedContracts: Array<{ contractName: string; address: string; txHash: string; blockNumber: number }> = []
    let deploySuccess = false
    while (!deploySuccess) {
      logger.step('Deploying contracts to local chain...')
      try {
        const result = await execa(
          'forge',
          ['script', deployScript, '--broadcast', '--rpc-url', ANVIL_RPC, '--private-key', ANVIL_KEY],
          { cwd: contractsDir, stdio: 'pipe' },
        )

        parsedContracts = await parseForgeBroadcast(contractsDir, scriptFileName, 31337)
        if (parsedContracts.length === 0) {
          parsedContracts = parseForgeStdout(result.stdout)
        }

        if (parsedContracts.length > 0) {
          await writeStructuredDeployment(path.join(projectDir, 'deployments'), {
            chainId: 31337,
            chain: 'localhost',
            contracts: parsedContracts,
          })
        }

        logger.success('Contracts deployed to local chain')
        deploySuccess = true
      } catch (error: any) {
        const stderr: string = error?.stderr || error?.message || 'Unknown error'
        logger.error('Local deployment failed')
        console.log('')
        const lines = stderr.split('\n').filter(Boolean).slice(0, 30)
        for (const line of lines) {
          console.log(pc.dim('  ┃ ') + line)
        }
        console.log('')

        const hasAiDeploy = getAiConfig() !== null
        const deployOptions: Array<{ value: string; label: string; hint?: string }> = []

        if (hasAiDeploy) {
          deployOptions.push({ value: 'ai-fix', label: 'Fix with AI', hint: 'Recommended' })
        } else {
          deployOptions.push({ value: 'ai-setup', label: 'Set up AI to auto-fix', hint: 'Claude, GPT, or custom' })
        }
        deployOptions.push(
          { value: 'manual', label: 'I\'ll fix manually, then retry' },
          { value: 'cancel', label: 'Cancel' },
        )

        const deployAction = await p.select({ message: 'How would you like to proceed?', options: deployOptions })
        if (p.isCancel(deployAction) || deployAction === 'cancel') {
          killAnvil()
          return
        }

        if (deployAction === 'ai-fix' || deployAction === 'ai-setup') {
          const result = await runAiFix({
            projectRoot: projectDir,
            contractsDir,
            errorOutput: stderr,
            maxRetries: 2,
          })
          if (result.success) continue
          const retryAfterAi = await p.confirm({ message: 'AI could not fix all errors. Retry manually?' })
          if (p.isCancel(retryAfterAi) || !retryAfterAi) {
            killAnvil()
            return
          }
        }
        // 'manual' — user fixes and we loop back
      }
    }

    // 5. Run codegen
    logger.step('Running codegen...')
    try {
      const { runCodegen } = await import('@web3marketlabs/codegen')
      await runCodegen({ root: projectDir })
      logger.success('Codegen complete')
    } catch {
      logger.warn('Codegen skipped')
    }

    // 6. Show summary
    const duration = Date.now() - startTime
    renderDeploymentSummary({
      chain: 'Local (Anvil)',
      chainId: 31337,
      contracts: parsedContracts.map((c) => ({ name: c.contractName, address: c.address })),
      duration,
      anvilUrl: ANVIL_RPC,
    })
  } finally {
    killAnvil()
  }
}

/**
 * Post-scaffold: deploy to a testnet (guided flow with env var setup)
 */
export async function runPostScaffoldDeploy(projectDir: string, projectName: string): Promise<void> {
  process.chdir(projectDir)

  const chain = 'sepolia'
  const chainId = 11155111
  const contractsDir = path.join(projectDir, 'contracts')
  const envFile = path.join(projectDir, '.env')

  // Check for required env vars
  let rpcUrl = process.env.SEPOLIA_RPC_URL
  let deployerKey = process.env.DEPLOYER_PRIVATE_KEY

  if (!rpcUrl || !deployerKey) {
    console.log('')
    console.log(pc.bold('  Environment Setup'))
    console.log(pc.dim('  You need an RPC URL and deployer private key to deploy to Sepolia.'))
    console.log('')
    console.log(pc.dim('  Get a free RPC URL from:'))
    console.log(pc.dim(`    ${pc.underline('https://www.alchemy.com')} or ${pc.underline('https://www.infura.io')}`))
    console.log('')

    if (!rpcUrl) {
      const rpcInput = await p.text({
        message: 'Enter your Sepolia RPC URL:',
        placeholder: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
        validate: (v) => (!v ? 'RPC URL is required' : undefined),
      })
      if (p.isCancel(rpcInput)) return
      rpcUrl = rpcInput as string
    }

    if (!deployerKey) {
      const keyInput = await p.text({
        message: 'Enter your deployer private key:',
        placeholder: '0x...',
        validate: (v) => {
          if (!v) return 'Private key is required'
          if (!/^0x[a-fA-F0-9]{64}$/.test(v)) return 'Invalid private key format'
          return undefined
        },
      })
      if (p.isCancel(keyInput)) return
      deployerKey = keyInput as string
    }

    // Write to .env file
    let envContent = ''
    try {
      envContent = await fs.readFile(envFile, 'utf-8')
    } catch {
      // No existing .env
    }

    const envLines: string[] = []
    if (rpcUrl && !envContent.includes('SEPOLIA_RPC_URL')) {
      envLines.push(`SEPOLIA_RPC_URL=${rpcUrl}`)
    }
    if (deployerKey && !envContent.includes('DEPLOYER_PRIVATE_KEY')) {
      envLines.push(`DEPLOYER_PRIVATE_KEY=${deployerKey}`)
    }

    if (envLines.length > 0) {
      const append = envContent ? '\n' + envLines.join('\n') + '\n' : envLines.join('\n') + '\n'
      await fs.writeFile(envFile, envContent + append)
      logger.success('Environment variables saved to .env')
    }

    // Set in process env for this run
    process.env.SEPOLIA_RPC_URL = rpcUrl
    process.env.DEPLOYER_PRIVATE_KEY = deployerKey
  }

  const startTime = Date.now()

  // Build (with AI fix option on failure)
  logger.step('Building contracts...')
  let buildPassed = false
  try {
    await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
    logger.success('Contracts compiled')
    buildPassed = true
  } catch (error: any) {
    const stderr: string = error?.stderr || error?.message || 'Unknown error'
    logger.error('Contract compilation failed')
    console.log('')
    const lines = stderr.split('\n').filter(Boolean).slice(0, 30)
    for (const line of lines) {
      console.log(pc.dim('  ┃ ') + line)
    }
    console.log('')

    const hasAi = getAiConfig() !== null
    const fixOptions: Array<{ value: string; label: string; hint?: string }> = []

    if (hasAi) {
      fixOptions.push({ value: 'ai-fix', label: 'Fix with AI', hint: 'Recommended' })
    } else {
      fixOptions.push({ value: 'ai-setup', label: 'Set up AI to auto-fix', hint: 'Claude, GPT, or custom' })
    }
    fixOptions.push({ value: 'cancel', label: 'Cancel deployment' })

    const fixAction = await p.select({ message: 'How would you like to proceed?', options: fixOptions })
    if (!p.isCancel(fixAction) && (fixAction === 'ai-fix' || fixAction === 'ai-setup')) {
      const result = await runAiFix({
        projectRoot: projectDir,
        contractsDir,
        errorOutput: stderr,
        maxRetries: 3,
      })
      if (result.success) {
        buildPassed = true
      } else {
        logger.error('Could not fix build errors. Deployment aborted.')
        return
      }
    } else {
      return
    }
  }

  if (!buildPassed) return

  // Deploy
  const deployScript2 = findDeployScript(contractsDir)
  const scriptFileName2 = deployScript2.split('/').pop()!
  logger.step(`Deploying to ${pc.bold('Sepolia')} (chain ID: ${chainId})...`)
  let parsedContracts: Array<{ contractName: string; address: string; txHash: string; blockNumber: number }> = []
  try {
    const result = await execa(
      'forge',
      [
        'script', deployScript2, '--broadcast',
        '--rpc-url', rpcUrl!,
        '--private-key', deployerKey!,
      ],
      { cwd: contractsDir, stdio: 'pipe' },
    )

    parsedContracts = await parseForgeBroadcast(contractsDir, scriptFileName2, chainId)
    if (parsedContracts.length === 0) {
      parsedContracts = parseForgeStdout(result.stdout)
    }

    if (parsedContracts.length > 0) {
      await writeStructuredDeployment(path.join(projectDir, 'deployments'), {
        chainId,
        chain,
        contracts: parsedContracts,
      })
    }

    logger.success('Deployment broadcast')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.error(`Deployment failed: ${detail}`)
    return
  }

  // Codegen
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: projectDir })
  } catch {}

  // Summary
  const duration = Date.now() - startTime
  renderDeploymentSummary({
    chain: 'Sepolia',
    chainId,
    contracts: parsedContracts.map((c) => ({ name: c.contractName, address: c.address })),
    duration,
  })
}
