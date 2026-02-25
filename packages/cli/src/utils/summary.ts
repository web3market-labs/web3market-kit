import pc from 'picocolors'
import { getChainById, getContractUrl } from './chains.js'

export function renderDeploymentSummary(opts: {
  chain: string
  chainId: number
  contracts: Array<{ name: string; address: string }>
  duration?: number
  template?: string
  frontendUrl?: string
  anvilUrl?: string
}): void {
  const lines: string[] = []

  lines.push('')
  lines.push('  ' + pc.dim('\u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e'))
  lines.push('  ' + pc.dim('\u2502') + '  ' + pc.green('\u25CF') + ' ' + pc.bold(pc.green('Deployed')) + pc.dim(' \u2500\u2500 ') + opts.chain + pc.dim(` (${opts.chainId})`) + pad(opts.chain, opts.chainId))
  lines.push('  ' + pc.dim('\u2502'))

  if (opts.contracts.length > 0) {
    for (const c of opts.contracts) {
      const shortAddr = `${c.address.slice(0, 6)}\u2026${c.address.slice(-4)}`
      const explorerUrl = getContractUrl(opts.chainId, c.address)
      lines.push('  ' + pc.dim('\u2502') + '  ' + pc.dim('\u25B8') + ' ' + pc.bold(c.name) + '  ' + pc.cyan(shortAddr))
      if (explorerUrl) {
        lines.push('  ' + pc.dim('\u2502') + '    ' + pc.dim(explorerUrl))
      }
    }
    lines.push('  ' + pc.dim('\u2502'))
  }

  if (opts.frontendUrl || opts.anvilUrl) {
    if (opts.frontendUrl) {
      lines.push('  ' + pc.dim('\u2502') + '  ' + pc.dim('App') + '    ' + pc.underline(opts.frontendUrl))
    }
    if (opts.anvilUrl) {
      lines.push('  ' + pc.dim('\u2502') + '  ' + pc.dim('RPC') + '    ' + pc.underline(opts.anvilUrl))
    }
    lines.push('  ' + pc.dim('\u2502'))
  }

  if (opts.duration !== undefined) {
    lines.push('  ' + pc.dim('\u2502') + '  ' + pc.dim(`${(opts.duration / 1000).toFixed(1)}s`))
  }

  lines.push('  ' + pc.dim('\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f'))
  lines.push('')

  console.log(lines.join('\n'))
}

function pad(chain: string, chainId: number): string {
  const used = `  \u25CF Deployed \u2500\u2500 ${chain} (${chainId})`.length
  const total = 48
  const remaining = total - used
  return remaining > 0 ? ' '.repeat(remaining) + pc.dim('\u2502') : ' ' + pc.dim('\u2502')
}
