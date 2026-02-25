import { execa } from 'execa'
import { writeDeployment } from './deployments.js'

export interface DeployOptions {
  script: string
  rpcUrl: string
  chainId: number
  contractsRoot: string
  deploymentsDir: string
  confirmations?: number
  extraArgs?: string[]
}

export interface DeployResult {
  chainId: number
  contractAddress: string
  txHash: string
  blockNumber: number
}

export async function deploy(options: DeployOptions): Promise<DeployResult[]> {
  const { script, rpcUrl, chainId, contractsRoot, deploymentsDir, confirmations = 2, extraArgs = [] } = options

  const args = [
    'script', script,
    '--broadcast',
    '--rpc-url', rpcUrl,
    '--confirmations', String(confirmations),
    ...extraArgs,
  ]

  const result = await execa('forge', args, {
    cwd: contractsRoot,
    env: process.env as Record<string, string>,
  })

  const results = parseForgeOutput(result.stdout, chainId)

  for (const deployment of results) {
    await writeDeployment(deploymentsDir, deployment)
  }

  return results
}

function parseForgeOutput(output: string, chainId: number): DeployResult[] {
  const results: DeployResult[] = []
  const addressRegex = /deployed\s+(?:at|to)[:\s]+\s*(0x[a-fA-F0-9]{40})/gi
  const txHashRegex = /transaction[:\s]+\s*(0x[a-fA-F0-9]{64})/gi
  const blockRegex = /block[:\s]+\s*(\d+)/gi

  let match: RegExpExecArray | null
  match = addressRegex.exec(output)
  while (match) {
    const address = match[1]!
    const txMatch = txHashRegex.exec(output)
    const blockMatch = blockRegex.exec(output)

    results.push({
      chainId,
      contractAddress: address,
      txHash: txMatch?.[1] ?? '0x',
      blockNumber: blockMatch ? Number.parseInt(blockMatch[1]!, 10) : 0,
    })

    match = addressRegex.exec(output)
  }

  return results
}
