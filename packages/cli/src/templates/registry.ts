import type { AppTemplate } from './types.js'
import { tokenLaunchTemplate } from './manifests/token-launch.js'

const templates: Record<string, AppTemplate> = {}

export function registerAppTemplate(template: AppTemplate): void {
  templates[template.id] = template
}

export function getAppTemplate(id: string): AppTemplate | undefined {
  return templates[id]
}

export function listAppTemplates(): AppTemplate[] {
  return Object.values(templates)
}

let _loaded = false

/**
 * Ensure built-in templates are loaded. Safe to call multiple times.
 */
export function ensureTemplatesLoaded(): void {
  if (_loaded) return
  registerAppTemplate(tokenLaunchTemplate)
  _loaded = true
}
