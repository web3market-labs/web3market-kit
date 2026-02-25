import { Command } from 'commander'
import * as p from '@clack/prompts'
import { logger } from '../utils/logger.js'

export function chatCommand(): Command {
  return new Command('chat')
    .description('Interactive AI chat — modify your project through conversation')
    .option('--no-anvil', 'Skip Anvil integration for rebuilds')
    .action(async (opts) => {
      try {
        const { runChatSession } = await import('../ai/chat.js')
        await runChatSession({ anvilRunning: opts.anvil !== false })
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Cancelled.')
          return
        }
        const message = error instanceof Error ? error.message : 'Chat failed'
        logger.error(message)
      }
    })
}
