import fs from 'node:fs/promises'
import path from 'node:path'

export interface ParsedContract {
  contractName: string
  address: string
  txHash: string
  blockNumber: number
}

/**
 * Parse Forge broadcast JSON file for deployed contract data.
 * Forge writes structured JSON to broadcast/{ScriptName}/{chainId}/run-latest.json
 */
export async function parseForgeBroadcast(
  contractsDir: string,
  scriptName: string,
  chainId: number,
): Promise<ParsedContract[]> {
  const broadcastPath = path.join(
    contractsDir,
    'broadcast',
    scriptName,
    String(chainId),
    'run-latest.json',
  )

  let content: string
  try {
    content = await fs.readFile(broadcastPath, 'utf-8')
  } catch {
    return []
  }

  try {
    const data = JSON.parse(content)
    const transactions = data.transactions ?? []
    const contracts: ParsedContract[] = []

    for (const tx of transactions) {
      if (tx.transactionType === 'CREATE' || tx.transactionType === 'CREATE2') {
        contracts.push({
          contractName: tx.contractName ?? 'Unknown',
          address: tx.contractAddress ?? '',
          txHash: tx.hash ?? '',
          blockNumber: tx.receipt?.blockNumber
            ? typeof tx.receipt.blockNumber === 'string'
              ? parseInt(tx.receipt.blockNumber, 16)
              : tx.receipt.blockNumber
            : 0,
        })
      }
    }

    return contracts
  } catch {
    return []
  }
}

/**
 * Fallback: parse forge script stdout for deployed addresses.
 * Used when broadcast files are unavailable (e.g., local Anvil without --broadcast).
 */
export function parseForgeStdout(stdout: string): ParsedContract[] {
  const contracts: ParsedContract[] = []

  // Match patterns like "Contract deployed at: 0x..." or "== Logs ==" section
  const addressRegex = /(?:deployed\s+(?:at|to)[:\s]+|contract\s+(\w+)\s+at\s+)(0x[a-fA-F0-9]{40})/gi
  const txRegex = /transaction[:\s]+\s*(0x[a-fA-F0-9]{64})/gi
  const blockRegex = /block[:\s]+\s*(\d+)/gi

  const addresses: string[] = []
  const names: string[] = []
  let match: RegExpExecArray | null

  while ((match = addressRegex.exec(stdout)) !== null) {
    names.push(match[1] || 'Contract')
    addresses.push(match[2]!)
  }

  const txHashes: string[] = []
  while ((match = txRegex.exec(stdout)) !== null) {
    txHashes.push(match[1]!)
  }

  const blockNumbers: number[] = []
  while ((match = blockRegex.exec(stdout)) !== null) {
    blockNumbers.push(parseInt(match[1]!, 10))
  }

  for (let i = 0; i < addresses.length; i++) {
    contracts.push({
      contractName: names[i] ?? `Contract_${i}`,
      address: addresses[i]!,
      txHash: txHashes[i] ?? '',
      blockNumber: blockNumbers[i] ?? 0,
    })
  }

  return contracts
}
