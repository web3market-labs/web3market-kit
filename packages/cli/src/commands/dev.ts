import path from 'node:path'
import { existsSync } from 'node:fs'
import { Command } from 'commander'
import { execa, type ResultPromise } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { autoTrackProject } from '../core/project-tracker.js'
import { findDeployScript, diagnoseAndFix, detectPackageManager, getFoundryVersion, preflightDeploy, reportMissingEnvVars } from '../utils/foundry.js'
import { isPortInUse, findFreePort } from '../utils/port.js'
import { parseForgeBroadcast, parseForgeStdout } from '../lib/deploy/forge-parser.js'
import { writeStructuredDeployment } from '../lib/deploy/deployments.js'
import { renderDeploymentSummary } from '../utils/summary.js'
import { getAiConfig } from '../ai/config.js'

const ANVIL_RPC = 'http://127.0.0.1:8545'

export function devCommand(): Command {
  return new Command('dev')
    .description('Start local development environment')
    .option('-p, --port <port>', 'Frontend dev server port', '3000')
    .option('--no-anvil', 'Skip starting local Anvil chain')
    .option('--skip-frontend', 'Skip starting the frontend dev server')
    .action(async (opts) => {
      try {
        await runDev(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Dev server failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

export interface DevOptions {
  port: string
  anvil: boolean
  skipFrontend?: boolean
}

export async function runDev(opts: DevOptions): Promise<void> {
  const projectDir = process.cwd()
  autoTrackProject(projectDir)

  const contractsDir = path.join(projectDir, 'contracts')
  const webDir = path.join(projectDir, 'web')
  const hasContractsDir = existsSync(path.join(contractsDir, 'src'))
  const hasWebDir = existsSync(webDir)

  if (!hasContractsDir && !hasWebDir) {
    logger.error('No contracts/src/ or web/ directory found.')
    console.log(pc.dim('  Run this command from a web3market project root, or create one with:'))
    console.log(`  ${pc.cyan('w3m new')}`)
    return
  }

  const subprocesses: ResultPromise[] = []

  const killAll = () => {
    for (const proc of subprocesses) {
      try { proc.kill('SIGTERM') } catch {}
    }
  }

  let onStop: (() => void) | null = null
  const stopPromise = new Promise<void>((resolve) => { onStop = resolve })
  let stopped = false

  const sigHandler = () => {
    if (stopped) return
    stopped = true
    logger.info('Shutting down dev environment...')
    killAll()
    onStop?.()
  }

  process.on('SIGINT', sigHandler)
  process.on('SIGTERM', sigHandler)

  const startTime = Date.now()
  let buildOk = false
  const hasAi = getAiConfig() !== null
  let parsedContracts: Array<{ contractName: string; address: string; txHash: string; blockNumber: number }> = []

  try {
    // ── 1. Check Foundry ──────────────────────────────────────────────
    if (hasContractsDir) {
      const forgeVersion = await getFoundryVersion()
      if (!forgeVersion) {
        logger.error('Foundry is not installed.')
        console.log('')
        console.log('  Install it with:')
        console.log(`  ${pc.cyan('curl -L https://foundry.paradigm.xyz | bash')}`)
        console.log(`  ${pc.cyan('foundryup')}`)
        console.log('')
        console.log(pc.dim('  Then re-run this command.'))
        return
      }
    }

    // ── 2. Auto-install node deps ─────────────────────────────────────
    const nodeModulesExist = await fs.pathExists(path.join(projectDir, 'node_modules'))
    if (!nodeModulesExist) {
      const pm = await detectPackageManager()
      logger.step('Installing dependencies...')
      try {
        await execa(pm, ['install'], { cwd: projectDir, stdio: 'pipe' })
        logger.success('Dependencies installed')
      } catch {
        logger.warn(`Could not install dependencies — run ${pc.cyan(pm + ' install')} manually`)
      }
    }

    // ── 3. Start Anvil ────────────────────────────────────────────────
    if (opts.anvil && hasContractsDir) {
      const anvilInUse = await isPortInUse(8545)
      if (anvilInUse) {
        logger.info('Anvil already running on port 8545 — reusing existing instance')
      } else {
        logger.step('Starting Anvil local chain...')
        try {
          const anvil = execa('anvil', ['--port', '8545'], { stdio: 'pipe' })
          subprocesses.push(anvil)
          await new Promise((resolve) => setTimeout(resolve, 1500))
          logger.success('Anvil running on ' + pc.underline(ANVIL_RPC))
        } catch {
          logger.warn('Could not start Anvil — is Foundry installed?')
        }
      }
    }

    // ── 4. Diagnose & fix contracts ───────────────────────────────────
    if (hasContractsDir) {
      const healthy = await diagnoseAndFix(contractsDir)
      if (!healthy) {
        const tip = hasAi
          ? pc.dim('  Tip: Run ') + pc.cyan('w3m fix') + pc.dim(' to auto-fix errors with AI.')
          : pc.dim('  Tip: Run ') + pc.cyan('w3m fix') + pc.dim(' to set up AI-assisted error fixing.')
        console.log(tip)
      }

      // ── 5. Build contracts ──────────────────────────────────────────
      logger.step('Building contracts...')
      try {
        await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
        logger.success('Contracts compiled')
        buildOk = true
      } catch (error: any) {
        const stderr: string = error?.stderr || error?.message || 'Unknown error'
        logger.error('Contract compilation failed')
        console.log('')
        const lines = stderr.split('\n').filter(Boolean).slice(0, 40)
        for (const line of lines) {
          console.log(pc.dim('  ┃ ') + line)
        }
        console.log('')
        const tip = hasAi
          ? pc.dim('  Tip: Run ') + pc.cyan('w3m fix') + pc.dim(' to auto-fix errors with AI.')
          : pc.dim('  Tip: Run ') + pc.cyan('w3m fix') + pc.dim(' to set up AI-assisted error fixing.')
        console.log(tip)
        if (hasWebDir) {
          console.log(pc.dim('  Skipping deploy — continuing to frontend.'))
        }
      }

      // ── 6. Deploy to local chain ────────────────────────────────────
      if (buildOk) {
        const deployScript = findDeployScript(contractsDir)

        // Pre-flight: validate env vars before attempting deploy
        const preflight = preflightDeploy(contractsDir, deployScript)
        if (!preflight.ok) {
          reportMissingEnvVars(preflight.missing, projectDir)
          logger.warn('Skipping deploy — missing environment variables')
          if (hasWebDir) {
            console.log(pc.dim('  Continuing to frontend.'))
          }
        } else {
          const scriptFileName = deployScript.split('/').pop()!
          logger.step('Deploying contracts to local chain...')
          try {
            const result = await execa(
              'forge',
              ['script', deployScript, '--broadcast', '--rpc-url', ANVIL_RPC, '--private-key', preflight.env['DEPLOYER_PRIVATE_KEY'] ?? ''],
              {
                cwd: contractsDir,
                stdio: 'pipe',
                env: preflight.env,
              },
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
          } catch (error: any) {
            const stderr: string = error?.stderr || error?.message || 'Unknown error'
            logger.error('Local deployment failed')
            console.log('')
            const lines = stderr.split('\n').filter(Boolean).slice(0, 40)
            for (const line of lines) {
              console.log(pc.dim('  ┃ ') + line)
            }
            console.log('')
          }
        }
      }

      // ── 7. Codegen ──────────────────────────────────────────────────
      logger.step('Running codegen...')
      try {
        const { runCodegen } = await import('@web3market/codegen')
        await runCodegen({ root: projectDir })
        logger.success('Codegen complete')
      } catch (err: any) {
        const detail = err?.message ? `: ${err.message.split('\n')[0]}` : ''
        logger.warn('Codegen skipped' + detail)
      }
    }

    // ── Summary (if contracts were deployed) ────────────────────────
    if (parsedContracts.length > 0) {
      const duration = Date.now() - startTime
      renderDeploymentSummary({
        chain: 'Local (Anvil)',
        chainId: 31337,
        contracts: parsedContracts.map((c) => ({ name: c.contractName, address: c.address })),
        duration,
        anvilUrl: ANVIL_RPC,
      })
    }

    // ── 8. Start frontend ─────────────────────────────────────────────
    if (!opts.skipFrontend && hasWebDir) {
      await startFrontend(webDir, opts.port, subprocesses, stopPromise)
    } else if (!opts.skipFrontend && !hasWebDir && hasContractsDir) {
      logger.info('No web/ directory — Anvil is running. Press Ctrl+C to stop.')
      await stopPromise
    } else if (opts.skipFrontend && hasContractsDir) {
      logger.info('Frontend skipped. Anvil is running — press Ctrl+C to stop.')
      await stopPromise
    }
  } finally {
    process.removeListener('SIGINT', sigHandler)
    process.removeListener('SIGTERM', sigHandler)
    killAll()
    logger.success('Dev environment stopped')
  }
}

/**
 * Start the frontend dev server with automatic port retry.
 * Uses the package manager to run web/package.json's "dev" script so that
 * workspace dependency resolution works correctly (pnpm/yarn workspaces).
 * Falls back to npx if no dev script exists.
 */
async function startFrontend(
  webDir: string,
  portOpt: string,
  subprocesses: ResultPromise[],
  stopPromise: Promise<void>,
): Promise<void> {
  const frontend = detectFrontendFramework(webDir)
  const preferred = parseInt(portOpt, 10) || 3000
  let port = await findFreePort(preferred)

  if (port !== preferred) {
    logger.info(`Port ${preferred} is in use — using port ${port} instead`)
  }

  // Check if web/package.json has a dev script
  const hasDevScript = await checkDevScript(webDir)
  const pm = await detectPackageManager()

  for (let attempt = 0; attempt < 3; attempt++) {
    const portStr = String(port)
    logger.step(`Starting ${frontend} dev server on port ${portStr}...`)

    // Build the command. Prefer running web's own "dev" script via the PM
    // so workspace dependency resolution works (pnpm, yarn, npm workspaces).
    let devCmd: ResultPromise
    if (hasDevScript) {
      // Run via PM from the web dir — this resolves `next` through the workspace
      const portArgs =
        frontend === 'next' ? ['--', '-p', portStr] : ['--', '--port', portStr]

      if (pm === 'pnpm' || pm === 'bun') {
        devCmd = execa(pm, ['run', 'dev', ...portArgs], { cwd: webDir, stdio: 'inherit' })
      } else if (pm === 'yarn') {
        devCmd = execa('yarn', ['dev', ...portArgs], { cwd: webDir, stdio: 'inherit' })
      } else {
        devCmd = execa('npm', ['run', 'dev', ...portArgs], { cwd: webDir, stdio: 'inherit' })
      }
    } else {
      // No dev script — direct invocation
      devCmd =
        frontend === 'next'
          ? execa('npx', ['next', 'dev', '-p', portStr], { cwd: webDir, stdio: 'inherit' })
          : execa('npx', ['vite', '--port', portStr], { cwd: webDir, stdio: 'inherit' })
    }

    subprocesses.push(devCmd)

    // Wait briefly and check if the process died immediately (port conflict / config error)
    const earlyExit = await Promise.race([
      devCmd.then(() => 'exited' as const).catch((err) => ({ error: err })),
      stopPromise.then(() => 'stopped' as const),
      new Promise<'running'>((resolve) => setTimeout(() => resolve('running'), 4000)),
    ])

    if (earlyExit === 'stopped') {
      return
    }

    if (earlyExit === 'running') {
      logger.success(`Frontend running on ${pc.underline(`http://localhost:${portStr}`)}`)
      console.log(pc.dim('  Press Ctrl+C to stop and return to menu.'))
      await Promise.race([devCmd.catch(() => {}), stopPromise])
      return
    }

    // Process exited early — check if port conflict
    if (typeof earlyExit === 'object' && 'error' in earlyExit) {
      const msg = earlyExit.error?.stderr || earlyExit.error?.message || ''
      if (msg.includes('EADDRINUSE') && attempt < 2) {
        logger.warn(`Port ${portStr} is in use — trying next port...`)
        port = await findFreePort(port + 1)
        continue
      }
      // Not a port issue — real error
      const firstLine = msg.split('\n').find((l: string) => l.trim()) || 'unknown error'
      logger.error(`Frontend failed to start: ${firstLine}`)
      return
    }

    return
  }

  logger.error('Could not find an available port for the frontend dev server.')
}

async function checkDevScript(webDir: string): Promise<boolean> {
  try {
    const pkgPath = path.join(webDir, 'package.json')
    if (!existsSync(pkgPath)) return false
    const content = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(content)
    return !!(pkg.scripts && pkg.scripts.dev)
  } catch {
    return false
  }
}

function detectFrontendFramework(webDir: string): 'next' | 'vite' {
  const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts']
  for (const cfg of nextConfigs) {
    if (existsSync(path.join(webDir, cfg))) return 'next'
  }

  const viteConfigs = ['vite.config.js', 'vite.config.mjs', 'vite.config.ts']
  for (const cfg of viteConfigs) {
    if (existsSync(path.join(webDir, cfg))) return 'vite'
  }

  return 'next'
}
