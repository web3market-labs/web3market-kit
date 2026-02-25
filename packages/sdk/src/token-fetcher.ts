import { createClient } from './client.js'

const ERC20_ABI = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
] as const

export interface TokenInfo {
  address: string
  name: string
  symbol: string
  decimals: number
  totalSupply: string
  owner?: string
  paused?: boolean
}

export async function fetchTokenInfo(
  address: `0x${string}`,
  chainId: number,
  rpcUrl?: string,
): Promise<TokenInfo> {
  const client = createClient({ chainId, rpcUrl })
  const contractBase = { address, abi: ERC20_ABI } as const

  const [nameResult, symbolResult, decimalsResult, totalSupplyResult] =
    await Promise.all([
      client.readContract({ ...contractBase, functionName: 'name' }),
      client.readContract({ ...contractBase, functionName: 'symbol' }),
      client.readContract({ ...contractBase, functionName: 'decimals' }),
      client.readContract({ ...contractBase, functionName: 'totalSupply' }),
    ])

  const [ownerResult, pausedResult] = await Promise.allSettled([
    client.readContract({ ...contractBase, functionName: 'owner' }),
    client.readContract({ ...contractBase, functionName: 'paused' }),
  ])

  return {
    address,
    name: nameResult as string,
    symbol: symbolResult as string,
    decimals: Number(decimalsResult),
    totalSupply: String(totalSupplyResult),
    owner: ownerResult.status === 'fulfilled' ? (ownerResult.value as string) : undefined,
    paused: pausedResult.status === 'fulfilled' ? (pausedResult.value as boolean) : undefined,
  }
}
