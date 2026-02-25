import path from 'node:path'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { getAiClient } from '../utils/ai.js'

export function auditCommand(): Command {
  return new Command('audit')
    .description('Run security checks on local contracts')
    .option('--slither', 'Run Slither static analysis')
    .option('--ai', 'Run AI-powered contract review')
    .action(async (opts) => {
      try {
        await runAudit(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Audit failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

interface AuditOptions {
  slither?: boolean
  ai?: boolean
}

async function runAudit(opts: AuditOptions): Promise<void> {
  const projectRoot = process.cwd()
  const contractsDir = path.resolve(projectRoot, 'contracts')
  const srcDir = path.join(contractsDir, 'src')

  p.intro(pc.bgCyan(pc.black(' Web3 Market — Security Audit ')))

  if (!(await fs.pathExists(srcDir))) {
    throw new Error('No contracts/src directory found. Are you in a Web3 Market project?')
  }

  const runAll = !opts.slither && !opts.ai

  // Env security check
  logger.step('Checking environment security...')
  const { validateEnvSecurity } = await import('../lib/security/index.js')
  const envResult = validateEnvSecurity(process.env as Record<string, string>)
  if (envResult.errors.length > 0) {
    for (const err of envResult.errors) {
      logger.error(err)
    }
  }
  for (const warn of envResult.warnings) {
    logger.warn(warn)
  }
  if (envResult.valid && envResult.warnings.length === 0) {
    logger.success('Environment security checks passed')
  }

  // Slither analysis
  if (runAll || opts.slither) {
    logger.step('Running Slither static analysis...')
    try {
      const { runSlither } = await import('../lib/security/index.js')
      const result = await runSlither(contractsDir)

      if (result.findings.length === 0) {
        logger.success('Slither: no issues found')
      } else {
        const high = result.findings.filter((f) => f.impact === 'High')
        const medium = result.findings.filter((f) => f.impact === 'Medium')
        const low = result.findings.filter((f) => f.impact === 'Low' || f.impact === 'Informational')

        if (high.length > 0) {
          logger.error(`Slither: ${high.length} high-severity issue(s)`)
          for (const f of high) {
            console.log(pc.red(`  HIGH: ${f.description}`))
          }
        }
        if (medium.length > 0) {
          logger.warn(`Slither: ${medium.length} medium-severity issue(s)`)
          for (const f of medium) {
            console.log(pc.yellow(`  MEDIUM: ${f.description}`))
          }
        }
        if (low.length > 0) {
          logger.info(`Slither: ${low.length} low/info finding(s)`)
        }
      }
    } catch {
      logger.warn('Slither not available — install with: pip install slither-analyzer')
    }
  }

  // AI review
  if (runAll || opts.ai) {
    const client = getAiClient()
    if (!client) {
      logger.info('AI review skipped — authenticate with w3m auth <key>')
    } else {
      logger.step('Running AI contract review...')

      const files = await fs.readdir(srcDir)
      const solFiles = files.filter((f) => f.endsWith('.sol'))

      for (const file of solFiles) {
        const source = await fs.readFile(path.join(srcDir, file), 'utf-8')
        try {
          const result = await client.aiReview(source, file)

          if (result.issues.length === 0) {
            logger.success(`[AI] ${file} — no issues found`)
            continue
          }

          const critical = result.issues.filter((i) => i.severity === 'critical')
          const warnings = result.issues.filter((i) => i.severity === 'warning')

          if (critical.length > 0) {
            logger.error(`[AI] ${file} — ${critical.length} critical issue(s)`)
            for (const issue of critical) {
              console.log(pc.red(`  CRITICAL: ${issue.description}`))
              console.log(pc.dim(`  Suggestion: ${issue.suggestion}`))
            }
          }

          if (warnings.length > 0) {
            logger.warn(`[AI] ${file} — ${warnings.length} warning(s)`)
            for (const issue of warnings) {
              console.log(pc.yellow(`  WARNING: ${issue.description}`))
              console.log(pc.dim(`  Suggestion: ${issue.suggestion}`))
            }
          }
        } catch {
          logger.warn(`[AI] Could not review ${file}`)
        }
      }
    }
  }

  console.log('')
  p.outro(pc.green('Audit complete'))
}
