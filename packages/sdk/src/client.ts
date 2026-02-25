import {
  createPublicClient as viemCreatePublicClient,
  createWalletClient as viemCreateWalletClient,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { getChain, type ChainConfig } from './chains.js'

export interface CreateClientOptions {
  chainId: number
  rpcUrl?: string
}

export interface CreateWalletClientOptions extends CreateClientOptions {
  account: Account
}

function toViemChain(config: ChainConfig): Chain {
  return {
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [...config.rpcUrls.default.http] },
    },
    blockExplorers: config.blockExplorers
      ? { default: config.blockExplorers.default }
      : undefined,
    testnet: config.testnet,
  } as Chain
}

function resolveChain(chainId: number): Chain {
  const config = getChain(chainId)
  if (!config) {
    throw new Error(`Unknown chain ID: ${chainId}. Use a known chain or provide a custom rpcUrl.`)
  }
  return toViemChain(config)
}

export function createClient(options: CreateClientOptions): PublicClient<Transport, Chain> {
  const { chainId, rpcUrl } = options
  const chain = resolveChain(chainId)
  const transport = http(rpcUrl)
  return viemCreatePublicClient({ chain, transport }) as PublicClient<Transport, Chain>
}

export function createWalletClient(
  options: CreateWalletClientOptions
): WalletClient<Transport, Chain, Account> {
  const { chainId, rpcUrl, account } = options
  const chain = resolveChain(chainId)
  const transport = http(rpcUrl)
  return viemCreateWalletClient({ chain, transport, account }) as WalletClient<Transport, Chain, Account>
}
