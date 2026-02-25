import type { MiddlewareHandler } from 'hono'
import type { ApiKeyInfo } from './api-key-auth.js'

const TIER_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 }

export function tierGate(minTier: 'pro' | 'enterprise'): MiddlewareHandler {
  return async (c, next) => {
    const apiKey = c.get('apiKey') as ApiKeyInfo | undefined
    if (!apiKey) return c.json({ error: { code: 'MISSING_API_KEY', message: 'Authentication required.' } }, 401)

    const userRank = TIER_RANK[apiKey.tier] ?? 0
    const requiredRank = TIER_RANK[minTier] ?? 1
    if (userRank < requiredRank) {
      return c.json({
        error: {
          code: 'TIER_REQUIRED', message: `This feature requires a ${minTier} plan or higher. Your current plan: ${apiKey.tier}.`,
          requiredTier: minTier, currentTier: apiKey.tier, upgradeUrl: 'https://web3.market/pricing',
        },
      }, 403)
    }
    await next()
  }
}
