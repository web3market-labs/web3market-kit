/**
 * Local scaffold service — renders templates from disk without needing the API server.
 *
 * Resolves the templates directory from the monorepo layout (packages/api/templates/).
 * Falls back gracefully if templates aren't found (e.g. when installed globally).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { ScaffoldManifest, ScaffoldFile } from './api-client.js'

// --- Resolve templates directory ---

function walkUpForTemplates(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'packages', 'api', 'templates')
    if (existsSync(join(candidate, 'manifests'))) {
      return resolve(candidate)
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function findTemplatesDir(): string | null {
  // Strategy 1: Direct relative path from this source file
  // packages/cli/src/utils/local-scaffold.ts → packages/api/templates/
  try {
    const __filename = fileURLToPath(import.meta.url)
    const thisDir = dirname(__filename)
    // From src/utils/ → ../../ → cli/ → ../ → packages/ → api/templates/
    const direct = resolve(thisDir, '..', '..', '..', 'api', 'templates')
    if (existsSync(join(direct, 'manifests'))) {
      return direct
    }
    // From dist/ (bundled) → ../ → cli/ → ../ → packages/ → api/templates/
    const fromDist = resolve(thisDir, '..', '..', 'api', 'templates')
    if (existsSync(join(fromDist, 'manifests'))) {
      return fromDist
    }
  } catch {}

  // Strategy 2: Walk up from the current file (import.meta.url)
  try {
    const __filename = fileURLToPath(import.meta.url)
    const result = walkUpForTemplates(dirname(__filename))
    if (result) return result
  } catch {}

  // Strategy 3: Walk up from the script being executed
  if (process.argv[1]) {
    const result = walkUpForTemplates(dirname(resolve(process.argv[1])))
    if (result) return result
  }

  // Strategy 4: Walk up from cwd
  const result = walkUpForTemplates(process.cwd())
  if (result) return result

  return null
}

let _templatesDir: string | null | undefined

function getTemplatesDir(): string | null {
  if (_templatesDir === undefined) {
    _templatesDir = findTemplatesDir()
  }
  return _templatesDir
}

// --- Handlebars helpers (mirrors packages/api/src/services/scaffold.ts) ---

const hbs = Handlebars.create()

hbs.registerHelper('toWei', (amount: string) => {
  const num = Number(amount)
  if (isNaN(num)) return '0'
  return `${amount}${'0'.repeat(18)}`
})

hbs.registerHelper('toBps', (percent: string) => {
  return `${Math.round(Number(percent) * 100)}`
})

hbs.registerHelper('toDays', (days: string) => {
  return `${Number(days) * 86400}`
})

hbs.registerHelper('capitalize', (str: string) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
})

hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b)
hbs.registerHelper('gt', (a: number, b: number) => a > b)
hbs.registerHelper('lt', (a: number, b: number) => a < b)

// --- Types ---

interface FileMapping {
  template: string
  output: string
}

interface Manifest {
  id: string
  slug: string
  displayName: string
  description: string
  version: string
  tier: 'free' | 'pro' | 'enterprise'
  category: string
  parameters: ScaffoldManifest['parameters']
  files: {
    contracts: FileMapping[]
    frontend: FileMapping[]
    shared: string[]
  }
  solidityDependencies: string[]
}

// --- Template rendering ---

function renderString(template: string, ctx: Record<string, unknown>): string {
  const processed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (value === false || value === 'false') {
      processed[key] = ''
    } else {
      processed[key] = value
    }
  }
  const compiled = hbs.compile(template, { noEscape: true })
  return compiled(processed)
}

function renderSharedDirectory(
  templatesDir: string,
  sharedDirName: string,
  outputPrefix: string,
  ctx: Record<string, unknown>,
): ScaffoldFile[] {
  const files: ScaffoldFile[] = []
  const dirPath = join(templatesDir, sharedDirName)

  if (!existsSync(dirPath)) return files

  function walk(currentDir: string, relativeBase: string): void {
    const entries = readdirSync(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        walk(fullPath, join(relativeBase, entry))
      } else if (entry.endsWith('.hbs')) {
        const outputName = entry.replace(/\.hbs$/, '')
        const outputPath = join(outputPrefix, relativeBase, outputName)
        const content = readFileSync(fullPath, 'utf-8')
        const rendered = renderString(content, ctx)
        files.push({ path: outputPath, content: rendered })
      }
    }
  }

  walk(dirPath, '')
  return files
}

// --- Public API ---

/**
 * Returns true if local templates are available (monorepo layout detected).
 */
export function hasLocalTemplates(): boolean {
  return getTemplatesDir() !== null
}

/**
 * Lists all available template manifests from local disk.
 */
export function listLocalManifests(): ScaffoldManifest[] {
  const dir = getTemplatesDir()
  if (!dir) return []

  const manifestsDir = join(dir, 'manifests')
  if (!existsSync(manifestsDir)) return []

  const files = readdirSync(manifestsDir).filter((f) => f.endsWith('.json'))
  const manifests: ScaffoldManifest[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(manifestsDir, file), 'utf-8')
      const m = JSON.parse(raw) as Manifest
      manifests.push({
        id: m.id,
        slug: m.slug,
        displayName: m.displayName,
        description: m.description,
        version: m.version,
        tier: m.tier,
        category: m.category,
        parameters: m.parameters,
      })
    } catch {
      // Skip invalid manifests
    }
  }

  return manifests
}

/**
 * Scaffolds a template locally (no API needed).
 */
export function scaffoldLocalTemplate(
  templateId: string,
  projectName: string,
  params: Record<string, string | boolean>,
): {
  success: boolean
  projectName: string
  template: string
  files: ScaffoldFile[]
  postInstall: {
    solidityDependencies: string[]
  }
} | null {
  const dir = getTemplatesDir()
  if (!dir) return null

  const manifestPath = join(dir, 'manifests', `${templateId}.json`)
  if (!existsSync(manifestPath)) return null

  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest
  } catch {
    return null
  }

  const ctx: Record<string, unknown> = {
    ...params,
    projectName,
    templateId: manifest.id,
    componentsArray: `'${templateId}'`,
  }

  const files: ScaffoldFile[] = []

  // 1. Render shared directories
  for (const sharedDir of manifest.files.shared) {
    let outputPrefix = ''
    if (sharedDir.includes('contracts')) outputPrefix = 'contracts'
    else if (sharedDir.includes('frontend')) outputPrefix = 'web'

    files.push(...renderSharedDirectory(dir, sharedDir, outputPrefix, ctx))
  }

  // 2. Render contract templates
  for (const mapping of manifest.files.contracts) {
    try {
      const template = readFileSync(join(dir, mapping.template), 'utf-8')
      const outputPath = renderString(mapping.output, ctx)
      const content = renderString(template, ctx)
      files.push({ path: outputPath, content: content })
    } catch (err) {
      console.error(`[scaffold] Failed to render: ${mapping.template}`, err)
    }
  }

  // 3. Render frontend templates
  for (const mapping of manifest.files.frontend) {
    try {
      const template = readFileSync(join(dir, mapping.template), 'utf-8')
      const outputPath = renderString(mapping.output, ctx)
      const content = renderString(template, ctx)
      files.push({ path: outputPath, content: content })
    } catch (err) {
      console.error(`[scaffold] Failed to render: ${mapping.template}`, err)
    }
  }

  return {
    success: true,
    projectName,
    template: templateId,
    files,
    postInstall: {
      solidityDependencies: manifest.solidityDependencies,
    },
  }
}
