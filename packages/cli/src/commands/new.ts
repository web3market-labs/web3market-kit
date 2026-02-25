import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import path from 'node:path'
import fs from 'fs-extra'
import { execa } from 'execa'
import { scaffoldProject, type ScaffoldOptions } from '../scaffold.js'
import { logger } from '../utils/logger.js'
import { installSolidityDep, detectPackageManager } from '../utils/foundry.js'
import { listComponents } from '../registry.js'
import { registerProject } from '../core/project-store.js'
import { createClient, type ScaffoldManifest, type TemplateParameter } from '../utils/api-client.js'
import { getApiKeyQuiet } from '../utils/auth-guard.js'
import {
  hasLocalTemplates,
  listLocalManifests,
  scaffoldLocalTemplate,
} from '../utils/local-scaffold.js'
import { runPostScaffoldDev } from './post-scaffold.js'
import { detectProject } from '../core/project-detector.js'

export function newCommand(): Command {
  return new Command('new')
    .description('Create a new Web3 Market project')
    .argument('[name]', 'Project name')
    .option('--template <id>', 'Use a specific template (e.g. token-standard, token-tax, token-meme, token-reflection)')
    .action(async (nameArg?: string, opts?: { template?: string }) => {
      try {
        await runNew(nameArg, opts?.template)
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Setup cancelled.')
          process.exit(0)
        }
        const message = error instanceof Error ? error.message : 'An unexpected error occurred'
        logger.error(message)
        process.exit(1)
      }
    })
}

async function runNew(nameArg?: string, templateFlag?: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(' Web3 Market ')))

  // Step-based flow with back navigation (Esc goes back)
  let name = nameArg ?? ''
  let selectedTemplateId: string | null = null
  let templates: ScaffoldManifest[] = []
  let useApi = false
  let step = nameArg ? 1 : 0 // skip name step if provided as argument

  while (true) {
    if (step === 0) {
      // 1. Project name
      const result = await p.text({
        message: 'What is the name of your project?',
        placeholder: 'my-dapp',
        defaultValue: name || 'my-dapp',
        validate: (value) => {
          if (!value) return 'Project name is required'
          if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Project name must be lowercase alphanumeric with dashes only'
          }
          const dir = path.resolve(process.cwd(), value)
          if (fs.pathExistsSync(dir)) {
            return `Directory "${value}" already exists. Choose a different name.`
          }
          return undefined
        },
      })
      if (p.isCancel(result)) throw result // first step — cancel exits
      name = result as string
      step = 1
      continue
    }

    if (step === 1) {
      // 2. Load templates (only once)
      if (templates.length === 0) {
        const apiKey = getApiKeyQuiet()
        const client = createClient(apiKey ?? undefined)
        if (hasLocalTemplates()) {
          templates = listLocalManifests()
        }
        try {
          const controller = new AbortController()
          const timeout = globalThis.setTimeout(() => controller.abort(), 3000)
          const result = await client.getScaffoldableTemplates({ signal: controller.signal })
          globalThis.clearTimeout(timeout)
          templates = result.templates
          useApi = true
        } catch {
          // API unreachable — local templates already loaded above
        }
      }

      // 3. Template picker
      if (templateFlag) {
        if (templates.length > 0) {
          const tmpl = templates.find((t) => t.id === templateFlag || t.slug === templateFlag)
          if (!tmpl) {
            const available = templates.map((t) => t.id).join(', ')
            throw new Error(`Unknown template "${templateFlag}". Available: ${available}`)
          }
          selectedTemplateId = tmpl.id
        } else {
          selectedTemplateId = templateFlag
        }
        step = 2
        continue
      } else if (templates.length > 0) {
        const templateOptions = [
          ...templates.map((t) => ({
            value: t.id,
            label: `${t.displayName} ${t.tier !== 'free' ? pc.yellow(`(${t.tier})`) : pc.green('(free)')}`,
            hint: t.description,
          })),
          {
            value: '_blank',
            label: 'Blank project (advanced)',
            hint: 'Empty skeleton — pick framework, components, chains manually',
          },
        ]

        const picked = await p.select({
          message: 'What do you want to build?',
          options: templateOptions,
        })

        if (p.isCancel(picked)) {
          if (nameArg) throw picked // can't go back past CLI arg
          step = 0 // go back to name
          continue
        }

        selectedTemplateId = (picked as string) === '_blank' ? null : picked as string
        step = 2
        continue
      }
      step = 2
      continue
    }

    if (step === 2) {
      // 4. Scaffold
      const apiKey = getApiKeyQuiet()
      const client = createClient(apiKey ?? undefined)

      let wentBack = false
      if (selectedTemplateId) {
        const manifest = templates.find((t) => t.id === selectedTemplateId)
        wentBack = await runTemplateScaffold(client, useApi, name, selectedTemplateId, manifest ?? null, templates)
      } else {
        wentBack = await runBlankProjectWizard(name)
      }
      if (wentBack) {
        step = 1
        continue
      }
      return
    }
  }
}

/** Returns true if user navigated back (caller should go to template picker) */
async function runTemplateScaffold(
  client: ReturnType<typeof createClient>,
  useApi: boolean,
  name: string,
  templateId: string,
  manifest: ScaffoldManifest | null,
  templates: ScaffoldManifest[],
): Promise<boolean> {
  // Resolve manifest for parameters
  if (!manifest) {
    if (useApi) {
      try {
        const result = await client.getTemplateManifest(templateId)
        manifest = result.manifest
      } catch {
        // Fall back to local
      }
    }
    if (!manifest) {
      const locals = listLocalManifests()
      manifest = locals.find((t) => t.id === templateId) ?? null
    }
    if (!manifest) {
      throw new Error(`Template "${templateId}" not found.`)
    }
  }

  p.note(
    `${pc.bold(manifest.displayName)}\n${manifest.description}`,
    'Template',
  )

  // Collect parameters from user
  const params = await collectParams(manifest.parameters)
  if (params === BACK) return true

  const spinner = p.spinner()
  spinner.start(`Scaffolding ${manifest.displayName}...`)

  // Try API scaffold first, fall back to local
  let result: {
    files: { path: string; content: string }[]
    postInstall: { solidityDependencies: string[] }
  } | null = null

  if (useApi) {
    try {
      result = await client.scaffoldTemplate(templateId, name, params)
    } catch {
      // API scaffold failed — fall back to local
    }
  }

  if (!result) {
    const localResult = scaffoldLocalTemplate(templateId, name, params)
    if (!localResult) {
      spinner.stop('Scaffold failed')
      throw new Error(`Could not scaffold template "${templateId}".`)
    }
    result = localResult
  }

  // Write files to disk
  const projectDir = path.resolve(process.cwd(), name)
  await fs.ensureDir(projectDir)

  for (const file of result.files) {
    const filePath = path.join(projectDir, file.path)
    await fs.ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, file.content, 'utf-8')
  }

  spinner.stop(`${result.files.length} files written`)

  // Track what succeeds/fails for honest summary
  let depsOk = false
  let solDepsOk = false
  let codegenOk = false
  const hasFrontend = result.files.some((f) => f.path.startsWith('web/') || f.path.startsWith('frontend/'))

  // Post-install: dependencies
  const pm = await detectPackageManager()
  logger.step('Installing dependencies...')
  try {
    await execa(pm, ['install'], { cwd: projectDir, stdio: 'pipe' })
    depsOk = true
    logger.success('Dependencies installed')
  } catch {
    logger.warn(`Could not install dependencies. Run ${pm} install manually.`)
  }

  // Post-install: Solidity dependencies (uses installSolidityDep which handles git init)
  if (result.postInstall.solidityDependencies.length > 0) {
    logger.step('Installing Solidity dependencies...')
    const contractsDir = path.join(projectDir, 'contracts')
    let allSolDeps = true
    for (const dep of result.postInstall.solidityDependencies) {
      const ok = await installSolidityDep(contractsDir, dep)
      if (ok) {
        logger.success(`Installed ${dep.split('/').pop()}`)
      } else {
        allSolDeps = false
      }
    }
    solDepsOk = allSolDeps
    if (!allSolDeps) {
      logger.warn('Some Solidity deps failed — they will be retried on first build.')
    }
  } else {
    solDepsOk = true
  }

  // Post-install: codegen
  logger.step('Running codegen...')
  try {
    const { runCodegen } = await import('@web3market/codegen')
    await runCodegen({ root: projectDir })
    codegenOk = true
    logger.success('Codegen complete')
  } catch {
    logger.info('Skipping codegen (will run on first "w3m dev")')
  }

  // Register project
  registerProject({
    name,
    path: projectDir,
    components: [templateId],
    chains: [],
  })

  // Consolidated setup summary
  const allGood = depsOk && solDepsOk
  const ok = pc.green('\u2713')
  const summaryLines = [
    `${ok} ${result.files.length} files generated`,
  ]
  if (depsOk) summaryLines.push(`${ok} Dependencies installed`)
  if (solDepsOk) summaryLines.push(`${ok} Solidity libraries installed`)
  if (codegenOk) summaryLines.push(`${ok} Codegen complete`)
  if (!allGood) {
    summaryLines.push('')
    summaryLines.push(pc.dim('Some setup steps will auto-complete when you start dev.'))
  }
  if (manifest.tier !== 'free') {
    summaryLines.push(pc.dim(`Testnet/mainnet deployment requires a ${manifest.tier} plan.`))
  }
  p.note(summaryLines.join('\n'), `${pc.bold(name)} is ready`)

  // Interactive "What next?"
  const nextOptions: Array<{ value: string; label: string; hint?: string }> = []

  if (hasFrontend) {
    nextOptions.push(
      { value: 'dev', label: 'Start dev environment', hint: 'Deploy to Anvil + open at localhost:3000' },
    )
  } else {
    nextOptions.push(
      { value: 'deploy-local', label: 'Deploy locally', hint: 'Start Anvil + deploy contracts' },
    )
  }

  nextOptions.push(
    { value: 'workspace', label: 'Enter workspace', hint: 'Full interactive menu' },
    { value: 'exit', label: 'Exit', hint: `cd ${name} && w3m` },
  )

  const nextAction = await p.select({
    message: 'What do you want to do next?',
    options: nextOptions,
  })

  if (p.isCancel(nextAction) || nextAction === 'exit') {
    p.note(
      [`cd ${name}`, hasFrontend ? 'w3m dev' : 'w3m'].join('\n'),
      'Next steps',
    )
    p.outro(pc.green('Happy building!'))
    return false
  }

  if (nextAction === 'dev') {
    await runPostScaffoldDev(projectDir, name)
  } else if (nextAction === 'deploy-local') {
    process.chdir(projectDir)
    const { runLocalDeploy } = await import('./post-scaffold.js')
    await runLocalDeploy(projectDir)
  } else if (nextAction === 'workspace') {
    process.chdir(projectDir)
    const { showProjectMenu } = await import('../menu/home.js')
    const detected = detectProject(projectDir)
    if (detected) {
      await showProjectMenu(detected)
    } else {
      // Scaffold didn't create kit.config.ts — still usable
      logger.info(`Project created at ${pc.cyan(projectDir)}`)
      logger.info(`Run ${pc.cyan('w3m')} from the project directory to open the workspace.`)
    }
  }
  return false
}

async function collectParams(
  parameters: TemplateParameter[],
): Promise<Record<string, string | boolean> | typeof BACK> {
  if (parameters.length === 0) return {}

  const params: Record<string, string | boolean> = {}
  let i = 0

  while (i < parameters.length) {
    const param = parameters[i]!
    const result = await promptParam(param)

    if (result === BACK) {
      if (i > 0) {
        // Go back — remove previous param and re-prompt it
        const prev = parameters[i - 1]!
        delete params[prev.name]
        i--
      } else {
        // At first param — signal back to caller (template picker)
        return BACK
      }
      continue
    }

    params[param.name] = result
    i++
  }

  return params
}

const BACK = Symbol('back')

/**
 * Prompt for a single template parameter. Returns BACK if user wants to go back.
 */
async function promptParam(param: TemplateParameter): Promise<string | boolean | typeof BACK> {
  if (param.type === 'boolean') {
    const result = await p.confirm({
      message: param.prompt,
      initialValue: param.default === true,
    })
    if (p.isCancel(result)) return BACK
    return result

  } else if (param.type === 'select' && param.options) {
    const result = await p.select({
      message: param.prompt,
      options: [
        ...param.options.map((o) => ({
          value: o.value,
          label: o.label,
          hint: o.hint,
        })),
        { value: '_back', label: 'Go back', hint: 'Return to previous step' },
      ],
    })
    if (p.isCancel(result) || result === '_back') return BACK
    return result as string

  } else {
    // Detect numeric fields: explicit type OR inferred from prompt/default/name
    const promptLower = param.prompt.toLowerCase()
    const nameLower = param.name.toLowerCase()
    const defaultIsNumeric = param.default != null && /^\d+(\.\d+)?$/.test(String(param.default))
    const isNumber = param.type === 'number'
      || /supply|amount|quantity|limit|fee|rate|price|decimals/.test(nameLower)
      || /supply|amount|quantity/.test(promptLower)
      || defaultIsNumeric
    const isPercent = isNumber && (
      /percent|%/.test(promptLower) || /percent|pct|fee|tax|rate|burn/.test(nameLower)
    )
    const defaultStr = param.default != null ? String(param.default) : undefined

    let hint = ''
    if (isPercent) hint = ' (0–100)'
    else if (isNumber) hint = ' (positive number)'

    // Don't double-add hint if prompt already contains it
    const promptAlreadyHinted = /\(.*\)\s*$/.test(param.prompt)
    const message = promptAlreadyHinted ? param.prompt : param.prompt + hint

    const result = await p.text({
      message,
      placeholder: defaultStr,
      defaultValue: defaultStr,
      validate: (v) => {
        if (!v && param.required) return `${param.name} is required`
        if (v && isNumber) {
          const n = Number(v)
          if (Number.isNaN(n) || !/^\d+(\.\d+)?$/.test(v.trim())) return 'Must be a valid number'
          if (n < 0) return 'Must be a positive number'
          if (isPercent && n > 100) return 'Percentage must be between 0 and 100'
        }
        return undefined
      },
    })
    if (p.isCancel(result)) return BACK
    return result as string
  }
}

/** Returns true if user navigated back (caller should go to template picker) */
async function runBlankProjectWizard(name: string): Promise<boolean> {
  const allComponents = listComponents()

  // Step-based wizard with back navigation
  let contractFramework: 'foundry' | 'hardhat' = 'foundry'
  let frontend: 'next' | 'vite' | 'none' = 'next'
  let components: string[] = []
  let chains: string[] = []
  let packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' = 'pnpm'
  let step = 0

  while (step < 5) {
    if (step === 0) {
      const result = await p.select({
        message: 'Which contract framework do you want to use?',
        options: [
          { value: 'foundry', label: 'Foundry', hint: 'recommended' },
          { value: 'hardhat', label: 'Hardhat' },
        ],
        initialValue: contractFramework,
      })
      if (p.isCancel(result)) return true // first step — go back to template picker
      contractFramework = result as typeof contractFramework
      step = 1
    } else if (step === 1) {
      const result = await p.select({
        message: 'Which frontend framework do you want to use?',
        options: [
          { value: 'next', label: 'Next.js', hint: 'recommended' },
          { value: 'vite', label: 'Vite + React' },
          { value: 'none', label: 'None (contracts only)' },
        ],
        initialValue: frontend,
      })
      if (p.isCancel(result)) { step = 0; continue }
      frontend = result as typeof frontend
      step = 2
    } else if (step === 2) {
      const result = await p.multiselect({
        message: 'Which components do you want to include? (press Enter to skip)',
        options: allComponents.map((c) => ({
          value: c.name,
          label: `${c.name} ${c.tier !== 'free' ? pc.yellow(`(${c.tier})`) : ''}`,
          hint: c.description,
        })),
        required: false,
      })
      if (p.isCancel(result)) { step = 1; continue }
      components = result as string[]
      step = 3
    } else if (step === 3) {
      const result = await p.multiselect({
        message: 'Which chains do you want to support? (press Enter to skip)',
        options: [
          { value: 'ethereum', label: 'Ethereum Mainnet' },
          { value: 'sepolia', label: 'Sepolia Testnet', hint: 'recommended for testing' },
          { value: 'arbitrum', label: 'Arbitrum One' },
          { value: 'base', label: 'Base' },
          { value: 'polygon', label: 'Polygon' },
          { value: 'optimism', label: 'Optimism' },
        ],
        required: false,
      })
      if (p.isCancel(result)) { step = 2; continue }
      chains = result as string[]
      step = 4
    } else if (step === 4) {
      const result = await p.select({
        message: 'Which package manager do you want to use?',
        options: [
          { value: 'pnpm', label: 'pnpm', hint: 'recommended' },
          { value: 'npm', label: 'npm' },
          { value: 'yarn', label: 'yarn' },
          { value: 'bun', label: 'bun' },
        ],
        initialValue: packageManager,
      })
      if (p.isCancel(result)) { step = 3; continue }
      packageManager = result as typeof packageManager
      step = 5
    }
  }

  const options: ScaffoldOptions = {
    name,
    contractFramework,
    frontend,
    components,
    chains,
    packageManager,
  }

  const spinner = p.spinner()
  spinner.start('Scaffolding project...')

  await scaffoldProject(options)

  spinner.stop('Project scaffolded!')

  const projectPath = path.resolve(process.cwd(), name)
  registerProject({
    name,
    path: projectPath,
    components,
    chains,
  })

  // Consolidated setup summary
  const summaryLines = [
    `${pc.green('+')} Project scaffolded`,
  ]

  const proComponents = components.filter((c) => {
    const entry = allComponents.find((e) => e.name === c)
    return entry && entry.tier !== 'free'
  })

  if (proComponents.length > 0) {
    summaryLines.push(`${pc.dim('i')} ${proComponents.join(', ')} require a Pro plan for testnet/mainnet deployment`)
  }
  p.note(summaryLines.join('\n'), `${pc.bold(name)} is ready`)

  // Interactive "What next?"
  const hasFrontend = (frontend as string) !== 'none'
  const nextOptions: Array<{ value: string; label: string; hint?: string }> = []

  if (hasFrontend) {
    nextOptions.push(
      { value: 'dev', label: 'Start dev environment', hint: 'Deploy to Anvil + open at localhost:3000' },
    )
  } else {
    nextOptions.push(
      { value: 'deploy-local', label: 'Deploy locally', hint: 'Start Anvil + deploy contracts' },
    )
  }

  nextOptions.push(
    { value: 'workspace', label: 'Enter workspace', hint: 'Full interactive menu' },
    { value: 'exit', label: 'Exit', hint: `cd ${name} && w3m` },
  )

  const nextAction = await p.select({
    message: 'What do you want to do next?',
    options: nextOptions,
  })

  if (p.isCancel(nextAction) || nextAction === 'exit') {
    p.note(
      [`cd ${name}`, hasFrontend ? 'w3m dev' : 'w3m'].join('\n'),
      'Next steps',
    )
    p.outro(pc.green('Happy building!'))
    return false
  }

  if (nextAction === 'dev') {
    await runPostScaffoldDev(projectPath, name)
  } else if (nextAction === 'deploy-local') {
    process.chdir(projectPath)
    const { runLocalDeploy } = await import('./post-scaffold.js')
    await runLocalDeploy(projectPath)
  } else if (nextAction === 'workspace') {
    process.chdir(projectPath)
    const { showProjectMenu } = await import('../menu/home.js')
    const detected = detectProject(projectPath)
    if (detected) {
      await showProjectMenu(detected)
    } else {
      logger.info(`Project created at ${pc.cyan(projectPath)}`)
      logger.info(`Run ${pc.cyan('w3m')} from the project directory to open the workspace.`)
    }
  }
  return false
}
