import path from 'node:path'
import { Command } from 'commander'
import { execa } from 'execa'
import fs from 'fs-extra'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { autoTrackProject } from '../core/project-tracker.js'

export function testCommand(): Command {
  return new Command('test')
    .description('Run contract and TypeScript tests')
    .option('--contracts', 'Run only contract tests (forge test)')
    .option('--ts', 'Run only TypeScript tests (vitest)')
    .option('-v, --verbose', 'Show verbose test output')
    .action(async (opts) => {
      try {
        await runTest(opts)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tests failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

interface TestOptions {
  contracts?: boolean
  ts?: boolean
  verbose?: boolean
}

async function runTest(opts: TestOptions): Promise<void> {
  autoTrackProject(process.cwd())

  const runAll = !opts.contracts && !opts.ts
  const projectRoot = process.cwd()

  let contractsPassed = true
  let tsPassed = true
  let contractsRan = false
  let tsRan = false

  // Solidity / Forge tests
  if (runAll || opts.contracts) {
    const contractsDir = path.resolve(projectRoot, 'contracts')
    const hasContracts = await fs.pathExists(path.join(contractsDir, 'foundry.toml'))

    if (hasContracts) {
      logger.step('Running contract tests (forge test)...')
      contractsRan = true

      try {
        const forgeArgs = ['test']
        if (opts.verbose) forgeArgs.push('-vvv')

        const result = await execa('forge', forgeArgs, {
          cwd: contractsDir,
          stdio: opts.verbose ? 'inherit' : 'pipe',
        })

        if (!opts.verbose && result.stdout) {
          console.log(result.stdout)
        }

        logger.success('Contract tests passed')
      } catch (error: unknown) {
        contractsPassed = false
        if (!opts.verbose) {
          const stderr =
            error !== null && typeof error === 'object' && 'stderr' in error && typeof (error as any).stderr === 'string'
              ? (error as any).stderr
              : ''
          if (stderr) console.error(stderr)
        }
        logger.error('Contract tests failed')
      }
    } else {
      logger.info('No contracts directory with foundry.toml found — skipping contract tests')
    }
  }

  // TypeScript / Vitest tests
  if (runAll || opts.ts) {
    const vitestConfigCandidates = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vite.config.ts']

    const hasVitest = (
      await Promise.all(vitestConfigCandidates.map((f) => fs.pathExists(path.resolve(projectRoot, f))))
    ).some(Boolean)

    const webHasVitest = (
      await Promise.all(vitestConfigCandidates.map((f) => fs.pathExists(path.resolve(projectRoot, 'web', f))))
    ).some(Boolean)

    if (hasVitest || webHasVitest) {
      const testDir = hasVitest ? projectRoot : path.join(projectRoot, 'web')

      logger.step('Running TypeScript tests (vitest)...')
      tsRan = true

      try {
        await execa('npx', ['vitest', 'run'], {
          cwd: testDir,
          stdio: opts.verbose ? 'inherit' : 'pipe',
        })
        logger.success('TypeScript tests passed')
      } catch (error: unknown) {
        tsPassed = false
        if (!opts.verbose) {
          const stderr =
            error !== null && typeof error === 'object' && 'stderr' in error && typeof (error as any).stderr === 'string'
              ? (error as any).stderr
              : ''
          if (stderr) console.error(stderr)
        }
        logger.error('TypeScript tests failed')
      }
    } else {
      logger.info('No vitest config found — skipping TypeScript tests')
    }
  }

  // Summary
  console.log('')
  console.log(pc.bold('Test Results'))
  console.log(pc.dim('─'.repeat(40)))

  if (contractsRan) {
    console.log(`  Contracts (forge):  ${contractsPassed ? pc.green('PASS') : pc.red('FAIL')}`)
  }
  if (tsRan) {
    console.log(`  TypeScript (vitest): ${tsPassed ? pc.green('PASS') : pc.red('FAIL')}`)
  }
  if (!contractsRan && !tsRan) {
    console.log(pc.dim('  No test suites found.'))
  }

  console.log('')

  if (!contractsPassed || !tsPassed) {
    throw new Error('Some tests failed.')
  }

  if (contractsRan || tsRan) {
    logger.success('All tests passed!')
  }
}
