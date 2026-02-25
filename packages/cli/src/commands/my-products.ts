import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { ensureAuth } from '../utils/auth-guard.js'
import { createClient } from '../utils/api-client.js'

export function myProductsCommand(): Command {
  return new Command('my-products')
    .description('List your products on the Web3 Market marketplace')
    .action(async () => {
      try {
        await runMyProducts()
      } catch (error) {
        if (p.isCancel(error)) { p.cancel('Cancelled.'); process.exit(0) }
        const message = error instanceof Error ? error.message : 'Failed to fetch products'
        logger.error(message)
        process.exit(1)
      }
    })
}

async function runMyProducts(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' Web3 Market — My Products ')))

  const { apiKey } = await ensureAuth()
  const client = createClient(apiKey)

  const spinner = p.spinner()
  spinner.start('Fetching your products...')

  try {
    const result = await client.getMyProducts()
    spinner.stop('Products loaded')

    if ((result.data as any[]).length === 0) {
      p.note(
        "You haven't published any products yet.\n" +
          `Run ${pc.bold('w3m publish')} to publish your first product.`,
        'No products',
      )
      p.outro('')
      return
    }

    console.log('')
    const statusColors: Record<string, (s: string) => string> = {
      published: pc.green,
      pending: pc.yellow,
      rejected: pc.red,
      draft: pc.dim,
    }

    for (const product of result.data as any[]) {
      const colorFn = statusColors[product.status] || pc.dim
      const statusLabel = colorFn(product.status.toUpperCase().padEnd(10))
      const priceLabel = product.price === '0.00' || product.price === '0' ? pc.dim('Free') : pc.bold(`$${product.price}`)

      console.log(`  ${statusLabel} ${pc.bold(product.title)}`)
      console.log(`             ${pc.dim(product.tagline)}`)
      console.log(`             ${priceLabel}  ${pc.dim('|')}  ${product.views} views  ${pc.dim('|')}  ${product.sales} sales`)
      if (product.edit_url) console.log(`             ${pc.dim(`Edit: ${product.edit_url}`)}`)
      console.log('')
    }

    if (result.total > (result.data as any[]).length) {
      logger.info(`Showing ${(result.data as any[]).length} of ${result.total} products (page ${result.current_page}/${result.last_page})`)
    }

    p.outro(pc.dim(`Total: ${result.total} product(s)`))
  } catch (err) {
    spinner.stop('Failed to load products')
    throw err
  }
}
