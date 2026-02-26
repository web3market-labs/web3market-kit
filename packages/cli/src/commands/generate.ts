import { Command } from 'commander'
import { logger } from '../utils/logger.js'

export function generateCommand(): Command {
  return new Command('generate')
    .alias('gen')
    .description('Run codegen pipeline to generate TypeScript bindings')
    .option('-w, --watch', 'Watch for contract changes and re-generate')
    .action(async (opts) => {
      try {
        await runGenerate(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Codegen failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

interface GenerateOptions {
  watch?: boolean
}

async function runGenerate(opts: GenerateOptions): Promise<void> {
  logger.step('Loading kit.config.ts...')
  let config: Record<string, unknown> = {}
  try {
    const { loadConfig } = await import('@web3marketlabs/config')
    config = await loadConfig()
    logger.success('Config loaded')
  } catch {
    logger.warn('Could not load kit.config.ts — using defaults')
  }

  logger.step('Running codegen pipeline...')
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: process.cwd(), ...config })
    logger.success('Codegen complete')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Codegen pipeline failed: ${detail}`)
  }

  if (opts.watch) {
    logger.info('Watching for contract changes... (press Ctrl+C to stop)')
  }
}
