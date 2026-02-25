import type { MiddlewareHandler } from 'hono'
import type { ApiKeyInfo } from './api-key-auth.js'

const windows = new Map<number, number[]>()
const WINDOW_MS = 60 * 1000
const CLEANUP_INTERVAL = 60 * 1000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup(): void {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [userId, timestamps] of windows) {
      const filtered = timestamps.filter((t) => t > cutoff)
      if (filtered.length === 0) windows.delete(userId)
      else windows.set(userId, filtered)
    }
  }, CLEANUP_INTERVAL)
  if (cleanupTimer.unref) cleanupTimer.unref()
}

export const rateLimiter: MiddlewareHandler = async (c, next) => {
  ensureCleanup()
  const apiKey = c.get('apiKey') as ApiKeyInfo | undefined
  if (!apiKey) { await next(); return }

  const { userId, rateLimits, tier } = apiKey
  const limit = rateLimits.perMinute
  const now = Date.now()
  let timestamps = (windows.get(userId) ?? []).filter((t) => t > now - WINDOW_MS)

  const remaining = Math.max(0, limit - timestamps.length)
  const resetAt = timestamps.length > 0 ? Math.ceil((timestamps[0]! + WINDOW_MS) / 1000) : Math.ceil((now + WINDOW_MS) / 1000)

  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(resetAt))

  if (timestamps.length >= limit) {
    const retryAfter = Math.ceil((timestamps[0]! + WINDOW_MS - now) / 1000)
    c.header('Retry-After', String(retryAfter))
    const upgradeHint = tier === 'free' ? ' Upgrade to Pro for 120 req/min.' : tier === 'pro' ? ' Upgrade to Enterprise for 600 req/min.' : ''
    return c.json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: `Rate limit exceeded (${limit}/min for ${tier} tier).${upgradeHint}`, retryAfter } }, 429)
  }

  timestamps.push(now)
  windows.set(userId, timestamps)
  await next()
}
