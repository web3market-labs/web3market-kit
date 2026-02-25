import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { kitConfigSchema, type KitConfig, type KitConfigInput } from './schema.js'

const CONFIG_FILE_NAME = 'kit.config.ts'

export function defineConfig(config: KitConfigInput): KitConfigInput {
  return config
}

export interface LoadConfigOptions {
  cwd?: string
  configPath?: string
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<KitConfig> {
  const cwd = options.cwd ?? process.cwd()
  const configPath = options.configPath ?? resolve(cwd, CONFIG_FILE_NAME)

  if (!existsSync(configPath)) {
    throw new Error(
      `Configuration file not found: ${configPath}\nCreate a ${CONFIG_FILE_NAME} file in your project root or specify a custom path.`,
    )
  }

  const jiti = createJiti(cwd, { interopDefault: true })

  let raw: unknown
  try {
    raw = await jiti.import(configPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load configuration from ${configPath}: ${message}`)
  }

  const configValue =
    raw != null && typeof raw === 'object' && 'default' in raw
      ? (raw as Record<string, unknown>).default
      : raw

  const result = kitConfigSchema.safeParse(configValue ?? {})

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid configuration in ${configPath}:\n${formatted}`)
  }

  return result.data
}
