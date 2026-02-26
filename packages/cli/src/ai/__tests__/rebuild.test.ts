import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rebuildProject, type RebuildResult } from '../rebuild.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
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

const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

vi.mock('../../utils/foundry.js', () => ({
  findDeployScript: vi.fn(() => 'script/Deploy.s.sol'),
  preflightDeploy: vi.fn(() => ({
    ok: true,
    env: { DEPLOYER_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
    missing: [],
  })),
  reportMissingEnvVars: vi.fn(),
}))

vi.mock('../../lib/deploy/forge-parser.js', () => ({
  parseForgeBroadcast: vi.fn(async () => []),
  parseForgeStdout: vi.fn(() => []),
}))

vi.mock('../../lib/deploy/deployments.js', () => ({
  writeStructuredDeployment: vi.fn(),
}))

vi.mock('@web3marketlabs/codegen', () => ({
  runCodegen: vi.fn(),
}))

import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { findDeployScript, preflightDeploy, reportMissingEnvVars } from '../../utils/foundry.js'
import { parseForgeBroadcast, parseForgeStdout } from '../../lib/deploy/forge-parser.js'
import { writeStructuredDeployment } from '../../lib/deploy/deployments.js'
import { logger } from '../../utils/logger.js'

const mockExeca = vi.mocked(execa)
const mockExistsSync = vi.mocked(existsSync)
const mockParseBroadcast = vi.mocked(parseForgeBroadcast)
const mockParseStdout = vi.mocked(parseForgeStdout)
const mockWriteDeployment = vi.mocked(writeStructuredDeployment)

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Frontend-only project ────────────────────────────────────────────────────

describe('rebuildProject — frontend-only', () => {
  it('skips all contract steps when contracts/src does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    const result = await rebuildProject('/project')

    expect(result).toEqual({
      buildSuccess: true,
      deploySuccess: true,
      codegenSuccess: true,
    })
    expect(mockExeca).not.toHaveBeenCalled()
  })
})

// ── Build ────────────────────────────────────────────────────────────────────

describe('rebuildProject — build', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true) // contracts/src exists
  })

  it('runs forge build and reports success', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)

    const result = await rebuildProject('/project', { anvilRunning: false })

    expect(result.buildSuccess).toBe(true)
    expect(mockExeca).toHaveBeenCalledWith(
      'forge', ['build'],
      expect.objectContaining({ cwd: expect.stringContaining('contracts') }),
    )
  })

  it('captures build errors and returns early on failure', async () => {
    mockExeca.mockRejectedValue({ stderr: 'Error: undeclared identifier', message: '' })

    const result = await rebuildProject('/project')

    expect(result.buildSuccess).toBe(false)
    expect(result.buildErrors).toBe('Error: undeclared identifier')
    // Should NOT try to deploy or codegen
    expect(result.deploySuccess).toBe(false)
    expect(result.codegenSuccess).toBe(false)
  })

  it('uses error.message as fallback when stderr is empty', async () => {
    mockExeca.mockRejectedValue({ stderr: '', message: 'Command failed' })

    const result = await rebuildProject('/project')

    expect(result.buildErrors).toBe('Command failed')
  })

  it('uses default message when both stderr and message are empty', async () => {
    mockExeca.mockRejectedValue({})

    const result = await rebuildProject('/project')

    expect(result.buildErrors).toBe('Unknown build error')
  })
})

// ── Deploy ───────────────────────────────────────────────────────────────────

describe('rebuildProject — deploy', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true)
  })

  it('skips deploy when anvilRunning is false', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)

    const result = await rebuildProject('/project', { anvilRunning: false })

    expect(result.buildSuccess).toBe(true)
    // execa should only be called once (forge build), not for forge script
    const forgeCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(forgeCalls).toHaveLength(0)
  })

  it('skips deploy when anvilRunning is undefined (defaults to no deploy)', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)

    const result = await rebuildProject('/project')

    const forgeCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(forgeCalls).toHaveLength(0)
  })

  it('deploys when anvilRunning is true and build succeeds', async () => {
    mockExeca.mockResolvedValue({ stdout: 'deployed', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])
    mockParseStdout.mockReturnValue([])

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(result.buildSuccess).toBe(true)
    expect(result.deploySuccess).toBe(true)
    const forgeCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(forgeCalls).toHaveLength(1)
  })

  it('passes DEPLOYER_PRIVATE_KEY as env var to forge script', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])

    await rebuildProject('/project', { anvilRunning: true })

    const scriptCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(scriptCall).toBeTruthy()
    const opts = scriptCall![2] as any
    expect(opts.env.DEPLOYER_PRIVATE_KEY).toBe(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    )
  })

  it('passes --private-key and --rpc-url flags to forge script', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])

    await rebuildProject('/project', { anvilRunning: true })

    const scriptCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    const args = scriptCall![1] as string[]
    expect(args).toContain('--broadcast')
    expect(args).toContain('--rpc-url')
    expect(args).toContain('http://127.0.0.1:8545')
    expect(args).toContain('--private-key')
  })

  it('writes structured deployment when contracts are parsed', async () => {
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([
      { contractName: 'Token', address: '0x123', txHash: '0xabc', blockNumber: 1 },
    ])

    await rebuildProject('/project', { anvilRunning: true })

    expect(mockWriteDeployment).toHaveBeenCalledWith(
      expect.stringContaining('deployments'),
      expect.objectContaining({
        chainId: 31337,
        chain: 'localhost',
        contracts: [{ contractName: 'Token', address: '0x123', txHash: '0xabc', blockNumber: 1 }],
      }),
    )
  })

  it('falls back to parseForgeStdout when broadcast returns empty', async () => {
    mockExeca.mockResolvedValue({ stdout: 'Contract deployed at: 0x456', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])
    mockParseStdout.mockReturnValue([
      { contractName: 'Contract', address: '0x456', txHash: '', blockNumber: 0 },
    ])

    await rebuildProject('/project', { anvilRunning: true })

    expect(mockParseStdout).toHaveBeenCalledWith('Contract deployed at: 0x456')
    expect(mockWriteDeployment).toHaveBeenCalled()
  })

  it('handles deploy failure gracefully (no throw)', async () => {
    let callCount = 0
    mockExeca.mockImplementation(async (cmd, args) => {
      callCount++
      if (cmd === 'forge' && (args as string[])?.[0] === 'script') {
        throw { stderr: 'Deploy failed: timeout', message: '' }
      }
      return { stdout: '', stderr: '' } as any
    })

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(result.buildSuccess).toBe(true)
    expect(result.deploySuccess).toBe(false)
    // Should still try codegen even if deploy fails
    expect(logger.warn).toHaveBeenCalled()
  })
})

// ── Pre-flight integration ──────────────────────────────────────────────────

describe('rebuildProject — pre-flight', () => {
  const mockPreflightDeploy = vi.mocked(preflightDeploy)
  const mockReportMissing = vi.mocked(reportMissingEnvVars)

  beforeEach(() => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])
  })

  it('calls preflightDeploy before deploying', async () => {
    await rebuildProject('/project', { anvilRunning: true })

    expect(mockPreflightDeploy).toHaveBeenCalledWith(
      expect.stringContaining('contracts'),
      'script/Deploy.s.sol',
    )
  })

  it('skips deploy and reports missing vars when preflight fails', async () => {
    mockPreflightDeploy.mockReturnValue({
      ok: false,
      env: {},
      missing: [{ name: 'CUSTOM_TOKEN_ADDRESS', type: 'Address' }],
    })

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(mockReportMissing).toHaveBeenCalledWith(
      [{ name: 'CUSTOM_TOKEN_ADDRESS', type: 'Address' }],
      '/project',
    )
    expect(result.deploySuccess).toBe(false)
    // Should NOT call forge script
    const forgeCalls = mockExeca.mock.calls.filter(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(forgeCalls).toHaveLength(0)
    // But should still run codegen
    expect(result.codegenSuccess).toBe(true)
  })

  it('proceeds with deploy when preflight passes', async () => {
    mockPreflightDeploy.mockReturnValue({
      ok: true,
      env: { DEPLOYER_PRIVATE_KEY: ANVIL_KEY },
      missing: [],
    })

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(mockReportMissing).not.toHaveBeenCalled()
    expect(result.deploySuccess).toBe(true)
  })

  it('uses preflight.env for forge script env vars', async () => {
    const customEnv = { DEPLOYER_PRIVATE_KEY: ANVIL_KEY, CUSTOM_VAR: '42' }
    mockPreflightDeploy.mockReturnValue({
      ok: true,
      env: customEnv,
      missing: [],
    })

    await rebuildProject('/project', { anvilRunning: true })

    const scriptCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    expect(scriptCall).toBeTruthy()
    const opts = scriptCall![2] as any
    expect(opts.env).toEqual(customEnv)
  })

  it('does not run preflight when anvilRunning is false', async () => {
    await rebuildProject('/project', { anvilRunning: false })

    expect(mockPreflightDeploy).not.toHaveBeenCalled()
  })
})

// ── Codegen ──────────────────────────────────────────────────────────────────

describe('rebuildProject — codegen', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])
  })

  it('runs codegen after successful build', async () => {
    const { runCodegen } = await import('@web3marketlabs/codegen')

    await rebuildProject('/project', { anvilRunning: false })

    expect(runCodegen).toHaveBeenCalledWith({ root: '/project' })
  })

  it('handles codegen failure gracefully', async () => {
    const codegen = await import('@web3marketlabs/codegen')
    vi.mocked(codegen.runCodegen).mockRejectedValue(new Error('codegen config not found'))

    const result = await rebuildProject('/project', { anvilRunning: false })

    expect(result.buildSuccess).toBe(true)
    expect(result.codegenSuccess).toBe(false)
  })
})

// ── Full pipeline ────────────────────────────────────────────────────────────

describe('rebuildProject — full pipeline', () => {
  it('runs build → deploy → codegen in order when all succeed', async () => {
    mockExistsSync.mockReturnValue(true)
    const callOrder: string[] = []

    mockExeca.mockImplementation(async (cmd, args) => {
      if (cmd === 'forge' && (args as string[])?.[0] === 'build') {
        callOrder.push('build')
      }
      if (cmd === 'forge' && (args as string[])?.[0] === 'script') {
        callOrder.push('deploy')
      }
      return { stdout: '', stderr: '' } as any
    })
    mockParseBroadcast.mockResolvedValue([])

    const codegen = await import('@web3marketlabs/codegen')
    vi.mocked(codegen.runCodegen).mockImplementation(async () => {
      callOrder.push('codegen')
    })

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(result.buildSuccess).toBe(true)
    expect(result.deploySuccess).toBe(true)
    expect(result.codegenSuccess).toBe(true)
    expect(callOrder).toEqual(['build', 'deploy', 'codegen'])
  })

  it('does not deploy or codegen when build fails', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockRejectedValue({ stderr: 'compile error', message: '' })

    const result = await rebuildProject('/project', { anvilRunning: true })

    expect(result.buildSuccess).toBe(false)
    expect(result.deploySuccess).toBe(false)
    expect(result.codegenSuccess).toBe(false)
    // Only one execa call (the failed build)
    expect(mockExeca).toHaveBeenCalledTimes(1)
  })
})

// ── Cross-platform ───────────────────────────────────────────────────────────

describe('rebuildProject — cross-platform', () => {
  it('uses path.join for contracts directory (no hardcoded slashes)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])

    await rebuildProject('/project', { anvilRunning: false })

    const buildCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'build',
    )
    const cwd = (buildCall![2] as any).cwd as string
    // path.join handles platform separators
    const path = await import('node:path')
    expect(cwd).toBe(path.join('/project', 'contracts'))
  })

  it('uses forward slashes in deploy script path (forge requirement)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockExeca.mockResolvedValue({ stdout: '', stderr: '' } as any)
    mockParseBroadcast.mockResolvedValue([])

    // findDeployScript returns forward-slash paths (forge expects this)
    vi.mocked(findDeployScript).mockReturnValue('script/Deploy.s.sol')

    await rebuildProject('/project', { anvilRunning: true })

    const scriptCall = mockExeca.mock.calls.find(
      (c) => c[0] === 'forge' && (c[1] as string[])?.[0] === 'script',
    )
    const args = scriptCall![1] as string[]
    // Deploy script path should use forward slashes (even on Windows, forge expects this)
    expect(args[1]).toBe('script/Deploy.s.sol')
  })
})
