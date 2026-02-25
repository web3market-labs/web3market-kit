import path from 'node:path'
import { existsSync } from 'node:fs'
import { execa } from 'execa'
import * as p from '@clack/prompts'
import { logger } from '../utils/logger.js'
import { findDeployScript, preflightDeploy, reportMissingEnvVars } from '../utils/foundry.js'
import { parseForgeBroadcast, parseForgeStdout } from '../lib/deploy/forge-parser.js'
import { writeStructuredDeployment } from '../lib/deploy/deployments.js'

const ANVIL_RPC = 'http://127.0.0.1:8545'

export interface RebuildResult {
  buildSuccess: boolean
  deploySuccess: boolean
  codegenSuccess: boolean
  buildErrors?: string
}

export async function rebuildProject(
  projectRoot: string,
  opts?: { anvilRunning?: boolean },
): Promise<RebuildResult> {
  const contractsDir = path.join(projectRoot, 'contracts')
  const hasContracts = existsSync(path.join(contractsDir, 'src'))

  if (!hasContracts) {
    // Frontend-only changes — skip all contract steps
    return { buildSuccess: true, deploySuccess: true, codegenSuccess: true }
  }

  const result: RebuildResult = {
    buildSuccess: false,
    deploySuccess: false,
    codegenSuccess: false,
  }

  // 1. Build contracts
  const buildSpinner = p.spinner()
  buildSpinner.start('Building contracts...')
  try {
    await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
    buildSpinner.stop('Contracts compiled')
    result.buildSuccess = true
  } catch (error: any) {
    const stderr: string = error?.stderr || error?.message || 'Unknown build error'
    buildSpinner.stop('Contract compilation failed')
    result.buildErrors = stderr
    return result
  }

  // 2. Deploy to Anvil (only if anvil is running and build succeeded)
  if (opts?.anvilRunning) {
    const deployScript = findDeployScript(contractsDir)

    // Pre-flight: check env vars before attempting deploy
    const preflight = preflightDeploy(contractsDir, deployScript)
    if (!preflight.ok) {
      reportMissingEnvVars(preflight.missing, projectRoot)
      logger.warn('Skipping deploy — missing environment variables')
    } else {
      const deploySpinner = p.spinner()
      deploySpinner.start('Deploying contracts to local chain...')
      try {
        const scriptFileName = deployScript.split('/').pop()!

        const forgeResult = await execa(
          'forge',
          ['script', deployScript, '--broadcast', '--rpc-url', ANVIL_RPC, '--private-key', preflight.env['DEPLOYER_PRIVATE_KEY'] ?? ''],
          {
            cwd: contractsDir,
            stdio: 'pipe',
            env: preflight.env,
          },
        )

        let parsedContracts = await parseForgeBroadcast(contractsDir, scriptFileName, 31337)
        if (parsedContracts.length === 0) {
          parsedContracts = parseForgeStdout(forgeResult.stdout)
        }

        if (parsedContracts.length > 0) {
          await writeStructuredDeployment(path.join(projectRoot, 'deployments'), {
            chainId: 31337,
            chain: 'localhost',
            contracts: parsedContracts,
          })
        }

        deploySpinner.stop('Contracts deployed to local chain')
        result.deploySuccess = true
      } catch (error: any) {
        const stderr: string = error?.stderr || error?.message || 'Unknown deploy error'
        deploySpinner.stop('Local deployment failed')
        logger.warn(stderr.split('\n')[0] ?? 'Deploy error')
      }
    }
  }

  // 3. Codegen
  const codegenSpinner = p.spinner()
  codegenSpinner.start('Running codegen...')
  try {
    const { runCodegen } = await import('@web3market/codegen')
    await runCodegen({ root: projectRoot })
    codegenSpinner.stop('Codegen complete')
    result.codegenSuccess = true
  } catch (err: any) {
    const detail = err?.message ? `: ${err.message.split('\n')[0]}` : ''
    codegenSpinner.stop('Codegen skipped' + detail)
  }

  return result
}
