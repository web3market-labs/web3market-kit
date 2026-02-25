import { Hono } from 'hono'
import type { ApiKeyInfo } from '../middleware/api-key-auth.js'

type Env = { Variables: { apiKey: ApiKeyInfo } }
const deploy = new Hono<Env>()

const MAINNET_CHAIN_IDS = [1, 42161, 8453, 137, 10]

deploy.post('/preflight', async (c) => {
  const apiKey = c.get('apiKey')
  const body = await c.req.json<{ chain: string; chain_id: number }>()
  const isMainnet = MAINNET_CHAIN_IDS.includes(body.chain_id)

  if (isMainnet && apiKey.tier === 'free') {
    return c.json({ allowed: false, reason: 'Mainnet deployment requires a Pro plan.', tier_required: 'pro' })
  }

  return c.json({ allowed: true })
})

deploy.post('/register', async (c) => {
  const body = await c.req.json<{ chain: string; chain_id: number; address: string; tx_hash: string; template_id?: string }>()
  // In production, store deployment analytics
  return c.json({ success: true })
})

export { deploy }
