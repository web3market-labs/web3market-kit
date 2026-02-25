export interface ChainConfig {
  id: number
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: {
    public: { http: readonly string[] }
    default: { http: readonly string[] }
  }
  blockExplorers?: {
    etherscan?: { name: string; url: string }
    default: { name: string; url: string }
  }
  testnet?: boolean
}

function rpcWithEnvOverride(envKey: string, fallback: string): readonly string[] {
  const override = typeof process !== 'undefined' ? process.env[envKey] : undefined
  return override ? [override] : [fallback]
}

export const chains: Record<string, ChainConfig> = {
  anvil: {
    id: 31337,
    name: 'Anvil',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: ['http://127.0.0.1:8545'] },
      default: { http: ['http://127.0.0.1:8545'] },
    },
    testnet: true,
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('ETH_RPC_URL', 'https://eth.llamarpc.com') },
      default: { http: rpcWithEnvOverride('ETH_RPC_URL', 'https://eth.llamarpc.com') },
    },
    blockExplorers: {
      etherscan: { name: 'Etherscan', url: 'https://etherscan.io' },
      default: { name: 'Etherscan', url: 'https://etherscan.io' },
    },
  },
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('SEPOLIA_RPC_URL', 'https://rpc.sepolia.org') },
      default: { http: rpcWithEnvOverride('SEPOLIA_RPC_URL', 'https://rpc.sepolia.org') },
    },
    blockExplorers: {
      etherscan: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
      default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
    },
    testnet: true,
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('ARBITRUM_RPC_URL', 'https://arb1.arbitrum.io/rpc') },
      default: { http: rpcWithEnvOverride('ARBITRUM_RPC_URL', 'https://arb1.arbitrum.io/rpc') },
    },
    blockExplorers: {
      etherscan: { name: 'Arbiscan', url: 'https://arbiscan.io' },
      default: { name: 'Arbiscan', url: 'https://arbiscan.io' },
    },
  },
  arbitrumSepolia: {
    id: 421614,
    name: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc') },
      default: { http: rpcWithEnvOverride('ARBITRUM_SEPOLIA_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc') },
    },
    blockExplorers: {
      etherscan: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
      default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
    },
    testnet: true,
  },
  base: {
    id: 8453,
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('BASE_RPC_URL', 'https://mainnet.base.org') },
      default: { http: rpcWithEnvOverride('BASE_RPC_URL', 'https://mainnet.base.org') },
    },
    blockExplorers: {
      etherscan: { name: 'BaseScan', url: 'https://basescan.org' },
      default: { name: 'BaseScan', url: 'https://basescan.org' },
    },
  },
  baseSepolia: {
    id: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org') },
      default: { http: rpcWithEnvOverride('BASE_SEPOLIA_RPC_URL', 'https://sepolia.base.org') },
    },
    blockExplorers: {
      etherscan: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
      default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
    },
    testnet: true,
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('POLYGON_RPC_URL', 'https://polygon-rpc.com') },
      default: { http: rpcWithEnvOverride('POLYGON_RPC_URL', 'https://polygon-rpc.com') },
    },
    blockExplorers: {
      etherscan: { name: 'PolygonScan', url: 'https://polygonscan.com' },
      default: { name: 'PolygonScan', url: 'https://polygonscan.com' },
    },
  },
  polygonAmoy: {
    id: 80002,
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('POLYGON_AMOY_RPC_URL', 'https://rpc-amoy.polygon.technology') },
      default: { http: rpcWithEnvOverride('POLYGON_AMOY_RPC_URL', 'https://rpc-amoy.polygon.technology') },
    },
    blockExplorers: {
      etherscan: { name: 'PolygonScan', url: 'https://amoy.polygonscan.com' },
      default: { name: 'PolygonScan', url: 'https://amoy.polygonscan.com' },
    },
    testnet: true,
  },
  optimism: {
    id: 10,
    name: 'Optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('OPTIMISM_RPC_URL', 'https://mainnet.optimism.io') },
      default: { http: rpcWithEnvOverride('OPTIMISM_RPC_URL', 'https://mainnet.optimism.io') },
    },
    blockExplorers: {
      etherscan: { name: 'Optimism Explorer', url: 'https://optimistic.etherscan.io' },
      default: { name: 'Optimism Explorer', url: 'https://optimistic.etherscan.io' },
    },
  },
  optimismSepolia: {
    id: 11155420,
    name: 'Optimism Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      public: { http: rpcWithEnvOverride('OPTIMISM_SEPOLIA_RPC_URL', 'https://sepolia.optimism.io') },
      default: { http: rpcWithEnvOverride('OPTIMISM_SEPOLIA_RPC_URL', 'https://sepolia.optimism.io') },
    },
    blockExplorers: {
      etherscan: { name: 'Optimism Explorer', url: 'https://sepolia-optimistic.etherscan.io' },
      default: { name: 'Optimism Explorer', url: 'https://sepolia-optimistic.etherscan.io' },
    },
    testnet: true,
  },
} as const

export function getChain(chainIdOrName: number | string): ChainConfig | undefined {
  if (typeof chainIdOrName === 'string') {
    return chains[chainIdOrName]
  }
  return Object.values(chains).find((chain) => chain.id === chainIdOrName)
}
