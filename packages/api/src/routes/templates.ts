import { Hono } from 'hono'
import type { ApiKeyInfo } from '../middleware/api-key-auth.js'
import { templateCache } from '../services/template-cache.js'
import { scaffoldTemplate, getManifest, listManifests } from '../services/scaffold.js'

const LARAVEL_API_URL = process.env.MARKETPLACE_API_URL || ''
const INTERNAL_SECRET = process.env.SDK_INTERNAL_SECRET || ''

type Env = { Variables: { apiKey: ApiKeyInfo } }
const templates = new Hono<Env>()

templates.get('/', async (c) => {
  const apiKey = c.get('apiKey')
  const category = c.req.query('category')
  let all = await templateCache.getTemplates()

  // Filter by tier
  const tierRank: Record<string, number> = { free: 0, pro: 1, enterprise: 2 }
  const userRank = tierRank[apiKey.tier] ?? 0
  all = all.filter((t) => (tierRank[t.tier] ?? 0) <= userRank)

  if (category) all = all.filter((t) => t.category === category)

  return c.json({ templates: all })
})

templates.get('/categories', async (c) => {
  const all = await templateCache.getTemplates()
  const categories = [...new Set(all.map((t) => t.category))]
  return c.json({ categories })
})

templates.get('/scaffoldable', async (c) => {
  const apiKey = c.get('apiKey')
  const tierRank: Record<string, number> = { free: 0, pro: 1, enterprise: 2 }
  const userRank = tierRank[apiKey.tier] ?? 0
  const all = listManifests().filter((m) => (tierRank[m.tier] ?? 0) <= userRank)
  return c.json({ templates: all })
})

templates.get('/:id', async (c) => {
  const id = c.req.param('id')
  const all = await templateCache.getTemplates()
  const template = all.find((t) => String(t.id) === id || t.slug === id)
  if (!template) return c.json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } }, 404)
  return c.json({ template })
})

templates.get('/:id/download', async (c) => {
  const id = c.req.param('id')
  const apiKey = c.get('apiKey')
  const all = await templateCache.getTemplates()
  const template = all.find((t) => String(t.id) === id || t.slug === id)
  if (!template) return c.json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } }, 404)

  // Free templates skip purchase check
  if (template.tier !== 'free') {
    // Check purchase via Laravel internal API
    if (LARAVEL_API_URL) {
      try {
        const res = await fetch(
          `${LARAVEL_API_URL}/internal/user-purchases?user_id=${apiKey.userId}&product_id=${template.id}`,
          { headers: { 'X-Internal-Secret': INTERNAL_SECRET, Accept: 'application/json' } },
        )
        if (res.ok) {
          const data = await res.json() as { purchased: boolean }
          if (!data.purchased) {
            return c.json({ error: { code: 'NOT_PURCHASED', message: 'You must purchase this template before downloading.' } }, 403)
          }
        }
      } catch {
        // If Laravel is unreachable, deny for safety
        return c.json({ error: { code: 'PURCHASE_CHECK_FAILED', message: 'Unable to verify purchase.' } }, 503)
      }
    }
  }

  return c.json({ url: `https://api.web3.market/downloads/templates/${id}.zip`, filename: `${template.slug}.zip` })
})

// --- Scaffold endpoint: render template files server-side ---

templates.get('/:id/manifest', async (c) => {
  const id = c.req.param('id')
  const manifest = getManifest(id)
  if (!manifest) {
    return c.json({ error: { code: 'NOT_FOUND', message: `Template manifest "${id}" not found.` } }, 404)
  }
  return c.json({ manifest })
})

templates.post('/:id/scaffold', async (c) => {
  const id = c.req.param('id')
  const apiKey = c.get('apiKey')

  // Parse request body
  let body: { projectName: string; params: Record<string, string | boolean> }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Request body must be JSON with projectName and params.' } }, 400)
  }

  if (!body.projectName || typeof body.projectName !== 'string') {
    return c.json({ error: { code: 'MISSING_PROJECT_NAME', message: 'projectName is required.' } }, 400)
  }

  if (!body.params || typeof body.params !== 'object') {
    return c.json({ error: { code: 'MISSING_PARAMS', message: 'params object is required.' } }, 400)
  }

  // Check manifest exists
  const manifest = getManifest(id)
  if (!manifest) {
    return c.json({ error: { code: 'NOT_FOUND', message: `Template "${id}" not found.` } }, 404)
  }

  // Tier check
  const tierRank: Record<string, number> = { free: 0, pro: 1, enterprise: 2 }
  const userRank = tierRank[apiKey.tier] ?? 0
  if ((tierRank[manifest.tier] ?? 0) > userRank) {
    return c.json({ error: { code: 'TIER_REQUIRED', message: `This template requires a ${manifest.tier} plan.` } }, 403)
  }

  // Purchase check for paid templates
  if (manifest.tier !== 'free' && LARAVEL_API_URL) {
    try {
      const res = await fetch(
        `${LARAVEL_API_URL}/internal/user-purchases?user_id=${apiKey.userId}&product_id=${manifest.id}`,
        { headers: { 'X-Internal-Secret': INTERNAL_SECRET, Accept: 'application/json' } },
      )
      if (res.ok) {
        const data = await res.json() as { purchased: boolean }
        if (!data.purchased) {
          return c.json({ error: { code: 'NOT_PURCHASED', message: 'You must purchase this template first.' } }, 403)
        }
      }
    } catch {
      return c.json({ error: { code: 'PURCHASE_CHECK_FAILED', message: 'Unable to verify purchase.' } }, 503)
    }
  }

  // Scaffold
  const result = scaffoldTemplate(id, body.projectName, body.params)
  if (!result) {
    return c.json({ error: { code: 'SCAFFOLD_FAILED', message: 'Failed to scaffold template.' } }, 500)
  }

  return c.json({
    success: true,
    projectName: body.projectName,
    template: manifest.id,
    files: result.files,
    postInstall: result.postInstall,
  })
})

export { templates }
