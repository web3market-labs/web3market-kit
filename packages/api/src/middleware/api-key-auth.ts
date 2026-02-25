import type { Context, MiddlewareHandler } from 'hono'

export interface ApiKeyInfo {
  tier: 'free' | 'pro' | 'enterprise'
  userId: number
  features: string[]
  rateLimits: { perMinute: number; daily: number }
}

interface CacheEntry {
  info: ApiKeyInfo | null
  cachedAt: number
}

const VALID_TTL = 5 * 60 * 1000
const INVALID_TTL = 60 * 1000
const STALE_TTL = 30 * 60 * 1000
const KEY_FORMAT = /^wm_sk_(live|test)_[a-f0-9]{32}$/

const keyCache = new Map<string, CacheEntry>()

const LARAVEL_API_URL = process.env.MARKETPLACE_API_URL || ''
const INTERNAL_SECRET = process.env.SDK_INTERNAL_SECRET || ''

function extractApiKey(c: Context): string | null {
  const xApiKey = c.req.header('X-API-Key')
  if (xApiKey) return xApiKey
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer wm_sk_')) return authHeader.slice(7)
  return null
}

async function validateWithLaravel(rawKey: string): Promise<ApiKeyInfo | null> {
  if (!LARAVEL_API_URL) return null
  const response = await fetch(`${LARAVEL_API_URL}/api-keys/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
    body: JSON.stringify({ key: rawKey }),
  })
  if (!response.ok) return null
  const data = await response.json() as {
    valid: boolean; tier: string; user_id: number; features: string[]; rate_limits: { per_minute: number; daily: number }
  }
  if (!data.valid) return null
  return {
    tier: data.tier as ApiKeyInfo['tier'],
    userId: data.user_id,
    features: data.features,
    rateLimits: { perMinute: data.rate_limits.per_minute, daily: data.rate_limits.daily },
  }
}

const DEV_MODE = process.env.WEB3MARKET_DEV_MODE === 'true'

const DEV_API_KEY_INFO: ApiKeyInfo = {
  tier: 'enterprise',
  userId: 0,
  features: ['all'],
  rateLimits: { perMinute: 9999, daily: 999999 },
}

export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  // Dev mode: skip auth entirely, use mock enterprise key
  if (DEV_MODE) {
    c.set('apiKey', DEV_API_KEY_INFO)
    await next()
    return
  }

  const rawKey = extractApiKey(c)
  if (!rawKey) {
    return c.json({ error: { code: 'MISSING_API_KEY', message: 'API key required. Get one at https://web3.market/settings/api-keys' } }, 401)
  }
  if (!KEY_FORMAT.test(rawKey)) {
    return c.json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key format. Keys look like: wm_sk_live_a3f8c92d1e4b7f6a0c5d2e9b8a7f4c3d' } }, 401)
  }

  const now = Date.now()
  const cached = keyCache.get(rawKey)
  if (cached) {
    const age = now - cached.cachedAt
    const ttl = cached.info ? VALID_TTL : INVALID_TTL
    if (age < ttl) {
      if (!cached.info) return c.json({ error: { code: 'INVALID_API_KEY', message: 'API key is invalid or has been revoked.' } }, 401)
      c.set('apiKey', cached.info)
      await next()
      return
    }
  }

  try {
    const info = await validateWithLaravel(rawKey)
    keyCache.set(rawKey, { info, cachedAt: now })
    if (!info) return c.json({ error: { code: 'INVALID_API_KEY', message: 'API key is invalid or has been revoked.' } }, 401)
    c.set('apiKey', info)
    await next()
  } catch {
    if (cached?.info && (now - cached.cachedAt) < STALE_TTL) {
      c.set('apiKey', cached.info)
      await next()
      return
    }
    return c.json({ error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication service temporarily unavailable.' } }, 503)
  }
}

export { extractApiKey }
