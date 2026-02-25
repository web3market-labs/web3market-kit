import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { apiKeyAuth, rateLimiter } from './middleware/index.js'
import { authMe } from './routes/auth-me.js'
import { templates } from './routes/templates.js'
import { deploy } from './routes/deploy.js'
import { ai } from './routes/ai.js'
import { token } from './routes/token.js'
import { marketplace } from './routes/marketplace.js'

const app = new Hono()

// 1. CORS (global)
app.use('/*', cors())

// 2. Health check (no auth)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// 3. Auth/me route (validates key itself)
app.route('/api/auth', authMe)

// 4. Global auth + rate limiting for all other /api routes
app.use('/api/*', apiKeyAuth)
app.use('/api/*', rateLimiter)

// 5. All authenticated routes
app.route('/api/templates', templates)
app.route('/api/deploy', deploy)
app.route('/api/ai', ai)
app.route('/api/token', token)
app.route('/api/marketplace', marketplace)

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] Server running at http://localhost:${port}`)
})

export { app }
export type { ApiKeyInfo } from './middleware/api-key-auth.js'
