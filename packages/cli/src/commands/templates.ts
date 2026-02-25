import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { ensureAuth } from '../utils/auth-guard.js'
import { createClient } from '../utils/api-client.js'

export function templatesCommand(): Command {
  return new Command('templates')
    .description('Browse available project templates')
    .option('-c, --category <category>', 'Filter by category')
    .action(async (opts) => {
      try {
        await runTemplates(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch templates'
        logger.error(message)
        process.exit(1)
      }
    })
}

async function runTemplates(opts: { category?: string }): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' Web3 Market — Templates ')))

  const { apiKey } = await ensureAuth()
  const client = createClient(apiKey)

  const spinner = p.spinner()
  spinner.start('Fetching templates...')

  try {
    const { templates } = await client.getTemplates(opts.category)
    spinner.stop(`Found ${templates.length} template(s)`)

    if (templates.length === 0) {
      p.note('No templates found for this category.', 'Empty')
      p.outro('')
      return
    }

    console.log('')
    for (const tmpl of templates) {
      const tierLabel = tmpl.tier === 'free'
        ? pc.green('FREE')
        : tmpl.tier === 'pro'
          ? pc.yellow('PRO')
          : pc.magenta('ENTERPRISE')

      console.log(`  ${tierLabel.padEnd(20)} ${pc.bold(tmpl.title)}`)
      console.log(`                     ${pc.dim(tmpl.description)}`)
      console.log(`                     ${pc.dim(`Category: ${tmpl.category} | Downloads: ${tmpl.download_count}`)}`)
      if (tmpl.tags.length > 0) {
        console.log(`                     ${pc.dim(`Tags: ${tmpl.tags.join(', ')}`)}`)
      }
      console.log('')
    }

    // Fetch categories
    try {
      const { categories } = await client.getTemplateCategories()
      if (categories.length > 0) {
        logger.info(`Categories: ${categories.join(', ')}`)
        logger.info(`Filter with: ${pc.bold('w3m templates --category <name>')}`)
      }
    } catch {
      // skip
    }

    p.outro(pc.dim(`Total: ${templates.length} template(s)`))
  } catch (err) {
    spinner.stop('Failed to load templates')
    throw err
  }
}
