interface TemplateMeta {
  id: number | string
  slug: string
  title: string
  description: string
  category: string
  tier: 'free' | 'pro' | 'enterprise'
  tags: string[]
  parameters: unknown[]
}

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const LARAVEL_API_URL = process.env.MARKETPLACE_API_URL || ''
const INTERNAL_SECRET = process.env.SDK_INTERNAL_SECRET || ''

let cachedTemplates: TemplateMeta[] = []
let lastFetch = 0

const FALLBACK_TEMPLATES: TemplateMeta[] = [
  { id: 'token-standard', slug: 'erc20-standard', title: 'Standard Token', description: 'Configurable ERC-20 with mint, burn, and pause', category: 'token', tier: 'free', tags: ['erc20', 'token'], parameters: [] },
  { id: 'token-tax', slug: 'erc20-tax', title: 'Tax Token', description: 'Buy/sell tax with treasury and anti-whale limits', category: 'token', tier: 'free', tags: ['erc20', 'tax'], parameters: [] },
  { id: 'token-meme', slug: 'erc20-meme', title: 'Meme Token', description: 'Fixed supply with anti-whale, auto-burn, trading controls', category: 'token', tier: 'free', tags: ['erc20', 'meme'], parameters: [] },
  { id: 'token-reflection', slug: 'erc20-reflection', title: 'Reflection Token', description: 'Holders earn passive rewards from every transaction', category: 'token', tier: 'free', tags: ['erc20', 'reflection'], parameters: [] },
]

async function fetchFromLaravel(): Promise<TemplateMeta[]> {
  if (!LARAVEL_API_URL) return FALLBACK_TEMPLATES

  const res = await fetch(`${LARAVEL_API_URL}/internal/templates`, {
    headers: { 'X-Internal-Secret': INTERNAL_SECRET, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Laravel returned ${res.status}`)
  const data = await res.json() as { data: TemplateMeta[] }
  return data.data
}

export const templateCache = {
  async getTemplates(): Promise<TemplateMeta[]> {
    const now = Date.now()
    if (cachedTemplates.length > 0 && (now - lastFetch) < CACHE_TTL) {
      return cachedTemplates
    }
    try {
      cachedTemplates = await fetchFromLaravel()
      lastFetch = now
    } catch {
      // Use stale cache or fallback
      if (cachedTemplates.length === 0) cachedTemplates = FALLBACK_TEMPLATES
    }
    return cachedTemplates
  },
}
