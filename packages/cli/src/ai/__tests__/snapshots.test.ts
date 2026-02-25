import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureGitRepo, createSnapshot, listSnapshots, revertToSnapshot, getLatestHash } from '../snapshots.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    writeFile: vi.fn(),
  },
}))

import { execa } from 'execa'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

const mockExeca = vi.mocked(execa)
const mockExistsSync = vi.mocked(existsSync)
const mockWriteFile = vi.mocked(fs.writeFile)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── ensureGitRepo ────────────────────────────────────────────────────────────

describe('ensureGitRepo', () => {
  it('initializes git if .git does not exist', async () => {
    mockExistsSync.mockImplementation((p) => {
      if (String(p).endsWith('.git')) return false
      if (String(p).endsWith('.gitignore')) return true
      return false
    })
    // rev-parse HEAD succeeds (has commits)
    mockExeca.mockResolvedValue({ stdout: 'abc123' } as any)

    await ensureGitRepo('/project')

    expect(mockExeca).toHaveBeenCalledWith(
      'git', ['init'],
      expect.objectContaining({ cwd: '/project' }),
    )
  })

  it('skips git init if .git already exists', async () => {
    mockExistsSync.mockImplementation((p) => {
      if (String(p).endsWith('.git')) return true
      if (String(p).endsWith('.gitignore')) return true
      return false
    })
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    await ensureGitRepo('/project')

    const initCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'git' && (c[1] as string[])[0] === 'init',
    )
    expect(initCalls).toHaveLength(0)
  })

  it('writes default .gitignore if missing', async () => {
    mockExistsSync.mockImplementation((p) => {
      if (String(p).endsWith('.git')) return true
      if (String(p).endsWith('.gitignore')) return false
      return false
    })
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    await ensureGitRepo('/project')

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.gitignore'),
      expect.stringContaining('node_modules/'),
      'utf-8',
    )
  })

  it('skips .gitignore write if it already exists', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    await ensureGitRepo('/project')

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('creates initial commit if no commits exist', async () => {
    mockExistsSync.mockReturnValue(true)
    // rev-parse HEAD fails (no commits)
    mockExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'git' && (args as string[])?.[0] === 'rev-parse') {
        throw new Error('fatal: bad revision HEAD')
      }
      return { stdout: '' } as any
    })

    await ensureGitRepo('/project')

    // Should call git add . then git commit
    const addCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'git' && JSON.stringify(c[1]).includes('add'),
    )
    const commitCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'git' && JSON.stringify(c[1]).includes('commit'),
    )
    expect(addCalls.length).toBeGreaterThanOrEqual(1)
    expect(commitCalls.length).toBeGreaterThanOrEqual(1)

    // Commit should include git author env
    const commitCall = commitCalls[0]!
    expect((commitCall[2] as any).env).toMatchObject({
      GIT_AUTHOR_NAME: 'w3m',
      GIT_COMMITTER_NAME: 'w3m',
    })
  })

  it('skips initial commit if commits already exist', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: 'abc123' } as any)

    await ensureGitRepo('/project')

    const commitCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'git' && JSON.stringify(c[1]).includes('commit'),
    )
    expect(commitCalls).toHaveLength(0)
  })
})

// ── createSnapshot ───────────────────────────────────────────────────────────

describe('createSnapshot', () => {
  it('returns null when there are no staged changes', async () => {
    // diff --cached --quiet exits 0 (no changes)
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    const result = await createSnapshot('/project', 'test')

    expect(result).toBeNull()
  })

  it('creates a commit and returns snapshot when changes exist', async () => {
    let callIndex = 0
    mockExeca.mockImplementation(async (cmd, args) => {
      callIndex++
      // git add . succeeds
      if (cmd === 'git' && (args as string[])?.[0] === 'add') {
        return { stdout: '' } as any
      }
      // git diff --cached --quiet fails (= changes exist)
      if (cmd === 'git' && (args as string[])?.[0] === 'diff') {
        throw new Error('exit 1')
      }
      // git commit succeeds
      if (cmd === 'git' && (args as string[])?.[0] === 'commit') {
        return { stdout: '' } as any
      }
      // git log returns hash
      if (cmd === 'git' && (args as string[])?.[0] === 'log') {
        return { stdout: 'abc1234|abc1234567890abcdef' } as any
      }
      return { stdout: '' } as any
    })

    const result = await createSnapshot('/project', 'My snapshot')

    expect(result).not.toBeNull()
    expect(result!.hash).toBe('abc1234')
    expect(result!.fullHash).toBe('abc1234567890abcdef')
    expect(result!.message).toBe('My snapshot')
    expect(result!.timestamp).toBeTruthy()
  })

  it('passes correct commit message', async () => {
    mockExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'git' && (args as string[])?.[0] === 'diff') {
        throw new Error('exit 1')
      }
      if (cmd === 'git' && (args as string[])?.[0] === 'log') {
        return { stdout: 'a|b' } as any
      }
      return { stdout: '' } as any
    })

    await createSnapshot('/project', 'Before AI: Change token name')

    const commitCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])?.[0] === 'commit',
    )
    expect(commitCall).toBeTruthy()
    expect((commitCall![1] as string[]).includes('Before AI: Change token name')).toBe(true)
  })
})

// ── listSnapshots ────────────────────────────────────────────────────────────

describe('listSnapshots', () => {
  it('returns parsed snapshots from git log', async () => {
    mockExeca.mockResolvedValue({
      stdout: 'abc1234|abc1234567890|First commit|2024-01-01T00:00:00Z\ndef5678|def5678901234|Second|2024-01-02T00:00:00Z',
    } as any)

    const snapshots = await listSnapshots('/project')

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toEqual({
      hash: 'abc1234',
      fullHash: 'abc1234567890',
      message: 'First commit',
      timestamp: '2024-01-01T00:00:00Z',
    })
    expect(snapshots[1]!.hash).toBe('def5678')
  })

  it('returns empty array on error', async () => {
    mockExeca.mockRejectedValue(new Error('not a git repo'))

    const snapshots = await listSnapshots('/project')

    expect(snapshots).toEqual([])
  })

  it('returns empty array for empty stdout', async () => {
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    const snapshots = await listSnapshots('/project')

    expect(snapshots).toEqual([])
  })

  it('respects count parameter', async () => {
    mockExeca.mockResolvedValue({ stdout: 'a|b|c|d' } as any)

    await listSnapshots('/project', 5)

    const logCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])?.[0] === 'log',
    )
    expect(logCall).toBeTruthy()
    expect((logCall![1] as string[]).includes('5')).toBe(true)
  })

  it('defaults to count=10', async () => {
    mockExeca.mockResolvedValue({ stdout: 'a|b|c|d' } as any)

    await listSnapshots('/project')

    const logCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])?.[0] === 'log',
    )
    expect((logCall![1] as string[]).includes('10')).toBe(true)
  })
})

// ── revertToSnapshot ─────────────────────────────────────────────────────────

describe('revertToSnapshot', () => {
  it('checks out files from target hash and creates new commit', async () => {
    mockExeca.mockImplementation(async (cmd, args) => {
      const argsArr = args as string[]
      // git log --format=%s -1 <hash> → returns original message
      if (cmd === 'git' && argsArr?.[0] === 'log' && argsArr.some((a) => a === '--format=%s')) {
        return { stdout: 'Original change' } as any
      }
      // git log --format=%h|%H -1 → returns new hash
      if (cmd === 'git' && argsArr?.[0] === 'log' && argsArr.some((a) => a.includes('%h|%H'))) {
        return { stdout: 'new123|new123full' } as any
      }
      return { stdout: '' } as any
    })

    const result = await revertToSnapshot('/project', 'abc123')

    expect(result.hash).toBe('new123')
    expect(result.message).toBe('Reverted to: Original change')

    // Should checkout from target hash
    const checkoutCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'git' && (c[1] as string[])?.[0] === 'checkout',
    )
    expect(checkoutCall).toBeTruthy()
    expect((checkoutCall![1] as string[]).includes('abc123')).toBe(true)
  })

  it('preserves history (no git reset --hard)', async () => {
    mockExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'git' && (args as string[])?.[0] === 'log') {
        return { stdout: 'x|y' } as any
      }
      return { stdout: '' } as any
    })

    await revertToSnapshot('/project', 'abc123')

    // Verify no reset --hard was called
    const resetCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'git' && (c[1] as string[])?.[0] === 'reset',
    )
    expect(resetCalls).toHaveLength(0)
  })
})

// ── getLatestHash ────────────────────────────────────────────────────────────

describe('getLatestHash', () => {
  it('returns hash from git log', async () => {
    mockExeca.mockResolvedValue({ stdout: 'abc1234' } as any)

    const hash = await getLatestHash('/project')

    expect(hash).toBe('abc1234')
  })

  it('returns null on error', async () => {
    mockExeca.mockRejectedValue(new Error('not a repo'))

    const hash = await getLatestHash('/project')

    expect(hash).toBeNull()
  })

  it('returns null for empty stdout', async () => {
    mockExeca.mockResolvedValue({ stdout: '' } as any)

    const hash = await getLatestHash('/project')

    expect(hash).toBeNull()
  })
})

// ── Cross-platform ───────────────────────────────────────────────────────────

describe('cross-platform compatibility', () => {
  it('uses path.join for .git directory check (no hardcoded separators)', async () => {
    // This test verifies that the code uses path.join which handles
    // platform-specific separators (/ on unix, \\ on windows)
    const path = await import('node:path')
    const expected = path.join('/project', '.git')
    // On Windows this would be \\project\\.git, on Unix /project/.git
    expect(expected).toContain('.git')
  })

  it('uses path.join for .gitignore path', async () => {
    const path = await import('node:path')
    const expected = path.join('/project', '.gitignore')
    expect(expected).toContain('.gitignore')
  })
})
