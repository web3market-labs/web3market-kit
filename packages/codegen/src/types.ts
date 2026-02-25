export interface ContractArtifact {
  name: string
  abi: readonly unknown[]
  bytecode?: string
  deployedBytecode?: string
  sourcePath?: string
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface CodegenPlugin {
  name: string
  resolve?: (config: ResolveConfig) => Promise<ContractArtifact[]>
  generate?: (artifacts: ContractArtifact[]) => Promise<GeneratedFile[]>
  validate?: (files: GeneratedFile[]) => Promise<ValidationResult>
}

export interface ResolveConfig {
  root: string
  include: string[]
  exclude: string[]
  framework: 'foundry' | 'hardhat'
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface AbiFunctionItem {
  type: 'function'
  name: string
  inputs: readonly AbiParameter[]
  outputs: readonly AbiParameter[]
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable'
}

export interface AbiEventItem {
  type: 'event'
  name: string
  inputs: readonly (AbiParameter & { indexed?: boolean })[]
}

export interface AbiParameter {
  name: string
  type: string
  components?: readonly AbiParameter[]
  internalType?: string
}

export type AbiItem = AbiFunctionItem | AbiEventItem | { type: string; [key: string]: unknown }
