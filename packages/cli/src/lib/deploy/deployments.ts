import fs from 'node:fs/promises'
import path from 'node:path'
import type { DeployResult } from './deployer.js'

export interface DeploymentContract {
  contractName: string
  address: string
  txHash: string
  blockNumber: number
  deployedAt: string
}

export interface Deployment {
  chainId: number
  chain?: string
  template?: string
  deployedAt?: string
  contracts: Record<string, DeploymentContract>
}

export async function writeDeployment(deploymentsDir: string, result: DeployResult): Promise<void> {
  await fs.mkdir(deploymentsDir, { recursive: true })

  const filePath = path.join(deploymentsDir, `${result.chainId}.json`)

  let existing: Deployment = { chainId: result.chainId, contracts: {} }
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    existing = JSON.parse(content)
  } catch {
    // File doesn't exist yet
  }

  const contractKey = result.contractAddress
  existing.contracts[contractKey] = {
    contractName: contractKey,
    address: result.contractAddress,
    txHash: result.txHash,
    blockNumber: result.blockNumber,
    deployedAt: new Date().toISOString(),
  }

  await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + '\n')
}

export async function writeStructuredDeployment(
  deploymentsDir: string,
  opts: {
    chainId: number
    chain: string
    template?: string
    contracts: Array<{ contractName: string; address: string; txHash: string; blockNumber: number }>
  },
): Promise<void> {
  await fs.mkdir(deploymentsDir, { recursive: true })

  const filePath = path.join(deploymentsDir, `${opts.chainId}.json`)

  let existing: Deployment = { chainId: opts.chainId, contracts: {} }
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    existing = JSON.parse(content)
  } catch {
    // File doesn't exist yet
  }

  existing.chain = opts.chain
  existing.deployedAt = new Date().toISOString()
  if (opts.template) {
    existing.template = opts.template
  }

  for (const contract of opts.contracts) {
    existing.contracts[contract.contractName] = {
      contractName: contract.contractName,
      address: contract.address,
      txHash: contract.txHash,
      blockNumber: contract.blockNumber,
      deployedAt: new Date().toISOString(),
    }
  }

  await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + '\n')
}

export async function readDeployment(deploymentsDir: string, chainId: number): Promise<Deployment | null> {
  const filePath = path.join(deploymentsDir, `${chainId}.json`)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function readAllDeployments(deploymentsDir: string): Promise<Deployment[]> {
  const deployments: Deployment[] = []
  try {
    const files = await fs.readdir(deploymentsDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await fs.readFile(path.join(deploymentsDir, file), 'utf-8')
        deployments.push(JSON.parse(content))
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return deployments
}
