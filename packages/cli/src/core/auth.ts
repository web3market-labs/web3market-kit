/**
 * Pure auth validation — no process.exit, no CLI output.
 * Throws AuthError on failure so callers can handle it their way.
 */

import { readApiKey } from '../utils/credentials.js'
import { createClient, type UserInfo } from '../utils/api-client.js'
import { AuthError } from './types.js'

export async function validateAuth(): Promise<{ apiKey: string; user: UserInfo }> {
  const apiKey = readApiKey()

  if (!apiKey) {
    throw new AuthError('NOT_AUTHENTICATED', 'No API key found. Run: w3m auth <key>')
  }

  try {
    const client = createClient(apiKey)
    const user = await client.getMe()
    return { apiKey, user }
  } catch {
    throw new AuthError('INVALID_KEY', 'API key is invalid or expired. Run: w3m auth <key> with a new key.')
  }
}
