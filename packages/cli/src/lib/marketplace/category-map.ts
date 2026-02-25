export const MODULE_CATEGORY_MAP: Record<
  string,
  { category: string; subcategory: string; defaultTags: string[] }
> = {
  token: { category: 'token-tools', subcategory: 'token-smart-contracts', defaultTags: ['erc20', 'token'] },
}

const CHAIN_NAME_MAP: Record<string, string> = {
  localhost: 'Ethereum',
  sepolia: 'Ethereum',
  'base-sepolia': 'Base',
  base: 'Base',
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  'polygon-mumbai': 'Polygon',
  arbitrum: 'Arbitrum',
  'arbitrum-sepolia': 'Arbitrum',
  optimism: 'Optimism',
  'optimism-sepolia': 'Optimism',
  avalanche: 'Avalanche',
  bsc: 'BNB Chain',
}

export function resolveBlockchains(chains: string[]): string[] {
  const set = new Set<string>()
  for (const chain of chains) {
    const mapped = CHAIN_NAME_MAP[chain.toLowerCase()]
    if (mapped) set.add(mapped)
    else set.add(chain)
  }
  return [...set]
}
