import type { ComponentParameter } from '@web3marketlabs/sdk'

export interface AppTemplateFile {
  /** Handlebars template path relative to the template directory */
  templatePath: string
  /** Output path relative to project root (supports Handlebars interpolation) */
  outputPath: string
}

export interface AppTemplate {
  id: string
  displayName: string
  description: string
  version: string
  /** Component IDs to include (from @web3marketlabs/components registry) */
  components: string[]
  /** Additional template-level prompts beyond component params */
  parameters: ComponentParameter[]
  /** Skip prompts for these params — hardcode values instead */
  parameterOverrides: Record<string, string | boolean>
  /** Template-specific frontend .hbs files */
  frontendFiles: AppTemplateFile[]
  /** Extra npm dependencies for the frontend */
  npmDependencies: { name: string; version: string; dev?: boolean }[]
}
