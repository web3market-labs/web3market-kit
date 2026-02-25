import path from 'node:path'
import { existsSync } from 'node:fs'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { detectProject } from '../core/project-detector.js'
import { runAiFix } from '../ai/fix.js'

export function fixCommand(): Command {
  return new Command('fix')
    .description('AI-powered build error fixing')
    .option('--auto', 'Skip confirmation prompts (apply fixes directly)')
    .option('--retries <n>', 'Max fix attempts (default: 3)', '3')
    .action(async (opts) => {
      try {
        await runFix(opts)
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Cancelled.')
          return
        }
        const message = error instanceof Error ? error.message : 'Fix failed'
        logger.error(message)
      }
    })
}

async function runFix(opts: { auto?: boolean; retries?: string }): Promise<void> {
  const project = detectProject(process.cwd())
  if (!project) {
    logger.error('Not inside a project directory. Run this command from your project root.')
    return
  }

  const contractsDir = path.join(project.path, 'contracts')
  if (!existsSync(contractsDir)) {
    logger.error('No contracts/ directory found in this project.')
    return
  }

  const parsed = parseInt(opts.retries ?? '3', 10)
  const maxRetries = Number.isNaN(parsed) || parsed < 1 ? 3 : Math.min(parsed, 10)
  const auto = opts.auto ?? false

  console.log('')
  console.log(pc.bold(`  Fixing ${pc.cyan(project.name)}...`))
  console.log('')

  const result = await runAiFix({
    projectRoot: project.path,
    contractsDir,
    maxRetries,
    auto,
  })

  if (result.success) {
    // Success message already printed by runAiFix
  } else if (result.attempts === 0) {
    // Build already passes or user cancelled setup — runAiFix already printed
  } else {
    console.log('')
    console.log(pc.dim('  What you can try:'))
    console.log(pc.dim('    1. Fix the errors manually, then run ') + pc.cyan('w3m fix') + pc.dim(' again'))
    console.log(pc.dim('    2. Run ') + pc.cyan('w3m fix --retries 5') + pc.dim(' for more AI attempts'))
    console.log(pc.dim('    3. Run ') + pc.cyan('w3m ai customize') + pc.dim(' for open-ended AI changes'))
  }
}
