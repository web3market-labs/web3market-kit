import { Command } from 'commander'
import pc from 'picocolors'
import { getProjectDeployments } from '../lib/deploy/history.js'
import { getChainById } from '../utils/chains.js'
import { formatTimestamp } from '../utils/time.js'
import { detectProject } from '../core/project-detector.js'

export function deploymentsCommand(): Command {
  return new Command('deployments')
    .description('View deployment history for the current project')
    .option('--chain <chain>', 'Filter by chain slug')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      await runDeployments(opts)
    })
}

interface DeploymentsOptions {
  chain?: string
  json?: boolean
}

async function runDeployments(opts: DeploymentsOptions): Promise<void> {
  const project = detectProject(process.cwd())
  const projectName = project?.name ?? 'Unknown Project'

  const history = await getProjectDeployments(process.cwd())

  if (opts.json) {
    let records = history.deployments
    if (opts.chain) {
      records = records.filter((d) => d.chain.toLowerCase().includes(opts.chain!.toLowerCase()))
    }
    console.log(JSON.stringify(records, null, 2))
    return
  }

  console.log('')
  console.log(pc.bold(`  Deployments — ${projectName}`))
  console.log(`  ${pc.dim('\u2500'.repeat(45))}`)
  console.log('')

  if (history.deployments.length === 0) {
    console.log(pc.dim('  No deployments found.'))
    console.log(pc.dim(`  Run ${pc.bold('w3m deploy --chain <chain>')} to deploy.`))
    console.log('')
    return
  }

  // Group by chain
  const byChain = new Map<number, typeof history.deployments>()
  for (const record of history.deployments) {
    if (opts.chain && !record.chain.toLowerCase().includes(opts.chain.toLowerCase())) {
      continue
    }
    if (!byChain.has(record.chainId)) {
      byChain.set(record.chainId, [])
    }
    byChain.get(record.chainId)!.push(record)
  }

  let totalContracts = 0

  for (const [chainId, records] of byChain) {
    const chainInfo = getChainById(chainId)
    const chainName = chainInfo?.name ?? records[0]?.chain ?? `Chain ${chainId}`
    const latestDeploy = records[0]?.deployedAt
    const timestamp = latestDeploy ? formatTimestamp(latestDeploy) : ''

    console.log(`  ${pc.bold(chainName)} ${pc.dim(`(${chainId})`)}${timestamp ? `${' '.repeat(Math.max(1, 40 - chainName.length - String(chainId).length))}${pc.dim(timestamp)}` : ''}`)

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!
      const isLast = i === records.length - 1
      const prefix = isLast ? '\u2514\u2500' : '\u251c\u2500'
      const shortAddr = `${record.address.slice(0, 6)}...${record.address.slice(-4)}`
      const explorerHint = record.explorerUrl ? pc.dim(`  ${record.explorerUrl}`) : ''
      console.log(`  ${pc.dim(prefix)} ${record.contractName.padEnd(18)} ${pc.cyan(shortAddr)}${explorerHint}`)
      totalContracts++
    }

    console.log('')
  }

  const chainCount = byChain.size
  console.log(pc.dim(`  ${chainCount} chain(s), ${totalContracts} contract(s)`))
  console.log('')
}
