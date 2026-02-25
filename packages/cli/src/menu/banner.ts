import pc from 'picocolors'
import type { UserInfo } from '../utils/api-client.js'
import { getAiConfig } from '../ai/config.js'

const VERSION = '0.2.0'

// ─── Big welcome screen (shown once on entry) ───────────────────────

export function renderWelcome(
  user?: UserInfo | null,
  projectName?: string | null,
  lastDeployment?: { chain: string; ago: string } | null,
): string {
  const lines: string[] = []

  lines.push('')
  lines.push(pc.bold(pc.magenta('  \u25C6')) + pc.bold(' web3') + pc.bold(pc.cyan('.market')) + pc.dim(` v${VERSION}`))
  lines.push(pc.dim('  Ship tokens, dApps & smart contracts from your terminal'))
  lines.push('')

  // Status bar — pill-style indicators
  const pills: string[] = []

  if (user) {
    pills.push(pc.green('\u25CF') + ' ' + pc.bold(user.name) + pc.dim(` ${capitalize(user.tier)}`))
  } else {
    pills.push(pc.dim('\u25CB not connected'))
  }

  if (projectName) {
    pills.push(pc.cyan('\u25A0') + ' ' + pc.bold(projectName))
  }

  const aiConfig = getAiConfig()
  if (aiConfig) {
    const aiName = aiConfig.provider === 'anthropic' ? 'Claude' : aiConfig.provider === 'openai' ? 'GPT' : 'Custom'
    pills.push(pc.yellow('\u26A1') + ' ' + aiName)
  }

  if (lastDeployment) {
    pills.push(pc.green('\u2191') + pc.dim(` ${lastDeployment.chain} ${lastDeployment.ago}`))
  }

  lines.push('  ' + pills.join(pc.dim('  \u2502  ')))
  lines.push(pc.dim('  ' + '\u2500'.repeat(52)))

  return lines.join('\n')
}

// ─── Compact banner (shown between menu loops, optional) ─────────────

export function renderBanner(
  user?: UserInfo | null,
  projectName?: string | null,
  lastDeployment?: { chain: string; ago: string } | null,
): string {
  const parts: string[] = []
  parts.push(pc.bold(pc.magenta('\u25C6')) + pc.bold(' web3') + pc.bold(pc.cyan('.market')))
  if (user) {
    parts.push(pc.green(user.name))
  }
  if (projectName) {
    parts.push(pc.cyan(projectName))
  }
  if (lastDeployment) {
    parts.push(pc.dim(`${lastDeployment.chain} ${lastDeployment.ago}`))
  }
  return `  ${parts.join(pc.dim('  \u2502  '))}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
