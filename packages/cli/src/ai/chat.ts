import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { detectProject } from '../core/project-detector.js'
import { readApiKey } from '../utils/credentials.js'
import { getAiConfig, runAiSetup, type AiProviderConfig } from './config.js'
import { sendToAi, type AiMessage } from './client.js'
import { collectProjectContext, buildChatSystemPrompt } from './context.js'
import { parseAiChanges, showDiffPreview, applyChanges, type FileChange } from './diff.js'
import { ensureGitRepo, createSnapshot, listSnapshots, revertToSnapshot } from './snapshots.js'
import { rebuildProject } from './rebuild.js'

export interface ChatSessionOptions {
  anvilRunning?: boolean
}

export async function runChatSession(options?: ChatSessionOptions): Promise<void> {
  const cwd = process.cwd()
  const anvilRunning = options?.anvilRunning ?? true

  // 1. Validate project
  const project = detectProject(cwd)
  if (!project) {
    logger.error('Not inside a project directory. Run this command from your project root.')
    return
  }

  // 2. Check API key (hard gate)
  const apiKey = readApiKey()
  if (!apiKey) {
    logger.error('AI Chat requires a web3.market API key.')
    console.log(pc.dim(`  Get your key at ${pc.underline('https://web3.market/dashboard/plan')}`))
    console.log(pc.dim(`  Then run: ${pc.cyan('w3m auth')}`))
    return
  }

  // 3. Ensure AI provider configured
  let config = getAiConfig()
  if (!config) {
    console.log(pc.dim('  No AI provider configured. Let\'s set one up.'))
    console.log('')
    config = await runAiSetup()
    if (!config) return
    console.log('')
  }

  // 4. Git init + initial snapshot
  const projectRoot = project.path
  await ensureGitRepo(projectRoot)
  await createSnapshot(projectRoot, 'Chat session start')

  // 5. Show intro
  console.log('')
  console.log(pc.bold(`  AI Chat — ${pc.cyan(project.name)}`))
  console.log(pc.dim('  Describe changes and they\'ll be applied automatically.'))
  console.log(pc.dim('  Every change is snapshotted — use /revert to undo.'))
  console.log('')
  console.log(pc.dim('  Commands: /revert  /undo  /history  /help  /exit'))
  console.log('')

  // 6. Conversation loop
  const history: AiMessage[] = []

  while (true) {
    const input = await p.text({
      message: pc.cyan('You'),
      placeholder: 'Describe a change or ask a question...',
    })

    if (p.isCancel(input)) break

    const userInput = (input as string).trim()
    if (!userInput) continue

    // Handle slash commands
    if (userInput.startsWith('/')) {
      const shouldExit = await handleSlashCommand(userInput, projectRoot, anvilRunning)
      if (shouldExit) break
      continue
    }

    // Re-read project context each turn (files change between turns)
    const spinner = p.spinner()
    spinner.start('Reading project...')
    const context = await collectProjectContext(projectRoot)
    const systemPrompt = buildChatSystemPrompt(context)
    spinner.stop(`${context.contracts.length} contract(s), ${context.frontend.length} frontend file(s)`)

    // Add user message to history
    history.push({ role: 'user', content: userInput })

    // Send to AI
    const aiSpinner = p.spinner()
    aiSpinner.start('AI is thinking...')
    let response
    try {
      response = await sendToAi(config as AiProviderConfig, systemPrompt, history)
    } catch (error) {
      aiSpinner.stop('Failed')
      const message = error instanceof Error ? error.message : 'AI request failed'
      logger.error(message)
      // Remove the user message since we couldn't get a response
      history.pop()
      continue
    }
    aiSpinner.stop('Done')

    if (response.usage) {
      console.log(pc.dim(`  Tokens: ${response.usage.inputTokens} in, ${response.usage.outputTokens} out`))
    }

    // Parse response — try to extract changes
    let changes: FileChange[] = []
    let explanationText = ''
    try {
      changes = parseAiChanges(response.content)
      // Extract any text after the JSON array for explanation
      const arrayEnd = response.content.lastIndexOf(']')
      if (arrayEnd !== -1 && arrayEnd < response.content.length - 1) {
        explanationText = response.content.slice(arrayEnd + 1).trim()
        // Strip closing code block markers
        explanationText = explanationText.replace(/^```\s*/, '').trim()
      }
    } catch {
      // Parse failed — treat entire response as explanation
      changes = []
      explanationText = response.content
    }

    if (changes.length > 0) {
      // Show diff preview
      await showDiffPreview(changes)

      // Create pre-change snapshot
      await createSnapshot(projectRoot, `Before AI: ${userInput.slice(0, 60)}`)

      // Apply changes
      applyChanges(changes)
      logger.success(`${changes.length} file(s) updated`)

      // Show explanation if any
      if (explanationText) {
        console.log('')
        console.log(pc.dim('  ' + explanationText.split('\n').join('\n  ')))
      }

      // Check if .sol files changed — trigger rebuild
      const solChanged = changes.some((c) => c.path.endsWith('.sol'))
      if (solChanged) {
        const rebuildResult = await rebuildProject(projectRoot, { anvilRunning })

        if (!rebuildResult.buildSuccess && rebuildResult.buildErrors) {
          // Build failed — offer options
          await handleBuildFailure(
            projectRoot,
            rebuildResult.buildErrors,
            userInput,
            config as AiProviderConfig,
            history,
            anvilRunning,
          )
        }
      }

      // Create post-change snapshot
      await createSnapshot(projectRoot, `AI: ${userInput.slice(0, 60)}`)
    } else {
      // No changes — display explanation
      if (explanationText) {
        console.log('')
        console.log('  ' + explanationText.split('\n').join('\n  '))
      }
    }

    // Add assistant response to history
    history.push({ role: 'assistant', content: response.content })
    console.log('')
  }

  // Final snapshot on exit
  await createSnapshot(projectRoot, 'Chat session end')
  console.log('')
  logger.info('Chat session ended.')
}

async function handleSlashCommand(
  input: string,
  projectRoot: string,
  anvilRunning: boolean,
): Promise<boolean> {
  const [command, ...args] = input.split(/\s+/)
  const cmd = command!.toLowerCase()

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      return true

    case '/revert':
    case '/undo': {
      const hash = args[0]
      if (hash) {
        try {
          const snapshot = await revertToSnapshot(projectRoot, hash)
          logger.success(`Reverted to ${snapshot.hash}: ${snapshot.message}`)
          await rebuildProject(projectRoot, { anvilRunning })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Revert failed'
          logger.error(msg)
        }
      } else {
        // Interactive picker
        const snapshots = await listSnapshots(projectRoot)
        if (snapshots.length === 0) {
          logger.info('No snapshots available.')
          break
        }

        const selected = await p.select({
          message: 'Revert to which snapshot?',
          options: snapshots.map((s) => ({
            value: s.hash,
            label: `${s.hash} — ${s.message}`,
            hint: s.timestamp,
          })),
        })

        if (p.isCancel(selected)) break

        try {
          const snapshot = await revertToSnapshot(projectRoot, selected as string)
          logger.success(`Reverted to ${snapshot.hash}: ${snapshot.message}`)
          await rebuildProject(projectRoot, { anvilRunning })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Revert failed'
          logger.error(msg)
        }
      }
      break
    }

    case '/history': {
      const snapshots = await listSnapshots(projectRoot)
      if (snapshots.length === 0) {
        logger.info('No snapshots yet.')
        break
      }
      console.log('')
      console.log(pc.bold('  Snapshots:'))
      for (const s of snapshots) {
        console.log(`  ${pc.cyan(s.hash)} ${s.message} ${pc.dim(s.timestamp)}`)
      }
      console.log('')
      break
    }

    case '/help':
      console.log('')
      console.log(pc.bold('  Commands:'))
      console.log(`  ${pc.cyan('/revert [hash]')}  Revert to a previous snapshot`)
      console.log(`  ${pc.cyan('/undo')}           Alias for /revert`)
      console.log(`  ${pc.cyan('/history')}        Show recent snapshots`)
      console.log(`  ${pc.cyan('/help')}           Show this help`)
      console.log(`  ${pc.cyan('/exit')}           End chat session`)
      console.log('')
      break

    default:
      logger.warn(`Unknown command: ${cmd}. Type /help for available commands.`)
  }

  return false
}

async function handleBuildFailure(
  projectRoot: string,
  buildErrors: string,
  originalRequest: string,
  config: AiProviderConfig,
  history: AiMessage[],
  anvilRunning: boolean,
): Promise<void> {
  // Display errors
  console.log('')
  const lines = buildErrors.split('\n').filter(Boolean).slice(0, 30)
  for (const line of lines) {
    console.log(pc.dim('  ┃ ') + line)
  }
  console.log('')

  const action = await p.select({
    message: 'Build failed. What would you like to do?',
    options: [
      { value: 'fix', label: 'Auto-fix', hint: 'Let AI fix the compilation errors' },
      { value: 'refine', label: 'Refine request', hint: 'Give AI more instructions' },
      { value: 'revert', label: 'Revert', hint: 'Undo the last change' },
      { value: 'continue', label: 'Continue anyway', hint: 'Ignore build errors' },
    ],
  })

  if (p.isCancel(action)) return

  switch (action) {
    case 'fix': {
      const contractsDir = path.join(projectRoot, 'contracts')
      const { runAiFix } = await import('./fix.js')
      await runAiFix({
        projectRoot,
        contractsDir,
        errorOutput: buildErrors,
        auto: true,
      })
      break
    }

    case 'refine': {
      const refinement = await p.text({
        message: pc.cyan('Refine'),
        placeholder: 'Give additional instructions to fix the issue...',
      })
      if (p.isCancel(refinement) || !(refinement as string).trim()) break

      // Add a follow-up message about the build failure
      history.push({
        role: 'user',
        content: `The previous change caused a build error:\n${buildErrors.slice(0, 2000)}\n\nPlease fix: ${refinement as string}`,
      })

      const context = await collectProjectContext(projectRoot)
      const systemPrompt = buildChatSystemPrompt(context)

      const spinner = p.spinner()
      spinner.start('AI is fixing...')
      try {
        const response = await sendToAi(config, systemPrompt, history)
        spinner.stop('Done')

        const changes = parseAiChanges(response.content)
        if (changes.length > 0) {
          await showDiffPreview(changes)
          applyChanges(changes)
          logger.success(`${changes.length} file(s) updated`)
          await rebuildProject(projectRoot, { anvilRunning })
        }

        history.push({ role: 'assistant', content: response.content })
      } catch (error) {
        spinner.stop('Failed')
        const msg = error instanceof Error ? error.message : 'AI request failed'
        logger.error(msg)
        history.pop() // Remove the failed refinement message
      }
      break
    }

    case 'revert': {
      const snapshots = await listSnapshots(projectRoot, 2)
      if (snapshots.length >= 2) {
        try {
          const snapshot = await revertToSnapshot(projectRoot, snapshots[1]!.hash)
          logger.success(`Reverted to ${snapshot.hash}: ${snapshot.message}`)
          await rebuildProject(projectRoot, { anvilRunning })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Revert failed'
          logger.error(msg)
        }
      } else {
        logger.warn('No previous snapshot to revert to.')
      }
      break
    }

    case 'continue':
      logger.info('Continuing with build errors.')
      break
  }
}
