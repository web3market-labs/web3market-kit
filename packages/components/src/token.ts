import type { KitComponent } from '@web3market/sdk'

export const tokenComponent: KitComponent = {
  id: 'token',
  displayName: 'ERC-20 Token',
  description: 'Fungible token with configurable mint, burn, and pause capabilities',
  version: '1.0.0',
  tier: 'free',
  parameters: [
    { name: 'tokenName', prompt: 'Token name', type: 'string', default: 'My Token', required: true },
    { name: 'tokenSymbol', prompt: 'Token symbol', type: 'string', default: 'MTK', required: true },
    { name: 'mintable', prompt: 'Enable minting?', type: 'boolean', default: true },
    { name: 'burnable', prompt: 'Enable burning?', type: 'boolean', default: true },
    { name: 'pausable', prompt: 'Enable pausing?', type: 'boolean', default: false },
    { name: 'initialSupply', prompt: 'Initial supply', type: 'string', default: '1000000' },
  ],
  files: [
    { templatePath: 'templates/token/Token.sol.hbs', outputPath: 'contracts/src/{{tokenSymbol}}Token.sol', category: 'contract', template: true },
    { templatePath: 'templates/token/Token.t.sol.hbs', outputPath: 'contracts/test/{{tokenSymbol}}Token.t.sol', category: 'test', template: true },
    { templatePath: 'templates/token/DeployToken.s.sol.hbs', outputPath: 'contracts/script/Deploy{{tokenSymbol}}Token.s.sol', category: 'script', template: true },
    { templatePath: 'templates/token/useToken.ts.hbs', outputPath: 'src/hooks/useToken.ts', category: 'hook', template: true },
    { templatePath: 'templates/token/TokenBalance.tsx.hbs', outputPath: 'src/components/TokenBalance.tsx', category: 'component', template: true },
    { templatePath: 'templates/token/TokenTransfer.tsx.hbs', outputPath: 'src/components/TokenTransfer.tsx', category: 'component', template: true },
  ],
  solidityDependencies: [{ package: '@openzeppelin/contracts', version: '^5.1.0' }],
  npmDependencies: [],
  requiredComponents: [],
  conflictsWith: [],
  deploy: {
    scriptPath: 'contracts/script/Deploy{{tokenSymbol}}Token.s.sol',
    contractName: '{{tokenSymbol}}Token',
  },
}
