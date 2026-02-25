import { Hono } from 'hono'
import { MOCK_PRODUCTS } from '../mock-data.js'
import { tierGate } from '../middleware/tier-gate.js'

const MARKETPLACE_API_URL = process.env.MARKETPLACE_API_URL || ''

const marketplace = new Hono()

marketplace.post('/publish', tierGate('pro'), async (c) => {
  if (MARKETPLACE_API_URL) {
    // Production: proxy to Laravel
    const authHeader = c.req.header('Authorization')
    if (!authHeader) return c.json({ success: false, error: 'Unauthorized' }, 401)
    try {
      const formData = await c.req.formData()
      const title = (formData.get('title') as string) || 'Untitled'
      const response = await fetch(`${MARKETPLACE_API_URL}/products`, {
        method: 'POST', headers: { Authorization: authHeader, Accept: 'application/json' }, body: formData,
      })
      const data = await response.json()
      if (!response.ok) return c.json({ success: false, error: 'Publish failed' }, response.status as 422)
      const product = data as { id: number; slug: string; title: string; status: string }
      return c.json({ success: true, product, marketplace_url: `https://web3.market/product/${product.slug}` })
    } catch { return c.json({ success: false, error: 'Failed to publish' }, 502) }
  }
  // Mock
  const formData = await c.req.formData()
  const title = (formData.get('title') as string) || 'Untitled'
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return c.json({ success: true, product: { id: Math.floor(Math.random() * 10000), slug, title, status: 'pending' }, marketplace_url: `https://web3.market/product/${slug}` })
})

marketplace.get('/my-products', async (c) => {
  if (MARKETPLACE_API_URL) {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) return c.json({ success: false, error: 'Unauthorized' }, 401)
    try {
      const page = c.req.query('page') || '1'
      const response = await fetch(`${MARKETPLACE_API_URL}/my-products?page=${page}`, { headers: { Authorization: authHeader, Accept: 'application/json' } })
      const data = await response.json()
      if (!response.ok) return c.json({ success: false, error: 'Failed to fetch' }, response.status as 401)
      return c.json({ success: true, ...(data as object) })
    } catch { return c.json({ success: false, error: 'Marketplace unreachable' }, 502) }
  }
  return c.json({ success: true, data: MOCK_PRODUCTS, current_page: 1, last_page: 1, total: MOCK_PRODUCTS.length })
})

export { marketplace }
