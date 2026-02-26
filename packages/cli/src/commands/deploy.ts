import path from 'node:path'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { ensureAuth } from '../utils/auth-guard.js'
import { createClient } from '../utils/api-client.js'
import { autoTrackProject } from '../core/project-tracker.js'
import { CHAINS, getChainId, getSupportedChainSlugs } from '../utils/chains.js'
import { parseForgeBroadcast, parseForgeStdout } from '../lib/deploy/forge-parser.js'
import { writeStructuredDeployment } from '../lib/deploy/deployments.js'
import { renderDeploymentSummary } from '../utils/summary.js'
import { findDeployScript } from '../utils/foundry.js'

export function deployCommand(): Command {
  return new Command('deploy')
    .description('Deploy contracts to a target chain')
    .requiredOption('--chain <chain>', 'Target chain name (e.g. sepolia, ethereum, base)')
    .option('--skip-tests', 'Skip running tests before deployment')
    .option('--verify', 'Verify contracts on block explorer after deployment')
    .option('--vercel', 'Deploy frontend to Vercel after contract deployment')
    .action(async (opts) => {
      try {
        await runDeploy(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Deployment failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

interface DeployOptions {
  chain: string
  skipTests?: boolean
  verify?: boolean
  vercel?: boolean
}

export async function runDeploy(opts: DeployOptions): Promise<void> {
  const { chain, skipTests, verify, vercel } = opts
  const startTime = Date.now()

  autoTrackProject(process.cwd())

  p.intro(pc.bgCyan(pc.black(` Deploying to ${chain} `)))

  // 0. Ensure authenticated
  const { apiKey } = await ensureAuth()

  // 1. Validate chain
  const chainId = getChainId(chain)
  if (chainId === undefined) {
    throw new Error(
      `Unknown chain "${chain}". Supported chains: ${getSupportedChainSlugs().join(', ')}`,
    )
  }

  // 2. API preflight check
  logger.step('Running deployment preflight...')
  const client = createClient(apiKey)
  const preflight = await client.preflight(chain, chainId)

  if (!preflight.allowed) {
    throw new Error(
      `Deployment to ${pc.bold(chain)} is not allowed: ${preflight.reason}\n` +
        (preflight.tier_required
          ? `Required tier: ${pc.bold(preflight.tier_required)}. Upgrade at ${pc.underline('https://web3.market/pricing')}`
          : ''),
    )
  }
  logger.success('Preflight passed')

  // 3. Validate env vars
  const rpcEnvKey = `${chain.toUpperCase().replace(/-/g, '_')}_RPC_URL`
  const rpcUrl = process.env[rpcEnvKey]
  if (!rpcUrl) {
    throw new Error(
      `Missing ${pc.bold(rpcEnvKey)}.\n\n` +
        `  Get a free RPC URL from:\n` +
        `    ${pc.underline('https://www.alchemy.com')} or ${pc.underline('https://www.infura.io')}\n\n` +
        `  Then set it in your ${pc.bold('.env')} file:\n` +
        `    ${pc.cyan(`${rpcEnvKey}=https://...`)}\n\n` +
        `  Or use the interactive menu (${pc.cyan('w3m')} > Deploy) for guided setup.`,
    )
  }

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!deployerKey) {
    throw new Error(
      `Missing ${pc.bold('DEPLOYER_PRIVATE_KEY')}.\n\n` +
        `  Set it in your ${pc.bold('.env')} file:\n` +
        `    ${pc.cyan('DEPLOYER_PRIVATE_KEY=0x...')}\n\n` +
        `  Or use the interactive menu (${pc.cyan('w3m')} > Deploy) for guided setup.`,
    )
  }
  logger.success('Env vars checked')

  const contractsDir = path.resolve(process.cwd(), 'contracts')

  // 4. Build
  logger.step('Building contracts...')
  try {
    await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
    logger.success('Contracts compiled')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Contract compilation failed: ${detail}`)
  }

  // 5. Run tests (unless skipped)
  if (!skipTests) {
    logger.step('Running contract tests...')
    try {
      const result = await execa('forge', ['test'], { cwd: contractsDir, stdio: 'pipe' })
      const passMatch = result.stdout.match(/(\d+)\s+pass/)
      const passCount = passMatch ? passMatch[1] : '?'
      logger.success(`All tests passed (${passCount} tests)`)
    } catch {
      throw new Error('Contract tests failed. Fix failing tests or use --skip-tests to bypass.')
    }
  }

  // 6. Deploy
  const deployScript = findDeployScript(contractsDir)
  logger.step(`Deploying to ${pc.bold(chain)} (chain ID: ${chainId})...`)
  const forgeArgs = [
    'script',
    deployScript,
    '--broadcast',
    '--rpc-url',
    rpcUrl,
    '--private-key',
    deployerKey,
  ]
  if (verify) {
    forgeArgs.push('--verify')
  }

  let deployOutput: string
  try {
    const result = await execa('forge', forgeArgs, { cwd: contractsDir, stdio: 'pipe' })
    deployOutput = result.stdout
    logger.success('Deployment transaction(s) broadcast')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Deployment script failed: ${detail}`)
  }

  // 7. Parse deployment results — try broadcast file first, fall back to stdout
  const scriptFileName = deployScript.split('/').pop()!
  let parsedContracts = await parseForgeBroadcast(contractsDir, scriptFileName, chainId)
  if (parsedContracts.length === 0) {
    parsedContracts = parseForgeStdout(deployOutput)
  }

  // 8. Write structured deployment
  const deploymentsDir = path.resolve(process.cwd(), 'deployments')
  if (parsedContracts.length > 0) {
    await writeStructuredDeployment(deploymentsDir, {
      chainId,
      chain,
      contracts: parsedContracts,
    })
    logger.success(`Deployment saved to ${pc.underline(`deployments/${chainId}.json`)}`)
  } else {
    // Fallback: save raw output
    await fs.ensureDir(deploymentsDir)
    const deploymentFile = path.join(deploymentsDir, `${chainId}.json`)
    await fs.writeJson(deploymentFile, {
      chainId,
      chain,
      deployedAt: new Date().toISOString(),
      output: deployOutput,
      contracts: {},
    }, { spaces: 2 })
    logger.success(`Deployment saved to ${pc.underline(`deployments/${chainId}.json`)}`)
  }

  // 9. Register deployment with API
  const primaryContract = parsedContracts[0]
  try {
    await client.registerDeployment({
      chain,
      chain_id: chainId,
      address: primaryContract?.address ?? '0x',
      tx_hash: primaryContract?.txHash ?? '0x',
    })
    logger.success('Deployment registered')
  } catch {
    logger.warn('Could not register deployment with API')
  }

  // 10. Run codegen
  logger.step('Running codegen to update TypeScript bindings...')
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: process.cwd() })
    logger.success('Codegen complete — addresses updated')
  } catch {
    logger.warn('Codegen skipped — run "w3m generate" manually')
  }

  // 11. Vercel deployment (if requested)
  if (vercel) {
    logger.step('Deploying frontend to Vercel...')
    try {
      const { deployToVercel } = await import('../lib/vercel/index.js')
      const result = await deployToVercel({ projectDir: process.cwd(), production: true })
      logger.success(`Frontend deployed: ${pc.underline(result.url)}`)
    } catch {
      logger.warn('Vercel deployment skipped — is the Vercel CLI installed?')
    }
  }

  // 12. Show rich summary
  const duration = Date.now() - startTime
  renderDeploymentSummary({
    chain,
    chainId,
    contracts: parsedContracts.map((c) => ({ name: c.contractName, address: c.address })),
    duration,
  })
}
