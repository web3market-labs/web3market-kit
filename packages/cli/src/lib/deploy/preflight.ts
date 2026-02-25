import { execSync } from 'node:child_process'

export interface PreflightResult {
  passed: boolean
  checks: PreflightCheck[]
}

export interface PreflightCheck {
  name: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  message: string
  duration?: number
}

export interface PreflightOptions {
  projectRoot: string
  chainId: number
  rpcUrl: string
  deployerAddress?: string
  skipTests?: boolean
}

export async function runPreflightChecks(options: PreflightOptions): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []

  checks.push(await checkCompilation(options.projectRoot))

  if (!options.skipTests) {
    checks.push(await checkTests(options.projectRoot))
  } else {
    checks.push({ name: 'Test Suite', status: 'skip', message: 'Skipped by user' })
  }

  checks.push(await checkRpcConnectivity(options.rpcUrl))
  checks.push(await checkContractSize(options.projectRoot))
  checks.push(checkFoundryInstalled())

  const passed = checks.every(c => c.status === 'pass' || c.status === 'skip' || c.status === 'warn')
  return { passed, checks }
}

async function checkCompilation(projectRoot: string): Promise<PreflightCheck> {
  const start = Date.now()
  try {
    execSync('forge build', { cwd: projectRoot, stdio: 'pipe', timeout: 120_000 })
    return { name: 'Compilation', status: 'pass', message: 'All contracts compiled successfully', duration: Date.now() - start }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { name: 'Compilation', status: 'fail', message: `Compilation failed: ${msg.slice(0, 200)}`, duration: Date.now() - start }
  }
}

async function checkTests(projectRoot: string): Promise<PreflightCheck> {
  const start = Date.now()
  try {
    execSync('forge test', { cwd: projectRoot, stdio: 'pipe', timeout: 300_000 })
    return { name: 'Test Suite', status: 'pass', message: 'All tests passed', duration: Date.now() - start }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { name: 'Test Suite', status: 'fail', message: `Tests failed: ${msg.slice(0, 200)}`, duration: Date.now() - start }
  }
}

async function checkRpcConnectivity(rpcUrl: string): Promise<PreflightCheck> {
  const start = Date.now()
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await response.json() as { result?: string; error?: { message: string } }
    if (data.error) {
      return { name: 'RPC Connectivity', status: 'fail', message: `RPC error: ${data.error.message}`, duration: Date.now() - start }
    }
    const blockNumber = parseInt(data.result ?? '0', 16)
    return { name: 'RPC Connectivity', status: 'pass', message: `Connected, latest block: ${blockNumber}`, duration: Date.now() - start }
  } catch {
    return { name: 'RPC Connectivity', status: 'fail', message: `Cannot reach RPC: ${rpcUrl}`, duration: Date.now() - start }
  }
}

async function checkContractSize(projectRoot: string): Promise<PreflightCheck> {
  try {
    const output = execSync('forge build --sizes 2>&1', { cwd: projectRoot, stdio: 'pipe', timeout: 120_000 }).toString()
    const oversize = output.split('\n').filter(line => {
      const match = line.match(/(\d+(?:\.\d+)?)\s*kB/)
      return match && parseFloat(match[1]!) > 24
    })
    if (oversize.length > 0) {
      return { name: 'Contract Size', status: 'fail', message: `Contracts exceed EIP-170 limit (24KB): ${oversize.length} contract(s)` }
    }
    return { name: 'Contract Size', status: 'pass', message: 'All contracts within EIP-170 size limit' }
  } catch {
    return { name: 'Contract Size', status: 'warn', message: 'Could not check contract sizes' }
  }
}

function checkFoundryInstalled(): PreflightCheck {
  try {
    const version = execSync('forge --version', { stdio: 'pipe' }).toString().trim()
    return { name: 'Foundry', status: 'pass', message: version.split('\n')[0] ?? version }
  } catch {
    return { name: 'Foundry', status: 'fail', message: 'Foundry not installed. Run: curl -L https://foundry.paradigm.xyz | bash' }
  }
}
