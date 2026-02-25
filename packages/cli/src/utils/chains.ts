export interface ChainInfo {
  id: number
  name: string
  slug: string
  testnet: boolean
  explorerUrl: string
  explorerName: string
}

export const CHAINS: Record<string, ChainInfo> = {
  ethereum: {
    id: 1,
    name: 'Ethereum',
    slug: 'ethereum',
    testnet: false,
    explorerUrl: 'https://etherscan.io',
    explorerName: 'Etherscan',
  },
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    slug: 'sepolia',
    testnet: true,
    explorerUrl: 'https://sepolia.etherscan.io',
    explorerName: 'Etherscan',
  },
  base: {
    id: 8453,
    name: 'Base',
    slug: 'base',
    testnet: false,
    explorerUrl: 'https://basescan.org',
    explorerName: 'BaseScan',
  },
  'base-sepolia': {
    id: 84532,
    name: 'Base Sepolia',
    slug: 'base-sepolia',
    testnet: true,
    explorerUrl: 'https://sepolia.basescan.org',
    explorerName: 'BaseScan',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    slug: 'arbitrum',
    testnet: false,
    explorerUrl: 'https://arbiscan.io',
    explorerName: 'Arbiscan',
  },
  'arbitrum-sepolia': {
    id: 421614,
    name: 'Arbitrum Sepolia',
    slug: 'arbitrum-sepolia',
    testnet: true,
    explorerUrl: 'https://sepolia.arbiscan.io',
    explorerName: 'Arbiscan',
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    slug: 'polygon',
    testnet: false,
    explorerUrl: 'https://polygonscan.com',
    explorerName: 'PolygonScan',
  },
  'polygon-amoy': {
    id: 80002,
    name: 'Polygon Amoy',
    slug: 'polygon-amoy',
    testnet: true,
    explorerUrl: 'https://amoy.polygonscan.com',
    explorerName: 'PolygonScan',
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    slug: 'optimism',
    testnet: false,
    explorerUrl: 'https://optimistic.etherscan.io',
    explorerName: 'OP Explorer',
  },
  'optimism-sepolia': {
    id: 11155420,
    name: 'OP Sepolia',
    slug: 'optimism-sepolia',
    testnet: true,
    explorerUrl: 'https://sepolia-optimistic.etherscan.io',
    explorerName: 'OP Explorer',
  },
  localhost: {
    id: 31337,
    name: 'Local (Anvil)',
    slug: 'localhost',
    testnet: true,
    explorerUrl: '',
    explorerName: 'Local',
  },
  anvil: {
    id: 31337,
    name: 'Local (Anvil)',
    slug: 'localhost',
    testnet: true,
    explorerUrl: '',
    explorerName: 'Local',
  },
}

export function getChain(slug: string): ChainInfo | undefined {
  return CHAINS[slug]
}

export function getChainById(id: number): ChainInfo | undefined {
  return Object.values(CHAINS).find((c) => c.id === id)
}

export function getChainId(slug: string): number | undefined {
  return CHAINS[slug]?.id
}

export function getContractUrl(chainId: number, address: string): string | null {
  const chain = getChainById(chainId)
  if (!chain || !chain.explorerUrl) return null
  return `${chain.explorerUrl}/address/${address}`
}

export function getTxUrl(chainId: number, txHash: string): string | null {
  const chain = getChainById(chainId)
  if (!chain || !chain.explorerUrl) return null
  return `${chain.explorerUrl}/tx/${txHash}`
}

export function getChainSelectOptions(): Array<{ value: string; label: string; hint?: string }> {
  return [
    { value: 'localhost', label: 'Local (Anvil)', hint: 'Free, for development' },
    { value: 'sepolia', label: 'Sepolia Testnet', hint: 'Ethereum testnet' },
    { value: 'base-sepolia', label: 'Base Sepolia', hint: 'Base testnet' },
    { value: 'arbitrum-sepolia', label: 'Arbitrum Sepolia', hint: 'Arbitrum testnet' },
    { value: 'polygon-amoy', label: 'Polygon Amoy', hint: 'Polygon testnet' },
    { value: 'optimism-sepolia', label: 'OP Sepolia', hint: 'Optimism testnet' },
    { value: 'ethereum', label: 'Ethereum Mainnet', hint: 'Requires Pro plan' },
    { value: 'base', label: 'Base', hint: 'Requires Pro plan' },
    { value: 'arbitrum', label: 'Arbitrum One', hint: 'Requires Pro plan' },
    { value: 'polygon', label: 'Polygon', hint: 'Requires Pro plan' },
    { value: 'optimism', label: 'Optimism', hint: 'Requires Pro plan' },
  ]
}

export function getSupportedChainSlugs(): string[] {
  return Object.keys(CHAINS).filter((k) => k !== 'anvil')
}
