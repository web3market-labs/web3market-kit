import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DeployStep {
  order: number
  contractName: string
  scriptPath: string
  dependsOn?: string[]
  envVars: Record<string, string>
}

export interface DeployedContract {
  address: string
  txHash: string
  blockNumber: number
  constructorArgs: string[]
}

export interface DeploymentResult {
  chainId: number
  chain: string
  timestamp: string
  module: string
  variant?: string
  contracts: Record<string, DeployedContract>
  success: boolean
  error?: string
}

export interface OrchestratorOptions {
  projectRoot: string
  chainId: number
  chain: string
  rpcUrl: string
  deployerPrivateKey: string
  module: string
  variant?: string
  steps: DeployStep[]
  verify?: boolean
}

export async function deployModule(options: OrchestratorOptions): Promise<DeploymentResult> {
  const { projectRoot, chainId, chain, rpcUrl, deployerPrivateKey, module: moduleName, variant, steps, verify } = options

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  const deployedAddresses: Record<string, string> = {}
  const contracts: Record<string, DeployedContract> = {}

  for (const step of sortedSteps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!deployedAddresses[dep]) {
          return buildResult(chainId, chain, moduleName, variant, contracts, false, `Missing dependency: ${dep} for ${step.contractName}`)
        }
      }
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      DEPLOYER_PRIVATE_KEY: deployerPrivateKey,
      ...step.envVars,
    }

    for (const [name, addr] of Object.entries(deployedAddresses)) {
      env[`${name.toUpperCase()}_ADDRESS`] = addr
    }

    try {
      const forgeArgs = ['forge', 'script', step.scriptPath, '--rpc-url', rpcUrl, '--broadcast']
      if (verify) forgeArgs.push('--verify')

      const output = execSync(forgeArgs.join(' '), {
        cwd: projectRoot,
        env,
        stdio: 'pipe',
        timeout: 300_000,
      }).toString()

      const addressMatch = output.match(/Contract deployed at:\s*(0x[a-fA-F0-9]{40})/i)
        ?? output.match(/(0x[a-fA-F0-9]{40})/i)

      if (addressMatch) {
        const address = addressMatch[1] as string
        deployedAddresses[step.contractName] = address
        contracts[step.contractName] = {
          address,
          txHash: '',
          blockNumber: 0,
          constructorArgs: Object.values(step.envVars),
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return buildResult(chainId, chain, moduleName, variant, contracts, false, `Failed to deploy ${step.contractName}: ${msg.slice(0, 300)}`)
    }
  }

  const result = buildResult(chainId, chain, moduleName, variant, contracts, true)

  const deploymentsDir = join(projectRoot, 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const outPath = join(deploymentsDir, `${chainId}.json`)

  let existing: Record<string, unknown> = {}
  if (existsSync(outPath)) {
    try { existing = JSON.parse(readFileSync(outPath, 'utf-8')) } catch {}
  }

  const merged = {
    ...existing,
    ...result,
    contracts: { ...((existing as Record<string, unknown>).contracts as Record<string, unknown> || {}), ...result.contracts },
  }

  writeFileSync(outPath, JSON.stringify(merged, null, 2))

  return result
}

function buildResult(
  chainId: number,
  chain: string,
  module: string,
  variant: string | undefined,
  contracts: Record<string, DeployedContract>,
  success: boolean,
  error?: string,
): DeploymentResult {
  return { chainId, chain, timestamp: new Date().toISOString(), module, variant, contracts, success, error }
}
