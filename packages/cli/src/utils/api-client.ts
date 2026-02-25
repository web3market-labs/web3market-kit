/**
 * Single HTTP client for the Hono API (api.web3.market).
 * All CLI requests go through this — one endpoint, one header, one credential.
 */

const DEFAULT_BASE_URL = process.env.WEB3MARKET_API_URL || 'https://api.web3.market'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface UserInfo {
  id: number
  name: string
  email: string
  tier: 'free' | 'pro' | 'enterprise'
  features: string[]
}

export interface TemplateInfo {
  id: string | number
  slug: string
  title: string
  description: string
  category: string
  tier: 'free' | 'pro' | 'enterprise'
  tags: string[]
  parameters: TemplateParameter[]
  created_at: string
  download_count: number
}

export interface TemplateParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  prompt: string
  default?: string | number | boolean
  required?: boolean
  options?: { value: string; label: string; hint?: string }[]
}

export interface PreflightResult {
  allowed: boolean
  reason?: string
  tier_required?: string
}

export interface DeployRegistration {
  chain: string
  chain_id: number
  address: string
  tx_hash: string
  template_id?: string
}

export interface AiReviewResult {
  issues: { severity: 'critical' | 'warning' | 'info'; description: string; suggestion: string }[]
  summary: string
}

export interface ScaffoldFile {
  path: string
  content: string
}

export interface ScaffoldManifest {
  id: string
  slug: string
  displayName: string
  description: string
  version: string
  tier: 'free' | 'pro' | 'enterprise'
  category: string
  parameters: TemplateParameter[]
}

export interface ScaffoldResult {
  success: boolean
  projectName: string
  template: string
  files: ScaffoldFile[]
  postInstall: {
    solidityDependencies: string[]
  }
}

function createClient(apiKey?: string, baseUrl = DEFAULT_BASE_URL) {
  const base = baseUrl.replace(/\/$/, '')

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (apiKey) {
      headers.set('X-API-Key', apiKey)
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }
    if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }

    const response = await globalThis.fetch(`${base}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = await response.text()
      }
      const errorBody = body as { error?: { code?: string; message?: string } }
      throw new ApiError(
        errorBody?.error?.message || `API request failed: ${response.status}`,
        response.status,
        errorBody?.error?.code,
        body,
      )
    }

    return (await response.json()) as T
  }

  return {
    // Auth
    getMe: () => request<UserInfo>('/api/auth/me'),

    // Templates
    getTemplates: (category?: string) => {
      const params = category ? `?category=${encodeURIComponent(category)}` : ''
      return request<{ templates: TemplateInfo[] }>(`/api/templates${params}`)
    },
    getTemplate: (id: string) =>
      request<{ template: TemplateInfo }>(`/api/templates/${encodeURIComponent(id)}`),
    getTemplateDownloadUrl: (id: string) =>
      request<{ url: string; filename: string }>(`/api/templates/${encodeURIComponent(id)}/download`),
    getTemplateCategories: () =>
      request<{ categories: string[] }>('/api/templates/categories'),
    getTemplateManifest: (id: string) =>
      request<{ manifest: ScaffoldManifest }>(`/api/templates/${encodeURIComponent(id)}/manifest`),
    getScaffoldableTemplates: (opts?: { signal?: AbortSignal }) =>
      request<{ templates: ScaffoldManifest[] }>('/api/templates/scaffoldable', opts ? { signal: opts.signal } : {}),
    scaffoldTemplate: (id: string, projectName: string, params: Record<string, string | boolean>) =>
      request<ScaffoldResult>(`/api/templates/${encodeURIComponent(id)}/scaffold`, {
        method: 'POST',
        body: JSON.stringify({ projectName, params }),
      }),

    // Deploy
    preflight: (chain: string, chainId: number) =>
      request<PreflightResult>('/api/deploy/preflight', {
        method: 'POST',
        body: JSON.stringify({ chain, chain_id: chainId }),
      }),
    registerDeployment: (data: DeployRegistration) =>
      request<{ success: boolean }>('/api/deploy/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // AI
    aiReview: (source: string, filename: string) =>
      request<AiReviewResult>('/api/ai/review', {
        method: 'POST',
        body: JSON.stringify({ source, filename }),
      }),
    aiDebug: (error: string, context: string) =>
      request<{ suggestion: string }>('/api/ai/debug', {
        method: 'POST',
        body: JSON.stringify({ error, context }),
      }),
    aiExplain: (source: string) =>
      request<{ explanation: string }>('/api/ai/explain', {
        method: 'POST',
        body: JSON.stringify({ source }),
      }),
    aiRecommend: (description: string) =>
      request<{ recommendations: string[] }>('/api/ai/recommend', {
        method: 'POST',
        body: JSON.stringify({ description }),
      }),

    // Marketplace (proxied through Hono)
    publishProduct: (formData: FormData) =>
      request<{ success: boolean; product: { id: number; slug: string; title: string; status: string }; marketplace_url: string }>(
        '/api/marketplace/publish',
        { method: 'POST', body: formData as RequestInit['body'] },
      ),
    getMyProducts: (page = 1) =>
      request<{ success: boolean; data: unknown[]; current_page: number; last_page: number; total: number }>(
        `/api/marketplace/my-products?page=${page}`,
      ),
    uploadFile: (formData: FormData) =>
      request<{ success: boolean; url: string; filename: string; size: number }>(
        '/api/marketplace/upload',
        { method: 'POST', body: formData as RequestInit['body'] },
      ),
  }
}

export type ApiClient = ReturnType<typeof createClient>

export { createClient }
