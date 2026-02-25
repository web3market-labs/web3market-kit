import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates')

// --- Handlebars helpers ---

Handlebars.registerHelper('toWei', (amount: string) => {
  const num = Number(amount)
  if (isNaN(num)) return '0'
  return `${amount}${'0'.repeat(18)}`
})

Handlebars.registerHelper('toBps', (percent: string) => {
  return `${Math.round(Number(percent) * 100)}`
})

Handlebars.registerHelper('toDays', (days: string) => {
  return `${Number(days) * 86400}`
})

Handlebars.registerHelper('capitalize', (str: string) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
})

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b)
Handlebars.registerHelper('gt', (a: number, b: number) => a > b)
Handlebars.registerHelper('lt', (a: number, b: number) => a < b)

// --- Types ---

export interface TemplateManifest {
  id: string
  slug: string
  displayName: string
  description: string
  version: string
  tier: 'free' | 'pro' | 'enterprise'
  category: string
  parameters: TemplateParameter[]
  files: {
    contracts: FileMapping[]
    frontend: FileMapping[]
    shared: string[]
  }
  solidityDependencies: string[]
}

export interface TemplateParameter {
  name: string
  prompt: string
  type: 'string' | 'boolean' | 'select'
  default?: string | boolean
  required?: boolean
  options?: { value: string; label: string; hint?: string }[]
}

interface FileMapping {
  template: string
  output: string
}

export interface ScaffoldResult {
  files: ScaffoldFile[]
  manifest: TemplateManifest
  postInstall: {
    solidityDependencies: string[]
  }
}

export interface ScaffoldFile {
  path: string
  content: string
}

// --- Manifest loading ---

const manifestCache = new Map<string, TemplateManifest>()

function loadManifest(templateId: string): TemplateManifest | null {
  if (manifestCache.has(templateId)) return manifestCache.get(templateId)!

  const manifestPath = join(TEMPLATES_DIR, 'manifests', `${templateId}.json`)
  if (!existsSync(manifestPath)) return null

  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as TemplateManifest
    manifestCache.set(templateId, manifest)
    return manifest
  } catch {
    return null
  }
}

export function getManifest(templateId: string): TemplateManifest | null {
  return loadManifest(templateId)
}

export function listManifests(): TemplateManifest[] {
  const manifestsDir = join(TEMPLATES_DIR, 'manifests')
  if (!existsSync(manifestsDir)) return []

  const files = readdirSync(manifestsDir).filter((f) => f.endsWith('.json'))
  const manifests: TemplateManifest[] = []

  for (const file of files) {
    const id = file.replace('.json', '')
    const manifest = loadManifest(id)
    if (manifest) manifests.push(manifest)
  }

  return manifests
}

// --- Template rendering ---

function renderString(template: string, ctx: Record<string, unknown>): string {
  // Convert false values to empty strings for Handlebars {{#if}} to work
  const processed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(ctx)) {
    if (value === false || value === 'false') {
      processed[key] = ''
    } else {
      processed[key] = value
    }
  }
  const compiled = Handlebars.compile(template, { noEscape: true })
  return compiled(processed)
}

function readTemplateFile(templatePath: string): string {
  const fullPath = join(TEMPLATES_DIR, templatePath)
  return readFileSync(fullPath, 'utf-8')
}

/**
 * Recursively collect all .hbs files from a shared directory,
 * render them, and return as ScaffoldFile entries.
 */
function renderSharedDirectory(
  sharedDirName: string,
  outputPrefix: string,
  ctx: Record<string, unknown>,
): ScaffoldFile[] {
  const files: ScaffoldFile[] = []
  const dirPath = join(TEMPLATES_DIR, sharedDirName)

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

// --- Main scaffold function ---

export function scaffoldTemplate(
  templateId: string,
  projectName: string,
  params: Record<string, string | boolean>,
): ScaffoldResult | null {
  const manifest = loadManifest(templateId)
  if (!manifest) return null

  const componentsArray = `'${templateId}'`
  const ctx: Record<string, unknown> = {
    ...params,
    projectName,
    templateId: manifest.id,
    componentsArray,
  }

  const files: ScaffoldFile[] = []

  // 1. Render shared directories (root, contracts config, frontend base)
  for (const sharedDir of manifest.files.shared) {
    // Map shared dir names to output prefixes:
    //   _shared/root     → project root (empty prefix)
    //   _shared/contracts → contracts/
    //   _shared/frontend  → web/
    let outputPrefix = ''
    if (sharedDir.includes('contracts')) outputPrefix = 'contracts'
    else if (sharedDir.includes('frontend')) outputPrefix = 'web'

    files.push(...renderSharedDirectory(sharedDir, outputPrefix, ctx))
  }

  // 2. Render contract templates
  for (const mapping of manifest.files.contracts) {
    try {
      const template = readTemplateFile(mapping.template)
      const outputPath = renderString(mapping.output, ctx)
      const content = renderString(template, ctx)
      files.push({ path: outputPath, content })
    } catch (err) {
      console.error(`[scaffold] Failed to render contract template: ${mapping.template}`, err)
    }
  }

  // 3. Render frontend templates
  for (const mapping of manifest.files.frontend) {
    try {
      const template = readTemplateFile(mapping.template)
      const outputPath = renderString(mapping.output, ctx)
      const content = renderString(template, ctx)
      files.push({ path: outputPath, content })
    } catch (err) {
      console.error(`[scaffold] Failed to render frontend template: ${mapping.template}`, err)
    }
  }

  return {
    files,
    manifest,
    postInstall: {
      solidityDependencies: manifest.solidityDependencies,
    },
  }
}
