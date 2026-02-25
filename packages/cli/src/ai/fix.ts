import { existsSync } from 'node:fs'
import * as p from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import { logger } from '../utils/logger.js'
import { getAiConfig, runAiSetup, type AiProviderConfig } from './config.js'
import { sendToAi } from './client.js'
import { collectProjectContext, type ProjectContext } from './context.js'
import { parseAiChanges, showDiffPreview, applyChanges } from './diff.js'

export interface BuildResult {
  success: boolean
  stderr: string
  stdout: string
}

export interface AiFixOptions {
  projectRoot: string
  contractsDir: string
  errorOutput?: string
  maxRetries?: number
  auto?: boolean
}

export interface AiFixResult {
  success: boolean
  attempts: number
  remainingErrors?: string
}

/**
 * Run `forge build` and capture output.
 */
export async function runBuildAndCapture(contractsDir: string): Promise<BuildResult> {
  try {
    const result = await execa('forge', ['build'], { cwd: contractsDir, stdio: 'pipe' })
    return { success: true, stderr: '', stdout: result.stdout }
  } catch (error: any) {
    return {
      success: false,
      stderr: error?.stderr || error?.message || 'Unknown build error',
      stdout: error?.stdout || '',
    }
  }
}

/**
 * Build a system prompt specialized for fixing compilation errors.
 * Distinct from buildSystemPrompt in context.ts — focused only on error repair.
 */
export function buildFixSystemPrompt(context: ProjectContext, errorOutput: string, previousAttempt?: string): string {
  const parts: string[] = []

  parts.push(`You are a Solidity compilation error fixer. Your ONLY job is to fix the compilation errors shown below. Do NOT refactor, improve, or change any code beyond what is strictly necessary to fix the errors.

COMPILATION ERRORS:
${errorOutput}`)

  if (previousAttempt) {
    parts.push(`
IMPORTANT — PREVIOUS FIX ATTEMPT FAILED:
Your previous fix was applied but the build still fails with the errors above.
The errors changed, meaning your fix was partially correct but introduced new issues or missed something.
Analyze what went wrong and try a different approach.`)
  }

  parts.push(`
Rules:
- Fix ONLY the errors above — do not refactor or improve code
- Keep all changes minimal and targeted
- Use OpenZeppelin v5.x patterns for Solidity
- Return changes as a JSON array: [{ "path": "relative/path", "content": "full file content" }]
- Only include files that actually changed
- Do NOT include explanations outside the JSON — just return the JSON array
- The "path" must be relative to the project root (e.g., "contracts/src/Token.sol")`)

  if (context.config) {
    parts.push(`\n--- kit.config.ts ---\n${context.config}`)
  }

  if (context.contracts.length > 0) {
    parts.push('\n--- Contracts ---')
    for (const c of context.contracts) {
      parts.push(`\n--- ${c.path} ---\n${c.content}`)
    }
  }

  // Only contracts — no frontend files since we're fixing Solidity compilation

  return parts.join('\n')
}

/**
 * Orchestrate AI-powered build error fixing.
 *
 * 1. Pre-flight checks (contracts dir, forge installed)
 * 2. Ensure AI configured (inline setup if not)
 * 3. Run build to capture errors (or use provided errorOutput)
 * 4. If build passes, return early
 * 5. Fix loop (up to maxRetries):
 *    - Collect project context (re-read each iteration since files may have been patched)
 *    - Build fix prompt with error output + previous attempt context
 *    - Send to AI → parse changes (with retry on parse failure) → show diff → confirm → apply
 *    - Re-run build to verify
 *    - If still failing, loop with new errors
 * 6. Return result
 */
export async function runAiFix(options: AiFixOptions): Promise<AiFixResult> {
  const { projectRoot, contractsDir, maxRetries = 3, auto = false } = options
  let { errorOutput } = options

  // 0. Pre-flight checks
  if (!existsSync(contractsDir)) {
    logger.error(`Contracts directory not found: ${contractsDir}`)
    logger.info('Make sure you are in a project root with a contracts/ directory.')
    return { success: false, attempts: 0 }
  }

  try {
    await execa('forge', ['--version'], { stdio: 'pipe' })
  } catch {
    logger.error('Foundry is not installed.')
    console.log('')
    console.log('  Install it with:')
    console.log(`  ${pc.cyan('curl -L https://foundry.paradigm.xyz | bash')}`)
    console.log(`  ${pc.cyan('foundryup')}`)
    return { success: false, attempts: 0 }
  }

  // 1. Ensure AI is configured
  let config = getAiConfig()
  if (!config) {
    console.log(pc.dim('  No AI provider configured. Let\'s set one up.'))
    console.log('')
    config = await runAiSetup()
    if (!config) return { success: false, attempts: 0 }
    console.log('')
  }

  // 2. Run build to capture errors if not provided
  if (!errorOutput) {
    const spinner = p.spinner()
    spinner.start('Running build to detect errors...')
    const build = await runBuildAndCapture(contractsDir)
    if (build.success) {
      spinner.stop('Build succeeded — nothing to fix!')
      return { success: true, attempts: 0 }
    }
    spinner.stop('Build errors detected')
    errorOutput = build.stderr
    displayErrors(errorOutput)
  }

  // 3. Fix loop
  let attempts = 0
  let previousErrorOutput: string | undefined
  while (attempts < maxRetries) {
    attempts++

    const spinner = p.spinner()
    spinner.start(`AI fix attempt ${attempts}/${maxRetries} — reading project...`)

    // Re-read project context each iteration (files may have been patched)
    const context = await collectProjectContext(projectRoot)
    // Only include contracts for fix context
    const fixContext: ProjectContext = {
      contracts: context.contracts,
      frontend: [],
      config: context.config,
      template: context.template,
    }

    spinner.stop(`${fixContext.contracts.length} contract(s) loaded`)

    // Build prompt — include previous attempt context on retries so AI knows what failed
    const systemPrompt = buildFixSystemPrompt(
      fixContext,
      errorOutput!,
      attempts > 1 ? previousErrorOutput : undefined,
    )

    // Try sending to AI with retry on parse failure
    const aiResult = await sendAndParseWithRetry(config as AiProviderConfig, systemPrompt, auto)

    if (aiResult === 'cancelled') {
      return { success: false, attempts, remainingErrors: errorOutput }
    }

    if (aiResult === 'failed') {
      // AI request or parse failed after retries — continue to next attempt if available
      if (attempts < maxRetries) {
        logger.info(`AI response was unusable. Retrying (attempt ${attempts + 1}/${maxRetries})...`)
        continue
      }
      return { success: false, attempts, remainingErrors: errorOutput }
    }

    const { changes, usage } = aiResult

    // Show usage info
    if (usage) {
      console.log(pc.dim(`  Tokens: ${usage.inputTokens} in, ${usage.outputTokens} out`))
    }

    // Show diff preview
    await showDiffPreview(changes)

    // Confirm (unless --auto)
    if (!auto) {
      const confirm = await p.confirm({ message: 'Apply these fixes?' })
      if (p.isCancel(confirm) || !confirm) {
        logger.info('Fixes discarded.')
        return { success: false, attempts, remainingErrors: errorOutput }
      }
    }

    // Apply changes
    await applyChanges(changes)
    logger.success(`${changes.length} file(s) patched`)

    // Re-run build to verify
    const verifySpinner = p.spinner()
    verifySpinner.start('Verifying fix...')
    const verify = await runBuildAndCapture(contractsDir)

    if (verify.success) {
      verifySpinner.stop('Build succeeded!')
      logger.success('All errors fixed')
      return { success: true, attempts }
    }

    verifySpinner.stop('Build still failing')
    previousErrorOutput = errorOutput
    errorOutput = verify.stderr
    displayErrors(errorOutput)

    if (attempts < maxRetries) {
      logger.info(`Retrying with updated errors (attempt ${attempts + 1}/${maxRetries})...`)
    }
  }

  logger.warn(`Could not fix all errors after ${attempts} attempt(s).`)
  return { success: false, attempts, remainingErrors: errorOutput }
}

interface ParsedAiResult {
  changes: Array<{ path: string; content: string; isNew: boolean }>
  usage?: { inputTokens: number; outputTokens: number }
}

/**
 * Send to AI and parse response, retrying once on parse failure.
 * Returns the parsed result, 'failed' if AI was unreachable or response unparseable,
 * or 'cancelled' if user cancelled.
 */
async function sendAndParseWithRetry(
  config: AiProviderConfig,
  systemPrompt: string,
  auto: boolean,
): Promise<ParsedAiResult | 'failed' | 'cancelled'> {
  const maxParseAttempts = 2

  for (let parseAttempt = 1; parseAttempt <= maxParseAttempts; parseAttempt++) {
    const spinner = p.spinner()
    spinner.start(parseAttempt === 1 ? 'AI is analyzing errors...' : 'Retrying AI request...')

    let response
    try {
      response = await sendToAi(config, systemPrompt, [
        { role: 'user', content: 'Fix the compilation errors. Return only the JSON array of changed files.' },
      ])
    } catch (error) {
      spinner.stop('Failed')
      const message = error instanceof Error ? error.message : 'AI request failed'
      logger.error(message)
      return 'failed'
    }

    spinner.stop('Fix ready')

    // Parse response
    try {
      const changes = parseAiChanges(response.content)
      if (changes.length === 0) {
        logger.warn('AI returned no changes — cannot fix automatically.')
        return 'failed'
      }
      return { changes, usage: response.usage }
    } catch {
      if (parseAttempt < maxParseAttempts) {
        logger.warn('AI response was not valid JSON — retrying...')
        continue
      }
      logger.error('Could not parse AI response after retry.')
      console.log(pc.dim('  Raw response (first 500 chars):'))
      console.log(pc.dim('  ' + response.content.slice(0, 500)))
      return 'failed'
    }
  }

  return 'failed'
}

function displayErrors(stderr: string): void {
  console.log('')
  const lines = stderr.split('\n').filter(Boolean).slice(0, 30)
  for (const line of lines) {
    console.log(pc.dim('  ┃ ') + line)
  }
  console.log('')
}
