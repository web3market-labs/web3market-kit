/**
 * CRUD for ~/.web3market/projects.json
 * Tracks projects the user has created or worked in.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'

const STORE_DIR = join(homedir(), '.web3market')
const STORE_FILE = join(STORE_DIR, 'projects.json')

export interface TrackedProject {
  name: string
  path: string
  createdAt: string
  lastOpenedAt: string
  components: string[]
  chains: string[]
}

function readStore(): TrackedProject[] {
  try {
    if (!existsSync(STORE_FILE)) return []
    const raw = readFileSync(STORE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(projects: TrackedProject[]): void {
  mkdirSync(STORE_DIR, { recursive: true })
  writeFileSync(STORE_FILE, JSON.stringify(projects, null, 2), 'utf-8')
}

export function listProjects(): TrackedProject[] {
  return readStore().sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  )
}

export function findProject(nameOrPath: string): TrackedProject | undefined {
  const projects = readStore()
  return projects.find((p) => p.name === nameOrPath || p.path === nameOrPath)
}

export function registerProject(project: Omit<TrackedProject, 'createdAt' | 'lastOpenedAt'>): TrackedProject {
  const projects = readStore()
  const existing = projects.find((p) => p.path === project.path)

  if (existing) {
    existing.lastOpenedAt = new Date().toISOString()
    existing.components = project.components
    existing.chains = project.chains
    writeStore(projects)
    return existing
  }

  const entry: TrackedProject = {
    ...project,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  }

  projects.push(entry)
  writeStore(projects)
  return entry
}

export function touchProject(projectPath: string): void {
  const projects = readStore()
  const project = projects.find((p) => p.path === projectPath)

  if (project) {
    project.lastOpenedAt = new Date().toISOString()
    writeStore(projects)
  }
}

export function removeProject(name: string): boolean {
  const projects = readStore()
  const index = projects.findIndex((p) => p.name === name)

  if (index === -1) return false

  projects.splice(index, 1)
  writeStore(projects)
  return true
}
