import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execa } from 'execa'
import { logger } from './logger.js'
import pc from 'picocolors'

/**
 * Ensure Foundry (forge) is installed. Prompts user to install if missing.
 */
export async function ensureFoundryInstalled(): Promise<void> {
  try {
    await execa('forge', ['--version'], { stdio: 'pipe' })
  } catch {
    logger.error(
      `Foundry is not installed. Install it with:\n` +
        `  ${pc.bold('curl -L https://foundry.paradigm.xyz | bash')}\n` +
        `  ${pc.bold('foundryup')}`,
    )
    process.exit(1)
  }
}

/**
 * Get Foundry version string, or null if not installed.
 */
export async function getFoundryVersion(): Promise<string | null> {
  try {
    const result = await execa('forge', ['--version'], { stdio: 'pipe' })
    return result.stdout.split('\n')[0] ?? null
  } catch {
    return null
  }
}

/**
 * Ensure a directory is a git repo (forge install requires git submodules).
 * Initializes git if needed. Returns true if repo is ready.
 */
export async function ensureGitRepo(dir: string): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: 'pipe' })
    return true
  } catch {
    // Not a git repo — initialize one
    try {
      await execa('git', ['init'], { cwd: dir, stdio: 'pipe' })
      return true
    } catch (err: any) {
      logger.error('Could not initialize git repository: ' + (err?.stderr || err?.message || ''))
      return false
    }
  }
}

/**
 * Install a Solidity dependency via forge install.
 * Ensures git repo exists first. Returns true on success.
 */
export async function installSolidityDep(contractsDir: string, dep: string): Promise<boolean> {
  // forge install uses git submodules — need a git repo
  const projectRoot = join(contractsDir, '..')
  const gitReady = await ensureGitRepo(projectRoot)
  if (!gitReady) {
    logger.error(`Cannot install ${dep} — git initialization failed`)
    return false
  }

  try {
    await execa('forge', ['install', dep], { cwd: contractsDir, stdio: 'pipe' })
    return true
  } catch (err: any) {
    const stderr: string = err?.stderr || err?.message || ''
    // Common failure reasons with actionable messages
    if (stderr.includes('already exists')) {
      // Submodule dir exists but is broken — remove and retry
      const depName = dep.split('/').pop() ?? dep
      const libPath = join(contractsDir, 'lib', depName)
      try {
        const fs = await import('fs-extra')
        await fs.default.remove(libPath)
        await execa('forge', ['install', dep], { cwd: contractsDir, stdio: 'pipe' })
        return true
      } catch {
        logger.error(`Failed to install ${dep} (cleanup retry failed)`)
        return false
      }
    }
    if (stderr.includes('not found') || stderr.includes('Could not resolve')) {
      logger.error(`Could not find ${dep} — check the package name`)
    } else if (stderr.includes('Permission denied') || stderr.includes('authentication')) {
      logger.error(`Git authentication failed installing ${dep}`)
    } else {
      logger.error(`Failed to install ${dep}`)
      if (stderr) {
        const lines = stderr.split('\n').filter(Boolean).slice(0, 5)
        for (const line of lines) {
          console.log(pc.dim('  ' + line))
        }
      }
    }
    return false
  }
}

/**
 * Diagnose and auto-repair common issues in the contracts directory.
 * Returns true if everything looks good (or was fixed), false if unfixable.
 */
export async function diagnoseAndFix(contractsDir: string): Promise<boolean> {
  // 1. Check forge exists
  const forgeOk = await getFoundryVersion()
  if (!forgeOk) {
    logger.error('Foundry is not installed.')
    console.log('')
    console.log('  Install it with:')
    console.log(`  ${pc.cyan('curl -L https://foundry.paradigm.xyz | bash')}`)
    console.log(`  ${pc.cyan('foundryup')}`)
    return false
  }

  // 2. Check foundry.toml
  if (!existsSync(join(contractsDir, 'foundry.toml'))) {
    logger.warn('Missing foundry.toml in contracts/')
    console.log(pc.dim('  Tip: Run ') + pc.cyan('w3m fix') + pc.dim(' to auto-fix with AI.'))
    return false
  }

  // 3. Auto-install missing Solidity deps
  const libDir = join(contractsDir, 'lib')
  const needsOz = !existsSync(join(libDir, 'openzeppelin-contracts'))
  const needsForgeStd = !existsSync(join(libDir, 'forge-std'))

  if (needsOz || needsForgeStd) {
    logger.step('Installing missing Solidity dependencies...')

    if (needsOz) {
      const ok = await installSolidityDep(contractsDir, 'OpenZeppelin/openzeppelin-contracts')
      if (!ok) return false
      logger.success('Installed openzeppelin-contracts')
    }
    if (needsForgeStd) {
      const ok = await installSolidityDep(contractsDir, 'foundry-rs/forge-std')
      if (!ok) return false
      logger.success('Installed forge-std')
    }
  }

  // 4. Check remappings.txt
  if (!existsSync(join(contractsDir, 'remappings.txt'))) {
    logger.warn('Missing remappings.txt — forge may not resolve imports correctly')
  }

  return true
}

/**
 * Detect which package manager is available on the system.
 * Checks in order: pnpm, bun, yarn, npm (npm is always the fallback).
 */
export async function detectPackageManager(): Promise<'pnpm' | 'bun' | 'yarn' | 'npm'> {
  for (const pm of ['pnpm', 'bun', 'yarn'] as const) {
    try {
      await execa(pm, ['--version'], { stdio: 'pipe' })
      return pm
    } catch {}
  }
  return 'npm'
}

export function findDeployScript(contractsDir: string): string {
  const scriptDir = join(contractsDir, 'script')
  if (!existsSync(scriptDir)) return 'script/Deploy.s.sol'

  try {
    const files = readdirSync(scriptDir)
    const deployScripts = files.filter(
      (f) => f.startsWith('Deploy') && f.endsWith('.s.sol'),
    )

    if (deployScripts.length === 1) {
      return `script/${deployScripts[0]}`
    }

    if (deployScripts.includes('Deploy.s.sol')) {
      return 'script/Deploy.s.sol'
    }

    if (deployScripts.length > 0) {
      return `script/${deployScripts[0]}`
    }

    return 'script/Deploy.s.sol'
  } catch {
    return 'script/Deploy.s.sol'
  }
}

// ── Deploy pre-flight ────────────────────────────────────────────────────────

export interface EnvVarRequirement {
  name: string
  type: 'Uint' | 'Address' | 'String' | 'Bytes32' | 'Bool' | 'Int'
}

/**
 * Scan a deploy script for vm.env* calls and return the required env vars.
 * Parses patterns like: vm.envUint("DEPLOYER_PRIVATE_KEY")
 */
export function scanDeployScriptEnvVars(contractsDir: string, scriptPath: string): EnvVarRequirement[] {
  const fullPath = join(contractsDir, scriptPath)
  if (!existsSync(fullPath)) return []

  try {
    const content = readFileSync(fullPath, 'utf-8')
    const results: EnvVarRequirement[] = []
    const seen = new Set<string>()

    // Match vm.envUint("NAME"), vm.envAddress("NAME"), vm.envString("NAME"), etc.
    const regex = /vm\.env(Uint|Address|String|Bytes32|Bool|Int)\(\s*["']([^"']+)["']\s*\)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      const type = match[1]! as EnvVarRequirement['type']
      const name = match[2]!
      if (!seen.has(name)) {
        seen.add(name)
        results.push({ name, type })
      }
    }

    return results
  } catch {
    return []
  }
}

/** Well-known Anvil default account #0 private key. */
const ANVIL_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

/** Env vars that are auto-provided for local Anvil deployments. */
const ANVIL_AUTO_ENV: Record<string, string> = {
  DEPLOYER_PRIVATE_KEY: ANVIL_PRIVATE_KEY,
}

export interface PreflightResult {
  ok: boolean
  /** Env vars to inject when calling forge script (auto-provided + from process.env). */
  env: Record<string, string>
  /** Env vars that are missing and cannot be auto-provided. */
  missing: EnvVarRequirement[]
}

/**
 * Pre-flight check before running a deploy script.
 *
 * 1. Scans the script for vm.env* calls
 * 2. For local (Anvil) deploys, auto-provides known vars (DEPLOYER_PRIVATE_KEY)
 * 3. Checks remaining vars against process.env
 * 4. Returns missing vars so the caller can inform the user BEFORE deploying
 */
export function preflightDeploy(contractsDir: string, scriptPath: string): PreflightResult {
  const required = scanDeployScriptEnvVars(contractsDir, scriptPath)
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  const missing: EnvVarRequirement[] = []

  for (const req of required) {
    // Auto-provide known Anvil vars
    const autoVal = ANVIL_AUTO_ENV[req.name]
    if (autoVal) {
      env[req.name] = autoVal
      continue
    }

    // Check if already set in environment
    if (process.env[req.name]) {
      continue
    }

    missing.push(req)
  }

  return { ok: missing.length === 0, env, missing }
}

/**
 * Log actionable guidance for missing env vars.
 */
export function reportMissingEnvVars(missing: EnvVarRequirement[], projectRoot: string): void {
  logger.error('Deploy script requires environment variables that are not set:')
  console.log('')
  for (const req of missing) {
    console.log(`  ${pc.red('✗')} ${pc.bold(req.name)} ${pc.dim(`(vm.env${req.type})`)}`)
  }
  console.log('')
  console.log(pc.dim('  Set them in one of these ways:'))
  console.log(`    ${pc.dim('1.')} Add to ${pc.cyan(join(projectRoot, '.env'))}`)
  console.log(`    ${pc.dim('2.')} Export in your shell: ${pc.cyan(`export ${missing[0]?.name ?? 'VAR'}=value`)}`)
  console.log('')
}
