import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runChatSession } from '../chat.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockText = vi.fn()
const mockSelect = vi.fn()
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }))
const mockIsCancel = vi.fn(() => false)

vi.mock('@clack/prompts', () => ({
  text: (...args: any[]) => mockText(...args),
  select: (...args: any[]) => mockSelect(...args),
  spinner: () => mockSpinner(),
  isCancel: (v: any) => mockIsCancel(v),
  confirm: vi.fn(async () => true),
}))

vi.mock('picocolors', () => ({
  default: {
    bold: (s: string) => s,
    dim: (s: string) => s,
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    underline: (s: string) => s,
  },
}))

const mockDetectProject = vi.fn()
vi.mock('../../core/project-detector.js', () => ({
  detectProject: (...args: any[]) => mockDetectProject(...args),
}))

const mockReadApiKey = vi.fn()
vi.mock('../../utils/credentials.js', () => ({
  readApiKey: () => mockReadApiKey(),
}))

const mockGetAiConfig = vi.fn()
const mockRunAiSetup = vi.fn()
vi.mock('../config.js', () => ({
  getAiConfig: () => mockGetAiConfig(),
  runAiSetup: () => mockRunAiSetup(),
}))

const mockSendToAi = vi.fn()
vi.mock('../client.js', () => ({
  sendToAi: (...args: any[]) => mockSendToAi(...args),
}))

const mockCollectProjectContext = vi.fn()
const mockBuildChatSystemPrompt = vi.fn()
vi.mock('../context.js', () => ({
  collectProjectContext: (...args: any[]) => mockCollectProjectContext(...args),
  buildChatSystemPrompt: (...args: any[]) => mockBuildChatSystemPrompt(...args),
}))

const mockParseAiChanges = vi.fn()
const mockShowDiffPreview = vi.fn()
const mockApplyChanges = vi.fn()
vi.mock('../diff.js', () => ({
  parseAiChanges: (...args: any[]) => mockParseAiChanges(...args),
  showDiffPreview: (...args: any[]) => mockShowDiffPreview(...args),
  applyChanges: (...args: any[]) => mockApplyChanges(...args),
}))

const mockEnsureGitRepo = vi.fn()
const mockCreateSnapshot = vi.fn()
const mockListSnapshots = vi.fn()
const mockRevertToSnapshot = vi.fn()
vi.mock('../snapshots.js', () => ({
  ensureGitRepo: (...args: any[]) => mockEnsureGitRepo(...args),
  createSnapshot: (...args: any[]) => mockCreateSnapshot(...args),
  listSnapshots: (...args: any[]) => mockListSnapshots(...args),
  revertToSnapshot: (...args: any[]) => mockRevertToSnapshot(...args),
}))

const mockRebuildProject = vi.fn()
vi.mock('../rebuild.js', () => ({
  rebuildProject: (...args: any[]) => mockRebuildProject(...args),
}))

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}))

import { logger } from '../../utils/logger.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// ── Validation gates ─────────────────────────────────────────────────────────

describe('runChatSession — validation', () => {
  it('exits with error when not in a project directory', async () => {
    mockDetectProject.mockReturnValue(null)

    await runChatSession()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Not inside a project directory'),
    )
    expect(mockEnsureGitRepo).not.toHaveBeenCalled()
  })

  it('exits with error when no API key is set', async () => {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue(null)

    await runChatSession()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('API key'),
    )
    expect(mockEnsureGitRepo).not.toHaveBeenCalled()
  })

  it('runs AI setup inline when no AI config exists', async () => {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue(null)
    mockRunAiSetup.mockResolvedValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    // Cancel immediately on first input
    mockIsCancel.mockReturnValue(true)
    mockText.mockResolvedValue(Symbol('cancel'))

    await runChatSession()

    expect(mockRunAiSetup).toHaveBeenCalled()
  })

  it('exits when AI setup is cancelled', async () => {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue(null)
    mockRunAiSetup.mockResolvedValue(null)

    await runChatSession()

    expect(mockEnsureGitRepo).not.toHaveBeenCalled()
  })
})

// ── Session initialization ───────────────────────────────────────────────────

describe('runChatSession — initialization', () => {
  function setupValidSession() {
    mockDetectProject.mockReturnValue({ name: 'my-token', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
  }

  it('initializes git repo and creates start snapshot', async () => {
    setupValidSession()
    mockIsCancel.mockReturnValue(true)
    mockText.mockResolvedValue(Symbol('cancel'))

    await runChatSession()

    expect(mockEnsureGitRepo).toHaveBeenCalledWith('/project')
    expect(mockCreateSnapshot).toHaveBeenCalledWith('/project', 'Chat session start')
  })

  it('creates final snapshot on exit', async () => {
    setupValidSession()
    mockIsCancel.mockReturnValue(true)
    mockText.mockResolvedValue(Symbol('cancel'))

    await runChatSession()

    expect(mockCreateSnapshot).toHaveBeenCalledWith('/project', 'Chat session end')
  })
})

// ── Slash commands ───────────────────────────────────────────────────────────

describe('runChatSession — slash commands', () => {
  function setupValidSession() {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    mockIsCancel.mockReturnValue(false)
  }

  it('/exit ends the session', async () => {
    setupValidSession()
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.info).toHaveBeenCalledWith('Chat session ended.')
    // Should not have called sendToAi
    expect(mockSendToAi).not.toHaveBeenCalled()
  })

  it('/quit ends the session', async () => {
    setupValidSession()
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/quit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.info).toHaveBeenCalledWith('Chat session ended.')
  })

  it('/q ends the session', async () => {
    setupValidSession()
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/q'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.info).toHaveBeenCalledWith('Chat session ended.')
  })

  it('/history shows recent snapshots', async () => {
    setupValidSession()
    mockListSnapshots.mockResolvedValue([
      { hash: 'abc', fullHash: 'abc123', message: 'Initial', timestamp: '2024-01-01T00:00:00Z' },
    ])
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/history'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockListSnapshots).toHaveBeenCalledWith('/project')
  })

  it('/history shows message when no snapshots', async () => {
    setupValidSession()
    mockListSnapshots.mockResolvedValue([])
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/history'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.info).toHaveBeenCalledWith('No snapshots yet.')
  })

  it('/revert with hash reverts directly', async () => {
    setupValidSession()
    mockRevertToSnapshot.mockResolvedValue({
      hash: 'abc', fullHash: 'abc123', message: 'Reverted to: something', timestamp: '',
    })
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/revert abc123'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockRevertToSnapshot).toHaveBeenCalledWith('/project', 'abc123')
    expect(mockRebuildProject).toHaveBeenCalled()
  })

  it('/revert without hash shows interactive picker', async () => {
    setupValidSession()
    mockListSnapshots.mockResolvedValue([
      { hash: 'abc', fullHash: 'abc123', message: 'First', timestamp: '2024-01-01' },
    ])
    mockSelect.mockResolvedValue('abc')
    mockRevertToSnapshot.mockResolvedValue({
      hash: 'new', fullHash: 'new123', message: 'Reverted to: First', timestamp: '',
    })
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/revert'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Revert to which snapshot?' }),
    )
    expect(mockRevertToSnapshot).toHaveBeenCalledWith('/project', 'abc')
  })

  it('/undo is an alias for /revert', async () => {
    setupValidSession()
    mockListSnapshots.mockResolvedValue([])
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/undo'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockListSnapshots).toHaveBeenCalled()
  })

  it('/help does not end the session', async () => {
    setupValidSession()
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/help'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // Should have continued to take more input after /help
    expect(callCount).toBe(2)
  })

  it('unknown slash command shows warning', async () => {
    setupValidSession()
    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '/foobar'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown command'),
    )
  })
})

// ── Conversation flow ────────────────────────────────────────────────────────

describe('runChatSession — conversation', () => {
  function setupValidSession() {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    mockIsCancel.mockReturnValue(false)
    mockCollectProjectContext.mockResolvedValue({ contracts: [], frontend: [], config: '' })
    mockBuildChatSystemPrompt.mockReturnValue('system prompt')
  }

  it('sends user input to AI and applies changes', async () => {
    setupValidSession()

    // Capture messages at call time (history is passed by reference and mutated after)
    const capturedMessages: any[][] = []
    mockSendToAi.mockImplementation(async (_config, _prompt, messages) => {
      capturedMessages.push([...messages])
      return {
        content: '[{"path": "contracts/src/Token.sol", "content": "new code"}]',
        usage: { inputTokens: 100, outputTokens: 50 },
      }
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'new code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Change the token name to PEPE'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(capturedMessages).toHaveLength(1)
    expect(capturedMessages[0]).toEqual([
      { role: 'user', content: 'Change the token name to PEPE' },
    ])
    expect(mockApplyChanges).toHaveBeenCalled()
  })

  it('re-reads project context each turn', async () => {
    setupValidSession()
    mockSendToAi.mockResolvedValue({ content: '[]', usage: null })
    mockParseAiChanges.mockReturnValue([])

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount <= 2) return `Turn ${callCount}`
      if (callCount === 3) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // collectProjectContext should be called once per non-command turn
    expect(mockCollectProjectContext).toHaveBeenCalledTimes(2)
  })

  it('accumulates conversation history across turns', async () => {
    setupValidSession()

    // Capture messages at call time (history is passed by reference and mutated after)
    const capturedMessages: any[][] = []
    mockSendToAi.mockImplementation(async (_config, _prompt, messages) => {
      capturedMessages.push([...messages])
      return { content: '[]' }
    })
    mockParseAiChanges.mockReturnValue([])

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'First message'
      if (callCount === 2) return 'Second message'
      if (callCount === 3) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // First call: just user1
    expect(capturedMessages[0]).toHaveLength(1)
    expect(capturedMessages[0]![0].content).toBe('First message')

    // Second call: user1 + assistant1 + user2
    expect(capturedMessages[1]).toHaveLength(3)
    expect(capturedMessages[1]![0].role).toBe('user')
    expect(capturedMessages[1]![0].content).toBe('First message')
    expect(capturedMessages[1]![1].role).toBe('assistant')
    expect(capturedMessages[1]![2].role).toBe('user')
    expect(capturedMessages[1]![2].content).toBe('Second message')
  })

  it('treats parse failures as explanation-only responses', async () => {
    setupValidSession()
    mockSendToAi.mockResolvedValue({
      content: 'This is a text explanation, no JSON here.',
    })
    mockParseAiChanges.mockImplementation(() => {
      throw new Error('Could not parse')
    })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'What is Solidity?'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockApplyChanges).not.toHaveBeenCalled()
    expect(mockShowDiffPreview).not.toHaveBeenCalled()
  })

  it('triggers rebuild only when .sol files change', async () => {
    setupValidSession()
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "web/app/page.tsx", "content": "tsx code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'web/app/page.tsx', content: 'tsx code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Change the heading'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // rebuildProject should NOT be called for frontend-only changes
    expect(mockRebuildProject).not.toHaveBeenCalled()
  })

  it('triggers rebuild when .sol files change', async () => {
    setupValidSession()
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "contracts/src/Token.sol", "content": "code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Add burn fee'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockRebuildProject).toHaveBeenCalledWith('/project', { anvilRunning: true })
  })

  it('creates pre-change and post-change snapshots', async () => {
    setupValidSession()
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "contracts/src/Token.sol", "content": "code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Change name'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // Should create: session start, before AI, after AI, session end
    const snapshotMessages = mockCreateSnapshot.mock.calls.map((c) => c[1])
    expect(snapshotMessages).toContain('Chat session start')
    expect(snapshotMessages.some((m: string) => m.startsWith('Before AI:'))).toBe(true)
    expect(snapshotMessages.some((m: string) => m.startsWith('AI:'))).toBe(true)
    expect(snapshotMessages).toContain('Chat session end')
  })

  it('removes user message from history when AI request fails', async () => {
    setupValidSession()

    // Capture messages at call time
    const capturedMessages: any[][] = []
    let aiCallCount = 0
    mockSendToAi.mockImplementation(async (_config, _prompt, messages) => {
      capturedMessages.push([...messages])
      aiCallCount++
      if (aiCallCount === 1) throw new Error('API timeout')
      return { content: '[]' }
    })
    mockParseAiChanges.mockReturnValue([])

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'First attempt'
      if (callCount === 2) return 'Second attempt'
      if (callCount === 3) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    // Second AI call should only have 1 message (the failed first was removed)
    expect(capturedMessages[1]).toHaveLength(1)
    expect(capturedMessages[1]![0].content).toBe('Second attempt')
  })

  it('skips empty user input', async () => {
    setupValidSession()

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return '   '
      if (callCount === 2) return ''
      if (callCount === 3) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockSendToAi).not.toHaveBeenCalled()
  })
})

// ── Build failure handling ───────────────────────────────────────────────────

describe('runChatSession — build failure', () => {
  function setupWithBuildFailure() {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    mockIsCancel.mockReturnValue(false)
    mockCollectProjectContext.mockResolvedValue({ contracts: [], frontend: [], config: '' })
    mockBuildChatSystemPrompt.mockReturnValue('system prompt')
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "contracts/src/Token.sol", "content": "bad code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'bad code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({
      buildSuccess: false,
      deploySuccess: false,
      codegenSuccess: false,
      buildErrors: 'Error: undeclared identifier',
    })
  }

  it('shows build failure menu when build fails', async () => {
    setupWithBuildFailure()
    mockSelect.mockResolvedValue('continue')

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Add burn fee'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Build failed'),
      }),
    )
  })

  it('"continue" option ignores errors and proceeds', async () => {
    setupWithBuildFailure()
    mockSelect.mockResolvedValue('continue')

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'Add burn fee'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(logger.info).toHaveBeenCalledWith('Continuing with build errors.')
  })
})

// ── anvilRunning option ──────────────────────────────────────────────────────

describe('runChatSession — options', () => {
  it('defaults anvilRunning to true', async () => {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    mockIsCancel.mockReturnValue(false)
    mockCollectProjectContext.mockResolvedValue({ contracts: [], frontend: [], config: '' })
    mockBuildChatSystemPrompt.mockReturnValue('prompt')
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "contracts/src/Token.sol", "content": "code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'change'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession()

    expect(mockRebuildProject).toHaveBeenCalledWith('/project', { anvilRunning: true })
  })

  it('passes anvilRunning=false when specified', async () => {
    mockDetectProject.mockReturnValue({ name: 'test', path: '/project' })
    mockReadApiKey.mockReturnValue('w3m_key123')
    mockGetAiConfig.mockReturnValue({ provider: 'anthropic', apiKey: 'sk-test' })
    mockEnsureGitRepo.mockResolvedValue(undefined)
    mockCreateSnapshot.mockResolvedValue(null)
    mockIsCancel.mockReturnValue(false)
    mockCollectProjectContext.mockResolvedValue({ contracts: [], frontend: [], config: '' })
    mockBuildChatSystemPrompt.mockReturnValue('prompt')
    mockSendToAi.mockResolvedValue({
      content: '[{"path": "contracts/src/Token.sol", "content": "code"}]',
    })
    mockParseAiChanges.mockReturnValue([
      { path: 'contracts/src/Token.sol', content: 'code', isNew: false },
    ])
    mockShowDiffPreview.mockResolvedValue(undefined)
    mockApplyChanges.mockResolvedValue(undefined)
    mockRebuildProject.mockResolvedValue({ buildSuccess: true, deploySuccess: true, codegenSuccess: true })

    let callCount = 0
    mockText.mockImplementation(async () => {
      callCount++
      if (callCount === 1) return 'change'
      if (callCount === 2) return '/exit'
      return Symbol('cancel')
    })

    await runChatSession({ anvilRunning: false })

    expect(mockRebuildProject).toHaveBeenCalledWith('/project', { anvilRunning: false })
  })
})
