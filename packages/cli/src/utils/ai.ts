/**
 * Lazy AI loader — routes AI calls through the Hono API server.
 * Returns a client if an API key is stored, null otherwise.
 */
import { readApiKey } from './credentials.js'
import { createClient } from './api-client.js'

export function getAiClient() {
  const apiKey = readApiKey()
  if (!apiKey) return null
  return createClient(apiKey)
}
