import { Command } from 'commander'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { getAiConfig, runAiSetup } from '../ai/config.js'
import { sendToAi } from '../ai/client.js'
import { collectProjectContext, buildSystemPrompt } from '../ai/context.js'
import { parseAiChanges, showDiffPreview, applyChanges } from '../ai/diff.js'
import { detectProject } from '../core/project-detector.js'

export function aiCommand(): Command {
  const cmd = new Command('ai')
    .description('AI-powered code customization')

  cmd
    .command('setup')
    .description('Configure AI provider (Claude, GPT, or custom)')
    .action(async () => {
      try {
        await runAiSetup()
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Setup cancelled.')
          return
        }
        const message = error instanceof Error ? error.message : 'Setup failed'
        logger.error(message)
      }
    })

  cmd
    .command('customize')
    .description('Modify project code with AI assistance')
    .action(async () => {
      try {
        await runAiCustomize()
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Cancelled.')
          return
        }
        const message = error instanceof Error ? error.message : 'AI customization failed'
        logger.error(message)
      }
    })

  // Default action: run customize if no subcommand
  cmd.action(async () => {
    try {
      await runAiCustomize()
    } catch (error) {
      if (p.isCancel(error)) {
        p.cancel('Cancelled.')
        return
      }
      const message = error instanceof Error ? error.message : 'AI customization failed'
      logger.error(message)
    }
  })

  return cmd
}

export async function runAiCustomize(): Promise<void> {
  // Ensure we're in a project
  const project = detectProject(process.cwd())
  if (!project) {
    logger.error('Not inside a project directory. Run this command from your project root.')
    return
  }

  // Ensure AI is configured
  let config = getAiConfig()
  if (!config) {
    console.log(pc.dim('  No AI provider configured. Let\'s set one up.'))
    console.log('')
    config = await runAiSetup()
    if (!config) return
    console.log('')
  }

  // Collect project context
  const spinner = p.spinner()
  spinner.start('Reading project code...')
  const context = await collectProjectContext(process.cwd())
  spinner.stop(`${context.contracts.length} contract(s), ${context.frontend.length} frontend file(s)`)

  // Get user's request
  const request = await p.text({
    message: 'What would you like to change?',
    placeholder: 'Add a whitelist feature with merkle proof verification',
    validate: (v) => (!v ? 'Please describe what you want to change' : undefined),
  })

  if (p.isCancel(request)) return

  // Send to AI
  const systemPrompt = buildSystemPrompt(context)
  spinner.start('Thinking...')

  let response
  try {
    response = await sendToAi(config, systemPrompt, [
      { role: 'user', content: request as string },
    ])
  } catch (error) {
    spinner.stop('Failed')
    const message = error instanceof Error ? error.message : 'AI request failed'
    logger.error(message)
    return
  }

  spinner.stop('Changes ready')

  // Parse response into file changes
  let changes
  try {
    changes = parseAiChanges(response.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not parse AI response'
    logger.error(message)
    console.log('')
    console.log(pc.dim('  Raw AI response:'))
    console.log(pc.dim('  ' + response.content.slice(0, 500)))
    return
  }

  if (changes.length === 0) {
    logger.info('No file changes suggested by AI.')
    return
  }

  // Show usage info
  if (response.usage) {
    console.log(pc.dim(`  Tokens: ${response.usage.inputTokens} in, ${response.usage.outputTokens} out`))
  }

  // Show diff preview
  await showDiffPreview(changes)

  // Confirm
  const confirm = await p.confirm({ message: 'Apply these changes?' })
  if (p.isCancel(confirm) || !confirm) {
    logger.info('Changes discarded.')
    return
  }

  await applyChanges(changes)
  logger.success(`${changes.length} file(s) updated`)

  // Offer to run tests
  const hasContracts = changes.some((c) => c.path.endsWith('.sol'))
  if (hasContracts) {
    const runTests = await p.confirm({ message: 'Run tests to verify?' })
    if (!p.isCancel(runTests) && runTests) {
      try {
        await execa('forge', ['test'], { cwd: 'contracts', stdio: 'inherit' })
      } catch {
        logger.warn('Some tests failed — review the changes.')
      }
    }
  }
}
