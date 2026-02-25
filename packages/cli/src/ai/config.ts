import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as p from '@clack/prompts'

export interface AiProviderConfig {
  provider: 'anthropic' | 'openai' | 'custom'
  apiKey: string
  model?: string
  baseUrl?: string
}

const CONFIG_DIR = path.join(os.homedir(), '.web3market')
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-config.json')

export function getAiConfig(): AiProviderConfig | null {
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function saveAiConfig(config: AiProviderConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n')
}

export function clearAiConfig(): void {
  try {
    fs.unlinkSync(CONFIG_FILE)
  } catch {
    // File doesn't exist
  }
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
}

export async function runAiSetup(): Promise<AiProviderConfig | null> {
  const provider = await p.select({
    message: 'Which AI provider do you want to use?',
    options: [
      { value: 'anthropic', label: 'Claude (Anthropic)', hint: 'Recommended' },
      { value: 'openai', label: 'GPT (OpenAI)' },
      { value: 'custom', label: 'Custom endpoint' },
    ],
  })

  if (p.isCancel(provider)) return null

  const apiKey = await p.text({
    message: 'Enter your API key:',
    placeholder: provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
    validate: (v) => (!v ? 'API key is required' : undefined),
  })

  if (p.isCancel(apiKey)) return null

  let baseUrl: string | undefined
  if (provider === 'custom') {
    const url = await p.text({
      message: 'Enter the API base URL:',
      placeholder: 'https://api.example.com/v1',
      validate: (v) => (!v ? 'Base URL is required' : undefined),
    })
    if (p.isCancel(url)) return null
    baseUrl = url as string
  }

  const defaultModel = DEFAULT_MODELS[provider as string] ?? ''
  const model = await p.text({
    message: 'Which model? (optional, press Enter for default)',
    placeholder: defaultModel,
    defaultValue: defaultModel,
  })

  if (p.isCancel(model)) return null

  const config: AiProviderConfig = {
    provider: provider as AiProviderConfig['provider'],
    apiKey: apiKey as string,
    model: (model as string) || defaultModel || undefined,
    baseUrl,
  }

  saveAiConfig(config)

  const providerName = provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'GPT' : 'Custom'
  const modelName = config.model ?? 'default'
  p.log.success(`AI provider configured: ${providerName} (${modelName})`)

  return config
}
