import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { readApiKey, writeApiKey, clearApiKey } from '../utils/credentials.js'
import { createClient } from '../utils/api-client.js'

export function authCommand(): Command {
  const cmd = new Command('auth')
    .description('Authenticate with Web3 Market')
    .argument('[key]', 'API key (format: wm_sk_live_xxx or wm_sk_test_xxx)')
    .option('--status', 'Show current authentication status')
    .option('--logout', 'Clear stored credentials')
    .action(async (key?: string, opts?: { status?: boolean; logout?: boolean }) => {
      try {
        if (opts?.logout) {
          clearApiKey()
          logger.success('Logged out successfully.')
          return
        }

        if (opts?.status) {
          await showStatus()
          return
        }

        if (!key) {
          logger.error(`Usage: ${pc.bold('w3m auth <api-key>')}`)
          logger.info(`Get your API key at ${pc.underline('https://web3.market/dashboard/plan')}`)
          process.exit(1)
        }

        await authenticate(key)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed'
        logger.error(message)
        process.exit(1)
      }
    })

  return cmd
}

async function authenticate(key: string): Promise<void> {
  const spinner = p.spinner()
  spinner.start('Validating API key...')

  try {
    const client = createClient(key)
    const user = await client.getMe()

    writeApiKey(key)
    spinner.stop('API key validated!')

    console.log('')
    console.log(pc.bold('  Welcome back!'))
    console.log(`  Name:     ${user.name}`)
    console.log(`  Email:    ${user.email}`)
    console.log(`  Tier:     ${pc.bold(user.tier)}`)
    if (user.features.length > 0) {
      console.log(`  Features: ${user.features.join(', ')}`)
    }
    console.log('')
  } catch {
    spinner.stop('Validation failed')
    throw new Error(
      `Invalid API key. Check your key and try again.\n` +
        `  Get a new key at ${pc.underline('https://web3.market/dashboard/plan')}`,
    )
  }
}

async function showStatus(): Promise<void> {
  const apiKey = readApiKey()

  if (!apiKey) {
    logger.info('Not authenticated.')
    logger.info(`Run ${pc.bold('w3m auth <key>')} to authenticate.`)
    return
  }

  const spinner = p.spinner()
  spinner.start('Checking authentication...')

  try {
    const client = createClient(apiKey)
    const user = await client.getMe()

    spinner.stop('Authenticated')
    console.log('')
    console.log(`  Name:  ${user.name}`)
    console.log(`  Email: ${user.email}`)
    console.log(`  Tier:  ${pc.bold(user.tier)}`)
    console.log(`  Key:   ${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`)
    console.log('')
  } catch {
    spinner.stop('Authentication expired')
    logger.warn('Stored API key is invalid or expired.')
    logger.info(`Run ${pc.bold('w3m auth <key>')} with a new key.`)
  }
}
