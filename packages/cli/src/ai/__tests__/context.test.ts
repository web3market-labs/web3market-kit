import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectProjectContext, buildSystemPrompt, buildChatSystemPrompt, type ProjectContext } from '../context.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}))

import fs from 'node:fs/promises'

const mockReadFile = vi.mocked(fs.readFile)
const mockReaddir = vi.mocked(fs.readdir)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── collectProjectContext ────────────────────────────────────────────────────

describe('collectProjectContext', () => {
  it('returns empty context when no files exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockReaddir.mockRejectedValue(new Error('ENOENT'))

    const context = await collectProjectContext('/project')

    expect(context.contracts).toEqual([])
    expect(context.frontend).toEqual([])
    expect(context.config).toBe('')
  })

  it('reads kit.config.ts when present', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if (String(p).endsWith('kit.config.ts')) {
        return 'export default { template: "token-erc20" }' as any
      }
      throw new Error('ENOENT')
    })
    mockReaddir.mockRejectedValue(new Error('ENOENT'))

    const context = await collectProjectContext('/project')

    expect(context.config).toBe('export default { template: "token-erc20" }')
  })

  it('collects Solidity files from contracts/src, script, test', async () => {
    const mockDirent = (name: string, isDir: boolean) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    })

    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p)
      if (pathStr.endsWith('kit.config.ts')) throw new Error('ENOENT')
      if (pathStr.endsWith('Token.sol')) return '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;' as any
      if (pathStr.endsWith('Deploy.s.sol')) return '// deploy script' as any
      throw new Error('ENOENT')
    })

    mockReaddir.mockImplementation(async (dir) => {
      const dirStr = String(dir)
      if (dirStr.endsWith('src')) {
        return [mockDirent('Token.sol', false)] as any
      }
      if (dirStr.endsWith('script')) {
        return [mockDirent('Deploy.s.sol', false)] as any
      }
      return []
    })

    const context = await collectProjectContext('/project')

    expect(context.contracts).toHaveLength(2)
    expect(context.contracts[0]!.path).toContain('Token.sol')
    expect(context.contracts[1]!.path).toContain('Deploy.s.sol')
  })

  it('collects frontend .ts and .tsx files from web/', async () => {
    const mockDirent = (name: string, isDir: boolean) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    })

    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p)
      if (pathStr.endsWith('kit.config.ts')) throw new Error('ENOENT')
      if (pathStr.endsWith('page.tsx')) return '<div>Hello</div>' as any
      if (pathStr.endsWith('useToken.ts')) return 'export function useToken() {}' as any
      throw new Error('ENOENT')
    })

    mockReaddir.mockImplementation(async (dir) => {
      const dirStr = String(dir)
      if (dirStr.endsWith('app')) return [mockDirent('page.tsx', false)] as any
      if (dirStr.endsWith('hooks')) return [mockDirent('useToken.ts', false)] as any
      return []
    })

    const context = await collectProjectContext('/project')

    expect(context.frontend).toHaveLength(2)
    expect(context.frontend.some((f) => f.path.includes('page.tsx'))).toBe(true)
    expect(context.frontend.some((f) => f.path.includes('useToken.ts'))).toBe(true)
  })

  it('skips node_modules, .next, and generated files', async () => {
    const mockDirent = (name: string, isDir: boolean) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    })

    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p)
      if (pathStr.endsWith('kit.config.ts')) throw new Error('ENOENT')
      return 'file content' as any
    })

    mockReaddir.mockImplementation(async (dir) => {
      const dirStr = String(dir)
      if (dirStr.endsWith('app')) {
        return [
          mockDirent('node_modules', true),
          mockDirent('.next', true),
        ] as any
      }
      return []
    })

    const context = await collectProjectContext('/project')

    // node_modules and .next directories should be skipped
    expect(context.frontend).toHaveLength(0)
  })

  it('respects MAX_CONTEXT_SIZE limit', async () => {
    const mockDirent = (name: string) => ({
      name,
      isDirectory: () => false,
      isFile: () => true,
    })

    // Create a large file content (>100KB)
    const largeContent = 'x'.repeat(110_000)

    mockReadFile.mockImplementation(async (p) => {
      const pathStr = String(p)
      if (pathStr.endsWith('kit.config.ts')) return largeContent as any
      return 'small file' as any
    })

    mockReaddir.mockImplementation(async (dir) => {
      const dirStr = String(dir)
      if (dirStr.endsWith('src')) return [mockDirent('Token.sol')] as any
      return []
    })

    const context = await collectProjectContext('/project')

    // Config should be read but contracts should be skipped due to size limit
    expect(context.config).toBe(largeContent)
    expect(context.contracts).toHaveLength(0)
  })
})

// ── buildSystemPrompt ────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('includes core rules', () => {
    const context: ProjectContext = { contracts: [], frontend: [], config: '' }

    const prompt = buildSystemPrompt(context)

    expect(prompt).toContain('OpenZeppelin v5.x')
    expect(prompt).toContain('wagmi v2')
    expect(prompt).toContain('JSON array')
    expect(prompt).toContain('Do NOT include explanations outside the JSON')
  })

  it('includes kit.config.ts when present', () => {
    const context: ProjectContext = {
      contracts: [],
      frontend: [],
      config: 'export default { template: "token" }',
    }

    const prompt = buildSystemPrompt(context)

    expect(prompt).toContain('kit.config.ts')
    expect(prompt).toContain('export default { template: "token" }')
  })

  it('includes contract files', () => {
    const context: ProjectContext = {
      contracts: [{ path: 'contracts/src/Token.sol', content: 'pragma solidity ^0.8.20;' }],
      frontend: [],
      config: '',
    }

    const prompt = buildSystemPrompt(context)

    expect(prompt).toContain('--- Contracts ---')
    expect(prompt).toContain('contracts/src/Token.sol')
    expect(prompt).toContain('pragma solidity ^0.8.20;')
  })

  it('includes frontend files', () => {
    const context: ProjectContext = {
      contracts: [],
      frontend: [{ path: 'web/app/page.tsx', content: '<div>Hello</div>' }],
      config: '',
    }

    const prompt = buildSystemPrompt(context)

    expect(prompt).toContain('--- Frontend ---')
    expect(prompt).toContain('web/app/page.tsx')
  })

  it('omits sections when empty', () => {
    const context: ProjectContext = { contracts: [], frontend: [], config: '' }

    const prompt = buildSystemPrompt(context)

    expect(prompt).not.toContain('--- Contracts ---')
    expect(prompt).not.toContain('--- Frontend ---')
    expect(prompt).not.toContain('kit.config.ts')
  })
})

// ── buildChatSystemPrompt ────────────────────────────────────────────────────

describe('buildChatSystemPrompt', () => {
  it('includes multi-turn specific instructions', () => {
    const context: ProjectContext = { contracts: [], frontend: [], config: '' }

    const prompt = buildChatSystemPrompt(context)

    expect(prompt).toContain('multi-turn conversation')
    expect(prompt).toContain('incrementally')
    expect(prompt).toContain('empty array []')
    expect(prompt).toContain('explanatory text AFTER')
  })

  it('differs from buildSystemPrompt in key ways', () => {
    const context: ProjectContext = { contracts: [], frontend: [], config: '' }

    const singleShot = buildSystemPrompt(context)
    const chat = buildChatSystemPrompt(context)

    // Chat allows explanations after JSON
    expect(chat).toContain('You may include explanatory text AFTER the JSON array')
    // Single-shot forbids explanations outside JSON
    expect(singleShot).toContain('Do NOT include explanations outside the JSON')
    // Chat mentions empty array for questions
    expect(chat).toContain('return an empty array []')
    expect(singleShot).not.toContain('return an empty array []')
  })

  it('includes project context same as buildSystemPrompt', () => {
    const context: ProjectContext = {
      contracts: [{ path: 'contracts/src/Token.sol', content: 'pragma solidity' }],
      frontend: [{ path: 'web/app/page.tsx', content: '<div/>' }],
      config: 'export default {}',
    }

    const prompt = buildChatSystemPrompt(context)

    expect(prompt).toContain('--- kit.config.ts ---')
    expect(prompt).toContain('--- Contracts ---')
    expect(prompt).toContain('--- Frontend ---')
    expect(prompt).toContain('Token.sol')
    expect(prompt).toContain('page.tsx')
  })
})
