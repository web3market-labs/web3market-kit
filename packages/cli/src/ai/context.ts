import fs from 'node:fs/promises'
import path from 'node:path'

export interface ProjectContext {
  contracts: Array<{ path: string; content: string }>
  frontend: Array<{ path: string; content: string }>
  config: string
  template?: string
}

const MAX_CONTEXT_SIZE = 100_000

export async function collectProjectContext(projectRoot: string): Promise<ProjectContext> {
  const context: ProjectContext = {
    contracts: [],
    frontend: [],
    config: '',
  }

  let totalSize = 0

  // Read kit.config.ts
  try {
    const configPath = path.join(projectRoot, 'kit.config.ts')
    context.config = await fs.readFile(configPath, 'utf-8')
    totalSize += context.config.length
  } catch {
    // No config file
  }

  // Read Solidity files from contracts/src/ and contracts/script/
  const contractsDirs = [
    path.join(projectRoot, 'contracts', 'src'),
    path.join(projectRoot, 'contracts', 'script'),
    path.join(projectRoot, 'contracts', 'test'),
  ]

  for (const dir of contractsDirs) {
    const files = await collectFiles(dir, ['.sol'])
    for (const file of files) {
      if (totalSize > MAX_CONTEXT_SIZE) break
      try {
        const content = await fs.readFile(file, 'utf-8')
        const relativePath = path.relative(projectRoot, file)
        context.contracts.push({ path: relativePath, content })
        totalSize += content.length
      } catch {}
    }
  }

  // Read key frontend files from web/
  const webDir = path.join(projectRoot, 'web')
  const frontendDirs = [
    path.join(webDir, 'app'),
    path.join(webDir, 'components'),
    path.join(webDir, 'hooks'),
    path.join(webDir, 'lib'),
  ]

  for (const dir of frontendDirs) {
    const files = await collectFiles(dir, ['.ts', '.tsx'])
    for (const file of files) {
      if (totalSize > MAX_CONTEXT_SIZE) break
      // Skip node_modules, .next, generated files
      if (file.includes('node_modules') || file.includes('.next') || file.includes('generated')) continue
      try {
        const content = await fs.readFile(file, 'utf-8')
        const relativePath = path.relative(projectRoot, file)
        context.frontend.push({ path: relativePath, content })
        totalSize += content.length
      } catch {}
    }
  }

  return context
}

async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'lib') continue
        const nested = await collectFiles(fullPath, extensions)
        results.push(...nested)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return results
}

export function buildSystemPrompt(context: ProjectContext): string {
  const parts: string[] = []

  parts.push(`You are a Web3 smart contract and frontend developer. You are modifying an existing dApp project built with the Web3 Market dApp Kit.

Rules:
- Only modify existing files, don't create new ones unless absolutely necessary
- Keep all changes compatible with the existing architecture
- Use OpenZeppelin v5.x patterns for Solidity
- Use wagmi v2 hooks for frontend
- Maintain existing code style and patterns
- Return changes as a JSON array: [{ "path": "relative/path", "content": "full file content" }]
- Only include files that actually changed
- Do NOT include explanations outside the JSON — just return the JSON array`)

  appendProjectContext(parts, context)

  return parts.join('\n')
}

export function buildChatSystemPrompt(context: ProjectContext): string {
  const parts: string[] = []

  parts.push(`You are a Web3 smart contract and frontend developer. You are in a multi-turn conversation helping modify an existing dApp project built with the Web3 Market dApp Kit.

Rules:
- Apply changes incrementally — only modify what the user asks for in each turn
- Only modify existing files, don't create new ones unless absolutely necessary
- Keep all changes compatible with the existing architecture
- Use OpenZeppelin v5.x patterns for Solidity
- Use wagmi v2 hooks for frontend
- Maintain existing code style and patterns
- Return changes as a JSON array: [{ "path": "relative/path", "content": "full file content" }]
- Only include files that actually changed
- If the user asks a question and no code changes are needed, return an empty array [] followed by your explanation
- You may include explanatory text AFTER the JSON array`)

  appendProjectContext(parts, context)

  return parts.join('\n')
}

function appendProjectContext(parts: string[], context: ProjectContext): void {
  if (context.config) {
    parts.push(`\n--- kit.config.ts ---\n${context.config}`)
  }

  if (context.contracts.length > 0) {
    parts.push('\n--- Contracts ---')
    for (const c of context.contracts) {
      parts.push(`\n--- ${c.path} ---\n${c.content}`)
    }
  }

  if (context.frontend.length > 0) {
    parts.push('\n--- Frontend ---')
    for (const f of context.frontend) {
      parts.push(`\n--- ${f.path} ---\n${f.content}`)
    }
  }
}
