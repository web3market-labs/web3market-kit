import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAiChanges, showDiffPreview, applyChanges, type FileChange } from '../diff.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}))

import fs from 'node:fs/promises'

const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockMkdir = vi.mocked(fs.mkdir)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── parseAiChanges ───────────────────────────────────────────────────────────

describe('parseAiChanges', () => {
  it('parses a valid JSON array', () => {
    const response = '[{"path": "contracts/src/Token.sol", "content": "pragma solidity ^0.8.20;"}]'

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      path: 'contracts/src/Token.sol',
      content: 'pragma solidity ^0.8.20;',
      isNew: false,
    })
  })

  it('parses JSON wrapped in markdown code blocks', () => {
    const response = '```json\n[{"path": "file.sol", "content": "// code"}]\n```'

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
    expect(changes[0]!.path).toBe('file.sol')
  })

  it('parses JSON wrapped in plain code blocks', () => {
    const response = '```\n[{"path": "file.sol", "content": "// code"}]\n```'

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
  })

  it('parses JSON with leading text before the array', () => {
    const response = 'Here are the changes:\n[{"path": "file.sol", "content": "code"}]'

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
  })

  it('parses JSON with trailing text after the array', () => {
    const response = '[{"path": "file.sol", "content": "code"}]\n\nI changed the token name.'

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
  })

  it('parses empty JSON array', () => {
    const response = '[]'

    const changes = parseAiChanges(response)

    expect(changes).toEqual([])
  })

  it('parses multiple file changes', () => {
    const response = JSON.stringify([
      { path: 'contracts/src/Token.sol', content: 'sol code' },
      { path: 'web/app/page.tsx', content: 'tsx code' },
      { path: 'contracts/script/Deploy.s.sol', content: 'deploy code' },
    ])

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(3)
    expect(changes[0]!.path).toBe('contracts/src/Token.sol')
    expect(changes[1]!.path).toBe('web/app/page.tsx')
    expect(changes[2]!.path).toBe('contracts/script/Deploy.s.sol')
  })

  it('throws on completely invalid input', () => {
    expect(() => parseAiChanges('This is just text with no JSON')).toThrow(
      'Could not parse AI response',
    )
  })

  it('throws when response is a JSON object instead of array', () => {
    expect(() => parseAiChanges('{"path": "file.sol", "content": "code"}')).toThrow(
      'Could not parse AI response',
    )
  })

  it('handles content with special characters', () => {
    const content = 'string memory name = "Hello \\"World\\"";'
    const response = JSON.stringify([{ path: 'file.sol', content }])

    const changes = parseAiChanges(response)

    expect(changes[0]!.content).toBe(content)
  })

  it('handles content with newlines', () => {
    const content = 'line1\nline2\nline3'
    const response = JSON.stringify([{ path: 'file.sol', content }])

    const changes = parseAiChanges(response)

    expect(changes[0]!.content).toBe(content)
  })

  it('sets isNew to false by default (determined later by showDiffPreview)', () => {
    const response = '[{"path": "new-file.sol", "content": "code"}]'

    const changes = parseAiChanges(response)

    expect(changes[0]!.isNew).toBe(false)
  })
})

// ── showDiffPreview ──────────────────────────────────────────────────────────

describe('showDiffPreview', () => {
  it('marks files as new when they do not exist on disk', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const changes: FileChange[] = [
      { path: 'contracts/src/NewToken.sol', content: 'pragma solidity ^0.8.20;', isNew: false },
    ]

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await showDiffPreview(changes)

    expect(changes[0]!.isNew).toBe(true)
    expect(consoleSpy.mock.calls.some((c) => String(c).includes('new file'))).toBe(true)

    consoleSpy.mockRestore()
  })

  it('marks files as modified when they exist on disk', async () => {
    mockReadFile.mockResolvedValue('old content' as any)

    const changes: FileChange[] = [
      { path: 'contracts/src/Token.sol', content: 'new content', isNew: false },
    ]

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await showDiffPreview(changes)

    expect(changes[0]!.isNew).toBe(false)
    expect(consoleSpy.mock.calls.some((c) => String(c).includes('modified'))).toBe(true)

    consoleSpy.mockRestore()
  })

  it('shows file count in header', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const changes: FileChange[] = [
      { path: 'a.sol', content: 'a', isNew: true },
      { path: 'b.sol', content: 'b', isNew: true },
    ]

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await showDiffPreview(changes)

    expect(consoleSpy.mock.calls.some((c) => String(c).includes('2 files'))).toBe(true)

    consoleSpy.mockRestore()
  })

  it('shows singular "file" for single change', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const changes: FileChange[] = [{ path: 'a.sol', content: 'a', isNew: true }]

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await showDiffPreview(changes)

    const headerLine = consoleSpy.mock.calls.find((c) => String(c).includes('Changes'))
    expect(String(headerLine)).toContain('1 file')
    expect(String(headerLine)).not.toContain('1 files')

    consoleSpy.mockRestore()
  })
})

// ── applyChanges ─────────────────────────────────────────────────────────────

describe('applyChanges', () => {
  it('creates directories and writes files', async () => {
    mockMkdir.mockResolvedValue(undefined as any)
    mockWriteFile.mockResolvedValue(undefined as any)

    const changes: FileChange[] = [
      { path: 'contracts/src/Token.sol', content: 'pragma solidity ^0.8.20;', isNew: false },
    ]

    await applyChanges(changes)

    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('Token.sol'),
      'pragma solidity ^0.8.20;',
      'utf-8',
    )
  })

  it('handles multiple file changes', async () => {
    mockMkdir.mockResolvedValue(undefined as any)
    mockWriteFile.mockResolvedValue(undefined as any)

    const changes: FileChange[] = [
      { path: 'a.sol', content: 'a', isNew: false },
      { path: 'b.tsx', content: 'b', isNew: false },
      { path: 'nested/deep/c.ts', content: 'c', isNew: true },
    ]

    await applyChanges(changes)

    expect(mockMkdir).toHaveBeenCalledTimes(3)
    expect(mockWriteFile).toHaveBeenCalledTimes(3)
  })

  it('creates nested directories for new files', async () => {
    mockMkdir.mockResolvedValue(undefined as any)
    mockWriteFile.mockResolvedValue(undefined as any)

    const changes: FileChange[] = [
      { path: 'contracts/src/lib/Utils.sol', content: 'code', isNew: true },
    ]

    await applyChanges(changes)

    // mkdir should be called with the parent directory
    const mkdirPath = mockMkdir.mock.calls[0]![0] as string
    expect(mkdirPath).toContain('lib')
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('parseAiChanges — edge cases', () => {
  it('handles deeply nested JSON in markdown', () => {
    const response = `Here are the changes I made:

\`\`\`json
[
  {
    "path": "contracts/src/Token.sol",
    "content": "// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.20;\\n\\ncontract Token {\\n    string public name;\\n}"
  }
]
\`\`\`

I've updated the Token contract with a public name variable.`

    const changes = parseAiChanges(response)

    expect(changes).toHaveLength(1)
    expect(changes[0]!.path).toBe('contracts/src/Token.sol')
  })

  it('handles whitespace-only response', () => {
    expect(() => parseAiChanges('   \n  \t  ')).toThrow('Could not parse AI response')
  })

  it('handles empty string', () => {
    expect(() => parseAiChanges('')).toThrow('Could not parse AI response')
  })

  it('handles response with only code block markers', () => {
    expect(() => parseAiChanges('```\n```')).toThrow('Could not parse AI response')
  })
})
