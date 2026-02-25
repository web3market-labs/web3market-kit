import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scanDeployScriptEnvVars, preflightDeploy, reportMissingEnvVars } from '../foundry.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  }
})

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}))

import { existsSync, readFileSync } from 'node:fs'
import { logger } from '../logger.js'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── scanDeployScriptEnvVars ─────────────────────────────────────────────────

describe('scanDeployScriptEnvVars', () => {
  it('returns empty array when script file does not exist', () => {
    mockExistsSync.mockReturnValue(false)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([])
  })

  it('parses vm.envUint calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      pragma solidity ^0.8.20;
      contract Deploy is Script {
        function run() public {
          uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
          vm.startBroadcast(pk);
        }
      }
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'DEPLOYER_PRIVATE_KEY', type: 'Uint' },
    ])
  })

  it('parses vm.envAddress calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      address owner = vm.envAddress("OWNER_ADDRESS");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'OWNER_ADDRESS', type: 'Address' },
    ])
  })

  it('parses vm.envString calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      string memory name = vm.envString("TOKEN_NAME");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'TOKEN_NAME', type: 'String' },
    ])
  })

  it('parses vm.envBytes32 calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      bytes32 salt = vm.envBytes32("DEPLOY_SALT");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'DEPLOY_SALT', type: 'Bytes32' },
    ])
  })

  it('parses vm.envBool calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      bool useProxy = vm.envBool("USE_PROXY");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'USE_PROXY', type: 'Bool' },
    ])
  })

  it('parses vm.envInt calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      int256 offset = vm.envInt("OFFSET_VALUE");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([
      { name: 'OFFSET_VALUE', type: 'Int' },
    ])
  })

  it('parses multiple env var types in single script', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      pragma solidity ^0.8.20;
      contract Deploy is Script {
        function run() public {
          uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
          address owner = vm.envAddress("OWNER_ADDRESS");
          string memory name = vm.envString("TOKEN_NAME");
          vm.startBroadcast(pk);
        }
      }
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.name)).toEqual([
      'DEPLOYER_PRIVATE_KEY',
      'OWNER_ADDRESS',
      'TOKEN_NAME',
    ])
  })

  it('deduplicates repeated env var references', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
      // used again later
      uint256 pk2 = vm.envUint("DEPLOYER_PRIVATE_KEY");
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('DEPLOYER_PRIVATE_KEY')
  })

  it('handles single-quoted strings', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint('DEPLOYER_PRIVATE_KEY');
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('DEPLOYER_PRIVATE_KEY')
  })

  it('handles whitespace variations in vm.env calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint(  "DEPLOYER_PRIVATE_KEY"  );
      address a = vm.envAddress( "ADDR" );
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toHaveLength(2)
    expect(result[0]!.name).toBe('DEPLOYER_PRIVATE_KEY')
    expect(result[1]!.name).toBe('ADDR')
  })

  it('returns empty array when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES') })

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([])
  })

  it('returns empty array when script has no vm.env calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      pragma solidity ^0.8.20;
      contract Deploy is Script {
        function run() public {
          vm.startBroadcast();
          new Token();
          vm.stopBroadcast();
        }
      }
    `)

    const result = scanDeployScriptEnvVars('/contracts', 'script/Deploy.s.sol')

    expect(result).toEqual([])
  })

  it('constructs full path from contractsDir and scriptPath', () => {
    mockExistsSync.mockReturnValue(false)

    scanDeployScriptEnvVars('/my/contracts', 'script/Deploy.s.sol')

    // existsSync should be called with the joined path
    const path = require('node:path')
    expect(mockExistsSync).toHaveBeenCalledWith(
      path.join('/my/contracts', 'script/Deploy.s.sol'),
    )
  })
})

// ── preflightDeploy ─────────────────────────────────────────────────────────

describe('preflightDeploy', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('returns ok=true when script has no env vars', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      contract Deploy is Script {
        function run() public { vm.startBroadcast(); }
      }
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('auto-provides DEPLOYER_PRIVATE_KEY for Anvil', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(true)
    expect(result.env['DEPLOYER_PRIVATE_KEY']).toBe(ANVIL_KEY)
    expect(result.missing).toEqual([])
  })

  it('reports missing vars that are not auto-provided or in process.env', () => {
    delete process.env['CUSTOM_TOKEN_ADDRESS']
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
      address token = vm.envAddress("CUSTOM_TOKEN_ADDRESS");
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual([
      { name: 'CUSTOM_TOKEN_ADDRESS', type: 'Address' },
    ])
    // DEPLOYER_PRIVATE_KEY should still be auto-provided
    expect(result.env['DEPLOYER_PRIVATE_KEY']).toBe(ANVIL_KEY)
  })

  it('uses process.env value for non-auto-provided vars', () => {
    process.env['CUSTOM_TOKEN_ADDRESS'] = '0x1234567890'
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      address token = vm.envAddress("CUSTOM_TOKEN_ADDRESS");
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('reports multiple missing vars', () => {
    delete process.env['TOKEN_NAME']
    delete process.env['OWNER_ADDRESS']
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      string memory name = vm.envString("TOKEN_NAME");
      address owner = vm.envAddress("OWNER_ADDRESS");
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(false)
    expect(result.missing).toHaveLength(2)
    expect(result.missing.map((m) => m.name)).toEqual(['TOKEN_NAME', 'OWNER_ADDRESS'])
  })

  it('returns ok=true when script file does not exist (no requirements)', () => {
    mockExistsSync.mockReturnValue(false)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('Anvil auto-env takes precedence even if process.env has the same var', () => {
    process.env['DEPLOYER_PRIVATE_KEY'] = '0xuser_key'
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(`
      uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
    `)

    const result = preflightDeploy('/contracts', 'script/Deploy.s.sol')

    expect(result.ok).toBe(true)
    // Auto-provided Anvil key overrides process.env
    expect(result.env['DEPLOYER_PRIVATE_KEY']).toBe(ANVIL_KEY)
  })
})

// ── reportMissingEnvVars ────────────────────────────────────────────────────

describe('reportMissingEnvVars', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('logs error with list of missing variables', () => {
    const missing = [
      { name: 'TOKEN_NAME', type: 'String' as const },
      { name: 'OWNER_ADDRESS', type: 'Address' as const },
    ]

    reportMissingEnvVars(missing, '/project')

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('environment variables'),
    )
    // Should log each missing var
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('TOKEN_NAME'),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('OWNER_ADDRESS'),
    )
  })

  it('includes the project .env path in guidance', () => {
    const missing = [{ name: 'MY_VAR', type: 'String' as const }]

    reportMissingEnvVars(missing, '/my/project')

    const logs = vi.mocked(console.log).mock.calls.map((c) => String(c[0]))
    const envPathLog = logs.find((l) => l.includes('.env'))
    expect(envPathLog).toBeTruthy()
  })

  it('includes export example in guidance', () => {
    const missing = [{ name: 'API_KEY', type: 'String' as const }]

    reportMissingEnvVars(missing, '/project')

    const logs = vi.mocked(console.log).mock.calls.map((c) => String(c[0]))
    const exportLog = logs.find((l) => l.includes('export'))
    expect(exportLog).toBeTruthy()
    expect(exportLog).toContain('API_KEY')
  })

  it('shows vm.env type annotation for each variable', () => {
    const missing = [
      { name: 'PK', type: 'Uint' as const },
      { name: 'ADDR', type: 'Address' as const },
    ]

    reportMissingEnvVars(missing, '/project')

    const logs = vi.mocked(console.log).mock.calls.map((c) => String(c[0]))
    expect(logs.some((l) => l.includes('vm.envUint'))).toBe(true)
    expect(logs.some((l) => l.includes('vm.envAddress'))).toBe(true)
  })
})
