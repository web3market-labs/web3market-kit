import { Hono } from 'hono'
import { extractApiKey } from '../middleware/api-key-auth.js'

const LARAVEL_API_URL = process.env.MARKETPLACE_API_URL || ''
const INTERNAL_SECRET = process.env.SDK_INTERNAL_SECRET || ''

const authMe = new Hono()

authMe.get('/me', async (c) => {
  const rawKey = extractApiKey(c)
  if (!rawKey) {
    return c.json({ error: { code: 'MISSING_API_KEY', message: 'API key required.' } }, 401)
  }

  if (LARAVEL_API_URL) {
    try {
      const response = await fetch(`${LARAVEL_API_URL}/api-keys/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
        body: JSON.stringify({ key: rawKey }),
      })
      if (!response.ok) return c.json({ error: { code: 'INVALID_API_KEY', message: 'API key is invalid.' } }, 401)

      const data = await response.json() as { valid: boolean; user_id: number; name: string; email: string; tier: string; features: string[] }
      if (!data.valid) return c.json({ error: { code: 'INVALID_API_KEY', message: 'API key is invalid.' } }, 401)

      return c.json({ id: data.user_id, name: data.name, email: data.email, tier: data.tier, features: data.features })
    } catch {
      return c.json({ error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Auth service unavailable.' } }, 503)
    }
  }

  // Mock mode
  return c.json({ id: 1, name: 'Dev User', email: 'dev@web3.market', tier: 'pro', features: ['deploy', 'ai', 'templates'] })
})

export { authMe }
