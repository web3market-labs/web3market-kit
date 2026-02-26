import path from 'node:path'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import fs from 'fs-extra'
import pc from 'picocolors'
import type { ComponentParameter } from '@web3marketlabs/sdk'
import { renderTemplate } from '../utils/template.js'
import { logger } from '../utils/logger.js'
import { isKnownComponent, resolveComponent, listComponents } from '../registry.js'
import { autoTrackProject } from '../core/project-tracker.js'

export function addCommand(): Command {
  return new Command('add')
    .description('Add a component to your project')
    .argument('<component>', 'Component name (e.g. token)')
    .action(async (componentName: string) => {
      try {
        await runAdd(componentName)
      } catch (error) {
        if (p.isCancel(error)) {
          p.cancel('Cancelled.')
          process.exit(0)
        }
        const message = error instanceof Error ? error.message : 'Failed to add component'
        logger.error(message)
        process.exit(1)
      }
    })
}

async function runAdd(componentName: string): Promise<void> {
  const projectRoot = process.cwd()
  autoTrackProject(projectRoot)

  logger.step(`Looking up component "${componentName}"...`)

  if (!isKnownComponent(componentName)) {
    const available = listComponents()
    throw new Error(
      `Component "${componentName}" not found.\n` +
        `Available components:\n` +
        available.map((c) => `  ${pc.bold(c.name)} — ${c.description} (${c.tier})`).join('\n'),
    )
  }

  const component = resolveComponent(componentName)
  if (!component) {
    throw new Error(`Component "${componentName}" could not be resolved.`)
  }

  // Check tier (warn only — don't block install)
  if (component.tier !== 'free') {
    logger.warn(
      `${pc.bold(componentName)} requires a ${pc.bold(component.tier)} plan for deployment.`,
    )
    logger.info('Install and develop locally for free. Deploy requires the appropriate tier.')
  }

  logger.success(`Found: ${component.displayName} v${component.version}`)

  // Prompt user for parameters
  const params: Record<string, string | boolean> = {}

  if (component.parameters.length > 0) {
    for (const param of component.parameters) {
      if (param.type === 'boolean') {
        const result = await p.confirm({
          message: param.prompt,
          initialValue: param.default === true,
        })
        if (p.isCancel(result)) throw result
        params[param.name] = result
      } else if (param.type === 'select' && param.options) {
        const result = await p.select({
          message: param.prompt,
          options: param.options.map((o) => ({
            value: o.value,
            label: o.label,
            hint: o.hint,
          })),
        })
        if (p.isCancel(result)) throw result
        params[param.name] = result as string
      } else {
        const result = await p.text({
          message: param.prompt,
          placeholder: typeof param.default === 'string' ? param.default : undefined,
          defaultValue: typeof param.default === 'string' ? param.default : undefined,
          validate: param.required
            ? (v) => (!v ? `${param.name} is required` : undefined)
            : undefined,
        })
        if (p.isCancel(result)) throw result
        params[param.name] = result as string
      }
    }
  }

  // Render and copy template files
  logger.step('Rendering component templates...')

  for (const file of component.files) {
    const outputPath = renderTemplate(
      path.join(projectRoot, file.outputPath),
      params,
    )

    let content: string
    try {
      content = await fs.readFile(file.templatePath, 'utf-8')
    } catch {
      logger.warn(`Could not read template: ${file.templatePath}`)
      continue
    }

    if (file.template) {
      content = renderTemplate(content, params)
    }

    await fs.ensureDir(path.dirname(outputPath))
    await fs.writeFile(outputPath, content, 'utf-8')
  }

  logger.success('Template files rendered')

  // Update kit.config.ts
  logger.step('Updating kit.config.ts...')
  await addComponentToConfig(projectRoot, componentName)
  logger.success('Config updated')

  // Install Solidity dependencies
  if (component.solidityDependencies.length > 0) {
    logger.step('Installing Solidity dependencies...')
    const { execa } = await import('execa')
    for (const dep of component.solidityDependencies) {
      try {
        const pkg = dep.version ? `${dep.package}@${dep.version}` : dep.package
        await execa('forge', ['install', pkg, '--no-commit'], {
          cwd: path.join(projectRoot, 'contracts'),
          stdio: 'pipe',
        })
        logger.success(`Installed ${dep.package}`)
      } catch {
        logger.warn(`Could not install ${dep.package} — install it manually`)
      }
    }
  }

  // Install npm dependencies
  if (component.npmDependencies.length > 0) {
    logger.step('Installing npm dependencies...')
    const { execa } = await import('execa')
    for (const dep of component.npmDependencies) {
      try {
        const args = dep.dev
          ? ['add', '-D', `${dep.name}@${dep.version}`]
          : ['add', `${dep.name}@${dep.version}`]
        await execa('pnpm', args, { cwd: projectRoot, stdio: 'pipe' })
      } catch {
        logger.warn(`Could not install ${dep.name}`)
      }
    }
  }

  // Run codegen
  logger.step('Running codegen...')
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: projectRoot })
    logger.success('Codegen complete')
  } catch {
    logger.warn('Codegen skipped — run "w3m generate" to update bindings')
  }

  logger.success(`Component "${componentName}" added successfully!`)
}

async function addComponentToConfig(projectRoot: string, componentName: string): Promise<void> {
  const configPath = path.join(projectRoot, 'kit.config.ts')

  if (!(await fs.pathExists(configPath))) {
    logger.warn('kit.config.ts not found — skipping config update')
    return
  }

  let content = await fs.readFile(configPath, 'utf-8')

  if (content.includes(`'${componentName}'`) || content.includes(`"${componentName}"`)) {
    logger.info(`Component "${componentName}" is already in kit.config.ts`)
    return
  }

  const componentsArrayRe = /(components:\s*\[)([\s\S]*?)(\])/
  const match = componentsArrayRe.exec(content)

  if (match) {
    const existing = match[2]!.trim()
    const separator = existing ? ', ' : ''
    const updated = `${match[1]}${existing}${separator}'${componentName}'${match[3]}`
    content = content.replace(componentsArrayRe, updated)
  } else {
    content = content.replace(
      /(\}\s*\)\s*)$/,
      `  components: ['${componentName}'],\n$1`,
    )
  }

  await fs.writeFile(configPath, content, 'utf-8')
}
