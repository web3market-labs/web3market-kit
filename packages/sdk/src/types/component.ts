export type ComponentTier = 'free' | 'pro' | 'enterprise'

export interface ComponentParameter {
  name: string
  prompt: string
  type: 'string' | 'boolean' | 'select'
  options?: { value: string; label: string; hint?: string }[]
  default?: string | boolean
  required?: boolean
  validate?: (value: string) => string | undefined
}

export interface ComponentFile {
  templatePath: string
  outputPath: string
  category: 'contract' | 'test' | 'script' | 'hook' | 'component' | 'config'
  template: boolean
}

export interface DeployHook {
  scriptPath: string
  contractName: string
  constructorArgs?: string[]
}

export interface CodegenPlugin {
  name: string
  generate?: (ctx: { contractName: string; abi: unknown[] }) => string
}

export interface KitComponent {
  id: string
  displayName: string
  description: string
  version: string
  tier: ComponentTier
  parameters: ComponentParameter[]
  files: ComponentFile[]
  solidityDependencies: { package: string; version?: string }[]
  npmDependencies: { name: string; version: string; dev?: boolean }[]
  requiredComponents: string[]
  conflictsWith: string[]
  deploy?: DeployHook
  codegenPlugin?: CodegenPlugin
}

export interface ModuleVariant {
  id: string
  name: string
  description: string
  hint: string
}

export interface DeployStep {
  order: number
  contractName: string
  scriptPath: string
  dependsOn?: string[]
  envVars: Record<string, string>
}

export interface WizardContext {
  projectRoot: string
  chain: string
  chainId: number
  existingModules: string[]
  apiKey?: string
}

export interface ModuleFile {
  templatePath: string
  outputPath: string
  category: 'contract' | 'test' | 'script' | 'hook' | 'component' | 'config' | 'lib'
  template: boolean
}

export interface KitModule {
  id: string
  displayName: string
  description: string
  version: string
  tier: ComponentTier
  variants?: ModuleVariant[]
  configSchema: unknown
  parameters: ComponentParameter[]
  requiredModules: string[]
  conflictsWith: string[]
  solidityDependencies: { package: string; version?: string }[]
  npmDependencies: { name: string; version: string; dev?: boolean }[]
  getFiles(config: Record<string, unknown>): ModuleFile[]
  getDeploymentSteps(config: Record<string, unknown>): DeployStep[]
  wizard?: (context: WizardContext) => Promise<Record<string, unknown>>
}
