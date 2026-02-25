import { z } from 'zod'

const rpcUrlSchema = z.union([
  z.string().url('RPC URL must be a valid URL'),
  z.object({ env: z.string().min(1, 'Environment variable name must not be empty') }),
])

const chainTargetSchema = z.object({
  chainId: z.number().int().positive('Chain ID must be a positive integer'),
  rpcUrl: rpcUrlSchema,
})

const contractsSchema = z.object({
  framework: z.enum(['foundry', 'hardhat'], {
    errorMap: () => ({ message: "Contract framework must be either 'foundry' or 'hardhat'" }),
  }),
  root: z.string().default('contracts'),
  include: z.array(z.string()).default(['**/*.sol']),
  exclude: z.array(z.string()).default(['**/test/**', '**/script/**']),
})

const chainsSchema = z.object({
  default: z.string().default('localhost'),
  targets: z.record(z.string(), chainTargetSchema).default({
    localhost: { chainId: 31337, rpcUrl: 'http://127.0.0.1:8545' },
  }),
})

const codegenSchema = z.object({
  outDir: z.string().default('src/generated'),
  hooks: z.boolean().default(true),
  components: z.boolean().default(false),
})

const deploySchema = z.object({
  verify: z.boolean().default(true),
  confirmations: z.number().int().positive().default(2),
})

const apiKeysSchema = z.object({
  web3market: z.string().optional(),
  anthropic: z.string().optional(),
}).optional()

const aiSchema = z.object({
  enabled: z.boolean().default(false),
  model: z.string().default('claude-sonnet-4-5-20250929'),
}).optional()

const vercelSchema = z.object({
  enabled: z.boolean().default(false),
  projectName: z.string().optional(),
}).optional()

const marketplaceSchema = z.object({
  autoPublish: z.boolean().default(false),
  defaultPrice: z.string().default('0'),
  supportEnabled: z.boolean().default(true),
}).optional()

const modulesSchema = z.record(z.string(), z.unknown()).default({})

export const kitConfigSchema = z.object({
  contracts: contractsSchema.default({
    framework: 'foundry',
    root: 'contracts',
    include: ['**/*.sol'],
    exclude: ['**/test/**', '**/script/**'],
  }),
  chains: chainsSchema.default({
    default: 'localhost',
    targets: { localhost: { chainId: 31337, rpcUrl: 'http://127.0.0.1:8545' } },
  }),
  codegen: codegenSchema.default({ outDir: 'src/generated', hooks: true, components: false }),
  deploy: deploySchema.default({ verify: true, confirmations: 2 }),
  modules: modulesSchema,
  apiKeys: apiKeysSchema,
  components: z.array(z.string()).default([]),
  template: z.string().optional(),
  ai: aiSchema,
  vercel: vercelSchema,
  marketplace: marketplaceSchema,
})

export type KitConfig = z.infer<typeof kitConfigSchema>
export type KitConfigInput = z.input<typeof kitConfigSchema>
