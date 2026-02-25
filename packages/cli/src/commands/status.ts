import { Command } from 'commander'
import pc from 'picocolors'
import { readApiKey } from '../utils/credentials.js'
import { createClient } from '../utils/api-client.js'
import { detectProject } from '../core/project-detector.js'
import { getProjectDeployments } from '../lib/deploy/history.js'
import { getChainById } from '../utils/chains.js'
import { timeAgo } from '../utils/time.js'

export function statusCommand(): Command {
  return new Command('status')
    .description('Show account and project status at a glance')
    .action(async () => {
      console.log('')

      // Auth status
      const apiKey = readApiKey()
      if (apiKey) {
        try {
          const client = createClient(apiKey)
          const user = await client.getMe()
          console.log(pc.bold('  Account'))
          console.log(`  Name:  ${user.name}`)
          console.log(`  Email: ${user.email}`)
          console.log(`  Tier:  ${pc.bold(user.tier)}`)
          console.log(`  Key:   ${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`)
        } catch {
          console.log(pc.bold('  Account'))
          console.log(`  ${pc.yellow('API key invalid or expired')}`)
        }
      } else {
        console.log(pc.bold('  Account'))
        console.log(`  ${pc.dim('Not authenticated')}`)
        console.log(`  Run ${pc.bold('w3m auth <key>')} to get started.`)
      }

      console.log('')

      // Project status
      const project = detectProject(process.cwd())
      if (project) {
        console.log(pc.bold('  Project'))
        console.log(`  Name:       ${project.name}`)
        console.log(`  Path:       ${project.path}`)
        if (project.components.length > 0) {
          console.log(`  Components: ${project.components.join(', ')}`)
        }
        if (project.chains.length > 0) {
          console.log(`  Chains:     ${project.chains.join(', ')}`)
        }

        // Deployment status
        const history = await getProjectDeployments(process.cwd())
        if (history.deployments.length > 0) {
          console.log('')
          console.log(pc.bold('  Deployments'))

          // Group by chain
          const byChain = new Map<number, typeof history.deployments>()
          for (const record of history.deployments) {
            if (!byChain.has(record.chainId)) {
              byChain.set(record.chainId, [])
            }
            byChain.get(record.chainId)!.push(record)
          }

          for (const [chainId, records] of byChain) {
            const chainInfo = getChainById(chainId)
            const chainName = chainInfo?.name ?? `Chain ${chainId}`
            const contractCount = records.length
            const latest = records[0]?.deployedAt
            const ago = latest ? timeAgo(latest) : ''
            console.log(`  ${chainName}: ${contractCount} contract(s)${ago ? ` (${ago})` : ''}`)
            for (const record of records.slice(0, 3)) {
              const shortAddr = `${record.address.slice(0, 6)}...${record.address.slice(-4)}`
              console.log(`    ${pc.dim(record.contractName)} ${pc.cyan(shortAddr)}${record.explorerUrl ? pc.dim(` ${record.explorerUrl}`) : ''}`)
            }
            if (records.length > 3) {
              console.log(pc.dim(`    ... and ${records.length - 3} more`))
            }
          }
        }
      } else {
        console.log(pc.bold('  Project'))
        console.log(`  ${pc.dim('Not inside a project directory')}`)
        console.log(`  Run ${pc.bold('w3m new <name>')} to create one.`)
      }

      console.log('')
    })
}
