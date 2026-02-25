import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

export type AddressRegistry = Record<number, `0x${string}`>

export function getAddress(registry: AddressRegistry, chainId: number): `0x${string}` {
  const address = registry[chainId]
  if (!address) {
    throw new Error(
      `No address found for chain ID ${chainId}. Available chains: ${Object.keys(registry).join(', ') || 'none'}`
    )
  }
  return address
}

export function hasAddress(registry: AddressRegistry, chainId: number): boolean {
  return chainId in registry
}

interface DeploymentFile {
  [chainId: string]: string
}

export function loadDeployments(deploymentsDir: string): Record<string, AddressRegistry> {
  const result: Record<string, AddressRegistry> = {}

  let files: string[]
  try {
    files = readdirSync(deploymentsDir)
  } catch {
    throw new Error(`Failed to read deployments directory: ${deploymentsDir}`)
  }

  const jsonFiles = files.filter((file) => file.endsWith('.json'))

  for (const file of jsonFiles) {
    const contractName = basename(file, '.json')
    const filePath = join(deploymentsDir, file)

    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch {
      throw new Error(`Failed to read deployment file: ${filePath}`)
    }

    let parsed: DeploymentFile
    try {
      parsed = JSON.parse(raw) as DeploymentFile
    } catch {
      throw new Error(`Invalid JSON in deployment file: ${filePath}`)
    }

    const registry: AddressRegistry = {}
    for (const [chainIdStr, address] of Object.entries(parsed)) {
      const chainId = Number(chainIdStr)
      if (Number.isNaN(chainId)) {
        throw new Error(`Invalid chain ID "${chainIdStr}" in deployment file: ${filePath}`)
      }
      if (!address.startsWith('0x')) {
        throw new Error(`Invalid address "${address}" for chain ${chainId} in ${filePath}: must start with 0x`)
      }
      registry[chainId] = address as `0x${string}`
    }

    result[contractName] = registry
  }

  return result
}
