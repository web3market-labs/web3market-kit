import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { execa } from 'execa'
import { renderWelcome } from './banner.js'
import { readApiKey } from '../utils/credentials.js'
import { createClient, type UserInfo } from '../utils/api-client.js'
import { detectProject, type DetectedProject } from '../core/project-detector.js'
import { listProjects } from '../core/project-store.js'
import { getProjectDeployments } from '../lib/deploy/history.js'
import { getChainById, getChainSelectOptions } from '../utils/chains.js'
import { timeAgo } from '../utils/time.js'
import { getAiConfig } from '../ai/config.js'
import { validateAuth } from '../core/auth.js'
import { logger } from '../utils/logger.js'
import { isFirstRun, runOnboarding } from './onboarding.js'

export async function showHomeMenu(): Promise<void> {
  // First-run onboarding
  if (isFirstRun()) {
    await runOnboarding()
  }

  // Determine auth state (re-read after possible onboarding)
  let user: UserInfo | null = null
  const apiKey = readApiKey()
  if (apiKey) {
    try {
      const client = createClient(apiKey)
      user = await client.getMe()
    } catch {
      // Key invalid — treat as unauthenticated
    }
  }

  // Determine project state
  const project = detectProject(process.cwd())

  // Get last deployment for banner
  let lastDeploy: { chain: string; ago: string } | null = null
  if (project) {
    try {
      const history = await getProjectDeployments(process.cwd())
      if (history.lastDeployedAt) {
        const lastChainId = history.deployments[0]?.chainId
        const chainInfo = lastChainId ? getChainById(lastChainId) : null
        lastDeploy = {
          chain: chainInfo?.slug ?? history.deployments[0]?.chain ?? 'unknown',
          ago: timeAgo(history.lastDeployedAt),
        }
      }
    } catch {}
  }

  // Render welcome
  console.log(renderWelcome(user, project?.name ?? null, lastDeploy))
  console.log('')

  // If inside a project directory, go straight to workspace (regardless of auth)
  if (project) {
    await showProjectMenu(project)
  } else if (user) {
    await showAuthenticatedMenu(user)
  } else {
    await showUnauthenticatedMenu()
  }
}

// ─── Unauthenticated ─────────────────────────────────────────────────

async function showUnauthenticatedMenu(): Promise<void> {
  while (true) {
    const recentProjects = listProjects().slice(0, 3)

    if (recentProjects.length > 0) {
      console.log(pc.dim('  Recent:'))
      for (const proj of recentProjects) {
        const ago = timeAgo(proj.lastOpenedAt)
        console.log(`    ${pc.cyan('\u25A0')} ${pc.bold(proj.name)}  ${pc.dim(proj.path.replace(process.env.HOME || '', '~'))}  ${pc.dim(ago)}`)
      }
      console.log('')
    }

    const options: Array<{ value: string; label: string; hint?: string }> = [
      { value: 'new', label: 'New project', hint: 'Token, dApp, or custom' },
    ]

    if (recentProjects.length > 0) {
      options.push({ value: 'open', label: 'Open project', hint: 'Continue where you left off' })
    }

    options.push(
      { value: 'auth', label: 'Connect account', hint: 'API key for testnet/mainnet deploys' },
      { value: 'help', label: 'Help' },
      { value: 'exit', label: 'Exit' },
    )

    const action = await p.select({
      message: pc.bold('What do you want to build?'),
      options,
    })

    if (p.isCancel(action) || action === 'exit') {
      p.outro(pc.dim('See you next time!'))
      return
    }

    console.log('')

    if (action === 'open') {
      const projects = listProjects()
      if (projects.length === 0) {
        logger.info('No recent projects. Create one first.')
        console.log('')
        continue
      }

      const selected = await p.select({
        message: 'Select a project:',
        options: [
          ...projects.map((proj) => ({
            value: proj.path,
            label: proj.name,
            hint: proj.path.replace(process.env.HOME || '', '~'),
          })),
          { value: '_back', label: 'Back' },
        ],
      })

      if (p.isCancel(selected) || selected === '_back') continue

      try {
        process.chdir(selected as string)
        const project = detectProject(process.cwd())
        if (project) {
          await showProjectMenu(project)
          return
        } else {
          logger.warn('This directory is not a web3market project.')
        }
      } catch {
        logger.error(`Could not open project at ${selected}`)
      }
    } else if (action === 'auth') {
      console.log(pc.dim(`  Get your API key at ${pc.underline('https://web3.market/dashboard/plan')}`))
      console.log('')
      const key = await p.text({
        message: 'Enter your API key:',
        placeholder: 'w3m_...',
        validate: (v) => (!v ? 'API key is required' : undefined),
      })
      if (p.isCancel(key)) continue

      try {
        const { writeApiKey } = await import('../utils/credentials.js')
        writeApiKey(key as string)
        const client = createClient(key as string)
        const user = await client.getMe()
        logger.success(`Authenticated as ${user.name} (${user.tier})`)
        console.log('')
        await showAuthenticatedMenu(user)
        return
      } catch {
        logger.error('Invalid API key')
      }
    } else if (action === 'new') {
      // Save cwd before running 'new' — it changes process.cwd()
      const savedCwd = process.cwd()
      await runInline('new')
      // After 'new' finishes, check if we're now in a project
      const newProject = detectProject(process.cwd())
      if (newProject) {
        await showProjectMenu(newProject)
        return
      }
      // If not in a project (user cancelled or exited), restore cwd
      try { process.chdir(savedCwd) } catch {}
    } else if (action === 'help') {
      showHelp()
    }

    console.log('')
  }
}

// ─── Authenticated (no project) ──────────────────────────────────────

async function showAuthenticatedMenu(user: UserInfo): Promise<void> {
  while (true) {
    const recentProjects = listProjects().slice(0, 3)

    if (recentProjects.length > 0) {
      console.log(pc.dim('  Recent:'))
      for (const proj of recentProjects) {
        const ago = timeAgo(proj.lastOpenedAt)
        console.log(`    ${pc.cyan('\u25A0')} ${pc.bold(proj.name)}  ${pc.dim(proj.path.replace(process.env.HOME || '', '~'))}  ${pc.dim(ago)}`)
      }
      console.log('')
    }

    const action = await p.select({
      message: pc.bold('What do you want to build?'),
      options: [
        { value: 'new', label: 'New project', hint: 'Token, dApp, or custom' },
        { value: 'open', label: 'Open project', hint: 'Continue where you left off' },
        { value: 'templates', label: 'Browse templates', hint: 'Tokens, staking, presale & more' },
        { value: 'status', label: 'Account', hint: 'Plan & usage' },
        { value: 'exit', label: 'Exit' },
      ],
    })

    if (p.isCancel(action) || action === 'exit') {
      p.outro(pc.dim('See you next time!'))
      return
    }

    console.log('')

    if (action === 'open') {
      const projects = listProjects()
      if (projects.length === 0) {
        logger.info('No recent projects. Create one first.')
        console.log('')
        continue
      }

      const selected = await p.select({
        message: 'Select a project:',
        options: [
          ...projects.map((proj) => ({
            value: proj.path,
            label: proj.name,
            hint: proj.path.replace(process.env.HOME || '', '~'),
          })),
          { value: '_back', label: 'Back' },
        ],
      })

      if (p.isCancel(selected) || selected === '_back') continue

      try {
        process.chdir(selected as string)
        const project = detectProject(process.cwd())
        if (project) {
          await showProjectMenu(project)
          return
        } else {
          logger.warn('This directory is not a web3market project.')
        }
      } catch {
        logger.error(`Could not open project at ${selected}`)
      }
    } else if (action === 'new') {
      const savedCwd = process.cwd()
      await runInline('new')
      const newProject = detectProject(process.cwd())
      if (newProject) {
        await showProjectMenu(newProject)
        return
      }
      try { process.chdir(savedCwd) } catch {}
    } else if (action === 'templates') {
      await runInline('templates')
    } else if (action === 'status') {
      await runInline('status')
    }

    console.log('')
  }
}

// ─── Project Workspace (the main loop) ───────────────────────────────

export async function showProjectMenu(project: DetectedProject): Promise<void> {
  while (true) {
    // Re-detect project state each loop (deployments may have changed)
    const currentProject = detectProject(process.cwd()) ?? project

    let history = { deployments: [] as any[], chains: [] as number[], lastDeployedAt: null as string | null }
    try { history = await getProjectDeployments(process.cwd()) } catch {}
    const hasAi = getAiConfig() !== null

    // Context-aware menu ordering
    const isTokenProject = currentProject.template?.startsWith('token-') ?? false
    const hasNoFrontend = currentProject.frontend === 'none'
    const hasDeployments = history.deployments.length > 0

    const options: Array<{ value: string; label: string; hint?: string }> = []

    if (hasNoFrontend) {
      options.push({ value: 'deploy', label: 'Deploy', hint: 'Anvil \u2192 testnet \u2192 mainnet' })
    } else if (isTokenProject && !hasDeployments) {
      options.push(
        { value: 'deploy', label: 'Deploy', hint: 'Anvil \u2192 testnet \u2192 mainnet' },
        { value: 'dev', label: 'Dev environment', hint: 'Local chain + frontend' },
      )
    } else {
      options.push(
        { value: 'dev', label: 'Dev environment', hint: 'Local chain + frontend' },
        { value: 'deploy', label: 'Deploy', hint: 'Anvil \u2192 testnet \u2192 mainnet' },
      )
    }

    options.push({ value: 'ai', label: 'AI customize', hint: hasAi ? 'Modify contracts & frontend' : 'Connect AI provider' })
    options.push({ value: 'chat', label: 'AI Chat', hint: 'Conversational project editor' })
    options.push({ value: 'fix', label: 'Auto-fix', hint: 'Diagnose & repair build errors' })

    if (hasDeployments) {
      const count = history.deployments.length
      const chains = history.chains.length
      options.push({ value: 'deployments', label: 'Deployments', hint: `${count} contract${count > 1 ? 's' : ''} on ${chains} chain${chains > 1 ? 's' : ''}` })
    }

    if (currentProject.hasContracts) {
      options.push({ value: 'test', label: 'Test', hint: 'Run Forge test suite' })
      options.push({ value: 'audit', label: 'Audit', hint: 'Security analysis' })
    }

    options.push(
      { value: 'switch', label: 'Switch project' },
      { value: 'exit', label: 'Exit' },
    )

    const action = await p.select({ message: pc.bold(pc.cyan(currentProject.name)), options })

    if (p.isCancel(action) || action === 'exit') {
      p.outro(pc.dim('See you next time!'))
      return
    }

    console.log('')

    try {
      const result = await handleProjectAction(action as string, currentProject)
      if (result === 'switched') return
    } catch (error) {
      if (p.isCancel(error)) {
        // User cancelled a sub-prompt — just go back to menu
      } else {
        const msg = error instanceof Error ? error.message : String(error)
        logger.error(msg)
      }
    }

    console.log('')
  }
}

// ─── Inline action handlers (no process.exit, no Commander) ──────────

async function handleProjectAction(action: string, project: DetectedProject): Promise<string | void> {
  switch (action) {
    case 'dev': {
      const { runDev } = await import('../commands/dev.js')
      await runDev({ port: '3000', anvil: true })
      break
    }

    case 'deploy':
      await handleDeployInline()
      break

    case 'ai':
      await handleAiInline()
      break

    case 'chat':
      await handleChatInline()
      break

    case 'fix':
      await handleFixInline()
      break

    case 'deployments':
      await runInline('deployments')
      break

    case 'test':
      await handleTestInline()
      break

    case 'audit':
      await runInline('audit')
      break

    case 'switch':
      return await handleSwitchProject()
  }
}

async function handleDeployInline(): Promise<void> {
  const chain = await p.select({
    message: 'Which chain do you want to deploy to?',
    options: getChainSelectOptions(),
  })

  if (p.isCancel(chain)) return

  const chainSlug = chain as string

  if (chainSlug === 'localhost' || chainSlug === 'anvil') {
    await handleLocalDeploy()
  } else {
    try {
      await validateAuth()
    } catch {
      logger.error('API key is missing or invalid.')
      console.log('')
      const authAction = await p.select({
        message: 'Authenticate to deploy to remote chains:',
        options: [
          { value: 'enter-key', label: 'Enter API key' },
          { value: 'cancel', label: 'Cancel' },
        ],
      })

      if (p.isCancel(authAction) || authAction === 'cancel') return

      console.log(pc.dim(`  Get your API key at ${pc.underline('https://web3.market/dashboard/plan')}`))
      console.log('')
      const key = await p.text({
        message: 'Enter your API key:',
        placeholder: 'wm_sk_...',
        validate: (v) => (!v ? 'API key is required' : undefined),
      })
      if (p.isCancel(key)) return

      try {
        const { writeApiKey } = await import('../utils/credentials.js')
        writeApiKey(key as string)
        const client = createClient(key as string)
        await client.getMe()
        logger.success('Authenticated')
        console.log('')
      } catch {
        logger.error('Invalid API key. Check your key and try again.')
        logger.info(`Get your key at ${pc.underline('https://web3.market/dashboard/plan')}`)
        return
      }
    }

    const envReady = await guidedEnvSetup(chainSlug)
    if (!envReady) return

    const { runDeploy } = await import('../commands/deploy.js')
    await runDeploy({ chain: chainSlug })
  }
}

async function guidedEnvSetup(chain: string): Promise<boolean> {
  const rpcEnvKey = `${chain.toUpperCase().replace(/-/g, '_')}_RPC_URL`
  const hasRpc = !!process.env[rpcEnvKey]
  const hasDeployerKey = !!process.env.DEPLOYER_PRIVATE_KEY

  if (hasRpc && hasDeployerKey) return true

  const chainName = chain.charAt(0).toUpperCase() + chain.slice(1)
  console.log(pc.bold(`  ${chainName} Deployment Setup`))
  console.log(pc.dim('  You need an RPC URL and deployer private key.'))
  console.log('')

  let rpcUrl = process.env[rpcEnvKey] ?? ''
  let deployerKey = process.env.DEPLOYER_PRIVATE_KEY ?? ''

  if (!hasRpc) {
    console.log(pc.dim('  Get a free RPC URL from:'))
    console.log(`    ${pc.underline('https://www.alchemy.com')} or ${pc.underline('https://www.infura.io')}`)
    console.log('')

    const rpcResult = await p.text({
      message: `Enter your ${chainName} RPC URL:`,
      placeholder: 'https://eth-sepolia.g.alchemy.com/v2/...',
      validate: (v) => {
        if (!v) return 'RPC URL is required'
        if (!v.startsWith('http://') && !v.startsWith('https://')) return 'Must be a valid URL (https://...)'
        return undefined
      },
    })

    if (p.isCancel(rpcResult)) return false
    rpcUrl = rpcResult as string
  }

  if (!hasDeployerKey) {
    const keyResult = await p.text({
      message: 'Enter your deployer private key:',
      placeholder: '0x...',
      validate: (v) => {
        if (!v) return 'Private key is required'
        if (!/^0x[0-9a-fA-F]{64}$/.test(v)) return 'Must be 0x followed by 64 hex characters'
        return undefined
      },
    })

    if (p.isCancel(keyResult)) return false
    deployerKey = keyResult as string
  }

  // Save to .env in project root
  const fs = await import('fs-extra')
  const envPath = path.resolve(process.cwd(), '.env')
  let envContent = ''
  try {
    envContent = await fs.readFile(envPath, 'utf-8')
  } catch {
    // .env doesn't exist yet
  }

  const lines = envContent ? envContent.split('\n') : []

  if (!hasRpc) {
    const existingIdx = lines.findIndex((l) => l.startsWith(`${rpcEnvKey}=`))
    if (existingIdx >= 0) {
      lines[existingIdx] = `${rpcEnvKey}=${rpcUrl}`
    } else {
      lines.push(`${rpcEnvKey}=${rpcUrl}`)
    }
    process.env[rpcEnvKey] = rpcUrl
  }

  if (!hasDeployerKey) {
    const existingIdx = lines.findIndex((l) => l.startsWith('DEPLOYER_PRIVATE_KEY='))
    if (existingIdx >= 0) {
      lines[existingIdx] = `DEPLOYER_PRIVATE_KEY=${deployerKey}`
    } else {
      lines.push(`DEPLOYER_PRIVATE_KEY=${deployerKey}`)
    }
    process.env.DEPLOYER_PRIVATE_KEY = deployerKey
  }

  await fs.writeFile(envPath, lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n')
  console.log('')
  logger.success('Environment variables saved to .env')
  console.log(pc.dim('  Make sure .env is in your .gitignore — never commit private keys.'))
  console.log('')

  return true
}

async function handleLocalDeploy(): Promise<void> {
  const { runLocalDeploy } = await import('../commands/post-scaffold.js')
  await runLocalDeploy(process.cwd())
}

async function handleAiInline(): Promise<void> {
  const { runAiCustomize } = await import('../commands/ai.js')
  await runAiCustomize()
}

async function handleChatInline(): Promise<void> {
  const { runChatSession } = await import('../ai/chat.js')
  await runChatSession({ anvilRunning: true })
}

async function handleFixInline(): Promise<void> {
  const { runAiFix } = await import('../ai/fix.js')
  const cwd = process.cwd()
  await runAiFix({
    projectRoot: cwd,
    contractsDir: path.join(cwd, 'contracts'),
  })
}

async function handleTestInline(): Promise<void> {
  const contractsDir = path.join(process.cwd(), 'contracts')
  logger.step('Running contract tests...')
  try {
    await execa('forge', ['test', '-vv'], { cwd: contractsDir, stdio: 'inherit' })
  } catch {
    logger.warn('Some tests failed.')
  }
}

async function handleSwitchProject(): Promise<string | void> {
  const projects = listProjects()
  if (projects.length === 0) {
    logger.info('No other projects found.')
    return
  }

  const selected = await p.select({
    message: 'Select a project:',
    options: [
      ...projects.map((proj) => ({
        value: proj.path,
        label: proj.name,
        hint: proj.path.replace(process.env.HOME || '', '~'),
      })),
      { value: '_back', label: 'Back' },
    ],
  })

  if (p.isCancel(selected) || selected === '_back') return

  try {
    process.chdir(selected as string)
    // Return 'switched' — the caller's while(true) loop in showProjectMenu
    // will re-detect the project on next iteration via detectProject(process.cwd())
    return 'switched'
  } catch {
    logger.error(`Could not open project at ${selected}`)
  }
}

// ─── Fallback: run via Commander (for commands not yet inlined) ──────

class ProcessExitError extends Error {
  constructor(public exitCode: number) {
    super(`process.exit(${exitCode})`)
    this.name = 'ProcessExitError'
  }
}

async function runInline(command: string): Promise<void> {
  const { createCli } = await import('../cli.js')
  const program = createCli()
  program.exitOverride()

  const originalExit = process.exit
  process.exit = ((code?: number) => {
    throw new ProcessExitError(code ?? 0)
  }) as never

  try {
    await program.parseAsync(['node', 'w3m', ...command.split(' ')])
  } catch (err: any) {
    if (err instanceof ProcessExitError && err.exitCode === 0) return
    if (err?.exitCode !== undefined && err.exitCode === 0) return
    if (err?.code === 'commander.helpDisplayed') return
    if (err instanceof ProcessExitError) return
    if (p.isCancel(err)) return
    throw err
  } finally {
    process.exit = originalExit
  }
}

function showHelp(): void {
  console.log('')
  console.log(pc.bold('  Quick start'))
  console.log(`  ${pc.dim('\u25B8')} ${pc.cyan('w3m')}${pc.dim(' .............. ')}Interactive workspace`)
  console.log(`  ${pc.dim('\u25B8')} ${pc.cyan('w3m new')}${pc.dim(' .......... ')}Create token, dApp, or blank project`)
  console.log(`  ${pc.dim('\u25B8')} ${pc.cyan('w3m dev')}${pc.dim(' .......... ')}Local chain + frontend in one command`)
  console.log(`  ${pc.dim('\u25B8')} ${pc.cyan('w3m deploy')}${pc.dim(' ....... ')}Deploy to testnet or mainnet`)
  console.log(`  ${pc.dim('\u25B8')} ${pc.cyan('w3m fix')}${pc.dim(' .......... ')}AI-powered error repair`)
  console.log('')
  console.log(pc.bold('  Workflow'))
  console.log(`  ${pc.dim('1.')} Create a token or dApp from a template`)
  console.log(`  ${pc.dim('2.')} Dev environment auto-compiles, deploys to Anvil, starts frontend`)
  console.log(`  ${pc.dim('3.')} Customize with AI or edit manually`)
  console.log(`  ${pc.dim('4.')} Deploy to Sepolia, Base, Arbitrum, or any EVM chain`)
  console.log('')
  console.log(`  ${pc.dim('Docs')}  ${pc.underline('https://docs.web3.market')}`)
  console.log(`  ${pc.dim('Help')}  ${pc.underline('https://web3.market/support')}`)
  console.log('')
}
