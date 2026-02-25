import { validateAuth } from '../core/auth.js'
import { readApiKey } from './credentials.js'
import { logger } from './logger.js'
import pc from 'picocolors'
import type { UserInfo } from './api-client.js'

/**
 * CLI adapter — validates auth and throws on failure with a user-friendly message.
 * Callers (Commander action handlers) catch and call process.exit themselves.
 */
export async function ensureAuth(): Promise<{ apiKey: string; user: UserInfo }> {
  try {
    return await validateAuth()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Authentication failed'
    logger.error(message)
    logger.info(`Get your API key at ${pc.underline('https://web3.market/dashboard/plan')}`)
    throw e
  }
}

/**
 * Read API key without validation. Returns null if not set.
 */
export function getApiKeyQuiet(): string | null {
  return readApiKey()
}
