import { Hono } from 'hono'
import { tierGate } from '../middleware/tier-gate.js'

const ai = new Hono()

ai.use('/*', tierGate('pro'))

ai.post('/review', async (c) => {
  const { source, filename } = await c.req.json<{ source: string; filename: string }>()
  // Placeholder — in production, calls Claude API
  return c.json({ issues: [], summary: `Review of ${filename}: No critical issues found.` })
})

ai.post('/debug', async (c) => {
  const { error, context } = await c.req.json<{ error: string; context: string }>()
  return c.json({ suggestion: `For error "${error}": Check your contract parameters and ensure sufficient gas.` })
})

ai.post('/explain', async (c) => {
  const { source } = await c.req.json<{ source: string }>()
  return c.json({ explanation: 'This contract implements standard ERC-20 functionality with additional access control.' })
})

ai.post('/recommend', async (c) => {
  const { description } = await c.req.json<{ description: string }>()
  return c.json({ recommendations: ['Consider adding pausability for emergency stops', 'Add rate limiting for mint functions'] })
})

export { ai }
