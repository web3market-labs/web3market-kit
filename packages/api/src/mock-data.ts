export const MOCK_TOKENS: Record<string, Record<string, { name: string; symbol: string; decimals: number; totalSupply: string }>> = {
  '11155111': {
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { name: 'Uniswap', symbol: 'UNI', decimals: 18, totalSupply: '1000000000000000000000000000' },
    '0x514910771AF9Ca656af840dff83E8264EcF986CA': { name: 'Chainlink', symbol: 'LINK', decimals: 18, totalSupply: '1000000000000000000000000000' },
  },
}

export const MOCK_PRODUCTS = [
  { id: 1, title: 'ERC-20 Token Launcher', slug: 'erc20-token-launcher', status: 'approved', price: '0.00' },
]
