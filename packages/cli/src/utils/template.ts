import Handlebars from 'handlebars'

// Register custom helpers for web3/Solidity use cases
Handlebars.registerHelper('toWei', (amount: string) => {
  const num = Number(amount)
  if (isNaN(num)) return '0'
  return `${amount}${'0'.repeat(18)}`
})

Handlebars.registerHelper('toBps', (percent: string) => {
  return `${Math.round(Number(percent) * 100)}`
})

Handlebars.registerHelper('toDays', (days: string) => {
  return `${Number(days) * 86400}`
})

Handlebars.registerHelper('capitalize', (str: string) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
})

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b)

Handlebars.registerHelper('gt', (a: number, b: number) => a > b)

Handlebars.registerHelper('lt', (a: number, b: number) => a < b)

/**
 * Render a Handlebars template string with the given context.
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  const processed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (value === false || value === 'false') {
      processed[key] = ''
    } else {
      processed[key] = value
    }
  }
  const compiled = Handlebars.compile(template, { noEscape: true })
  return compiled(processed)
}

/**
 * Render a template file and write the output.
 */
export async function renderTemplateFile(
  templatePath: string,
  outputPath: string,
  context: Record<string, unknown>,
): Promise<void> {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')

  const template = await readFile(templatePath, 'utf-8')
  const rendered = renderTemplate(template, context)

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, rendered, 'utf-8')
}
