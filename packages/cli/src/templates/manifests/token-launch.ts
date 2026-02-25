import type { AppTemplate } from '../types.js'

export const tokenLaunchTemplate: AppTemplate = {
  id: 'token-launch',
  displayName: 'Token Launch',
  description: 'Launch your own ERC-20 token with a mint/transfer dashboard',
  version: '1.0.0',
  components: ['token'],
  parameters: [],
  parameterOverrides: {
    mintable: true,
    burnable: true,
  },
  frontendFiles: [
    { templatePath: 'token-launch/frontend/page.tsx.hbs', outputPath: 'web/app/page.tsx' },
    { templatePath: 'token-launch/frontend/TokenDashboard.tsx.hbs', outputPath: 'web/components/TokenDashboard.tsx' },
    { templatePath: 'token-launch/frontend/MintForm.tsx.hbs', outputPath: 'web/components/MintForm.tsx' },
    { templatePath: 'token-launch/frontend/TransferForm.tsx.hbs', outputPath: 'web/components/TransferForm.tsx' },
    { templatePath: 'token-launch/frontend/TokenStats.tsx.hbs', outputPath: 'web/components/TokenStats.tsx' },
  ],
  npmDependencies: [],
}
