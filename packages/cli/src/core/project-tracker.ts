/**
 * Auto-track helper for project-scoped commands.
 * If the cwd has kit.config.ts, either touch or auto-register.
 */

import { detectProject } from './project-detector.js'
import { findProject, registerProject, touchProject } from './project-store.js'

export function autoTrackProject(cwd: string): void {
  const detected = detectProject(cwd)
  if (!detected) return

  const existing = findProject(detected.path)
  if (existing) {
    touchProject(detected.path)
  } else {
    registerProject({
      name: detected.name,
      path: detected.path,
      components: detected.components,
      chains: detected.chains,
    })
  }
}
