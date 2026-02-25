import * as p from '@clack/prompts'
import pc from 'picocolors'
import { readApiKey } from '../utils/credentials.js'
import { getAiConfig, runAiSetup } from '../ai/config.js'
import { listProjects } from '../core/project-store.js'
import { createClient, type UserInfo } from '../utils/api-client.js'
import { logger } from '../utils/logger.js'

/**
 * Returns true when no API key, no AI config, and no recent projects exist.
 * Once any of these are set, onboarding doesn't re-trigger.
 */
export function isFirstRun(): boolean {
  const hasApiKey = readApiKey() !== null
  const hasAiConfig = getAiConfig() !== null
  const hasProjects = listProjects().length > 0
  return !hasApiKey && !hasAiConfig && !hasProjects
}

/**
 * Lightweight first-run experience.
 * One question: quick-setup or jump straight in.
 */
export async function runOnboarding(): Promise<void> {
  console.log('')
  console.log(pc.dim('  First time? Let\u2019s get you set up in 30 seconds.'))
  console.log('')

  const action = await p.select({
    message: 'How do you want to start?',
    options: [
      { value: 'setup', label: 'Quick setup', hint: 'API key + AI provider' },
      { value: 'skip', label: 'Skip, just build', hint: 'Local dev works without any setup' },
    ],
  })

  if (p.isCancel(action) || action === 'skip') return

  // ── API key ──
  let step = 0
  while (step < 2) {
    if (step === 0) {
      console.log('')
      console.log(`  ${pc.dim('Get a free key at')} ${pc.underline('https://web3.market/dashboard/plan')}`)
      console.log('')

      const key = await p.text({
        message: 'API key:',
        placeholder: 'wm_sk_... or press Enter to skip',
      })

      if (p.isCancel(key)) return
      if (key) {
        await saveAndValidateApiKey(key as string)
      }
      step = 1
      continue
    }

    if (step === 1) {
      const aiChoice = await p.select({
        message: 'Connect an AI model?',
        options: [
          { value: 'yes', label: 'Yes', hint: 'Claude, GPT, or custom \u2014 for code customization & auto-fix' },
          { value: 'skip', label: 'Skip for now' },
        ],
      })

      if (p.isCancel(aiChoice)) {
        step = 0
        continue
      }

      if (aiChoice === 'yes') {
        console.log('')
        await runAiSetup()
      }
      step = 2
    }
  }

  // ── Summary ──
  const apiKey = readApiKey()
  const aiConfig = getAiConfig()

  if (apiKey || aiConfig) {
    console.log('')
    const parts: string[] = []
    if (apiKey) parts.push(pc.green('\u25CF') + ' API connected')
    if (aiConfig) {
      const name = aiConfig.provider === 'anthropic' ? 'Claude' : aiConfig.provider === 'openai' ? 'GPT' : 'Custom'
      parts.push(pc.green('\u25CF') + ` AI: ${name}`)
    }
    console.log('  ' + parts.join(pc.dim('  \u2502  ')))
    console.log('')
    logger.success('Ready to build')
  }
  console.log('')
}

async function saveAndValidateApiKey(key: string): Promise<void> {
  try {
    const client = createClient(key)
    const user: UserInfo = await client.getMe()
    const { writeApiKey } = await import('../utils/credentials.js')
    writeApiKey(key)
    logger.success(`Authenticated as ${pc.bold(user.name)} ${pc.dim(`(${capitalize(user.tier)})`)}`)
  } catch {
    logger.error('Invalid API key \u2014 you can add it later from the menu.')
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
