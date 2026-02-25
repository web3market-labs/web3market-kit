/**
 * Detect whether the current directory is a web3market project.
 * Checks for kit.config.ts in the given directory.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface DetectedProject {
  name: string
  path: string
  configPath: string
  components: string[]
  chains: string[]
  template: string | null
  frontend: 'next' | 'vite' | 'none'
  hasContracts: boolean
}

export function detectProject(cwd: string): DetectedProject | null {
  const configPath = join(cwd, 'kit.config.ts')
  if (!existsSync(configPath)) return null

  let components: string[] = []
  let chains: string[] = []
  let template: string | null = null

  try {
    const content = readFileSync(configPath, 'utf-8')

    // Parse components from config
    const componentsMatch = content.match(/components:\s*\[([\s\S]*?)\]/)
    if (componentsMatch?.[1]) {
      components = componentsMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean)
    }

    // Parse default chain from config
    const chainMatch = content.match(/default:\s*['"](\w+)['"]/)
    if (chainMatch?.[1]) {
      chains = [chainMatch[1]]
    }

    // Parse template from config
    const templateMatch = content.match(/template:\s*['"]([^'"]+)['"]/)
    if (templateMatch?.[1]) {
      template = templateMatch[1]
    }
  } catch {
    // Config exists but couldn't parse — still a valid project
  }

  // Detect frontend framework from filesystem
  const frontend = detectFrontend(cwd)

  // Detect if project has Solidity contracts
  const hasContracts = detectContracts(cwd)

  return {
    name: basename(cwd),
    path: cwd,
    configPath,
    components,
    chains,
    template,
    frontend,
    hasContracts,
  }
}

function detectFrontend(cwd: string): 'next' | 'vite' | 'none' {
  const webDir = join(cwd, 'web')
  if (!existsSync(webDir)) return 'none'

  // Check for Next.js config files
  const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts']
  for (const cfg of nextConfigs) {
    if (existsSync(join(webDir, cfg))) return 'next'
  }

  // Check for Vite config files
  const viteConfigs = ['vite.config.js', 'vite.config.mjs', 'vite.config.ts']
  for (const cfg of viteConfigs) {
    if (existsSync(join(webDir, cfg))) return 'vite'
  }

  // web/ dir exists but no recognizable framework — assume next (most common template)
  return 'next'
}

function detectContracts(cwd: string): boolean {
  const srcDir = join(cwd, 'contracts', 'src')
  if (!existsSync(srcDir)) return false

  try {
    const files = readdirSync(srcDir)
    return files.some((f) => f.endsWith('.sol'))
  } catch {
    return false
  }
}
