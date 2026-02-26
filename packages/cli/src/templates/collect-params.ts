import * as p from '@clack/prompts'
import type { ComponentParameter } from '@web3marketlabs/sdk'
import { getComponent } from '@web3marketlabs/components'
import type { AppTemplate } from './types.js'

/**
 * Merge component parameters + template parameters, apply overrides,
 * and prompt the user for remaining values.
 */
export async function collectTemplateParams(
  template: AppTemplate,
): Promise<Record<string, string | boolean>> {
  // Gather all parameters from components
  const allParams: ComponentParameter[] = []
  const seen = new Set<string>()

  for (const componentId of template.components) {
    const component = getComponent(componentId)
    if (!component) continue
    for (const param of component.parameters) {
      if (!seen.has(param.name)) {
        seen.add(param.name)
        allParams.push(param)
      }
    }
  }

  // Add template-level parameters
  for (const param of template.parameters) {
    if (!seen.has(param.name)) {
      seen.add(param.name)
      allParams.push(param)
    }
  }

  // Apply overrides and prompt for the rest
  const result: Record<string, string | boolean> = {}

  for (const param of allParams) {
    // If overridden by the template, use the override value silently
    if (param.name in template.parameterOverrides) {
      result[param.name] = template.parameterOverrides[param.name]!
      continue
    }

    // Prompt the user
    if (param.type === 'boolean') {
      const value = await p.confirm({
        message: param.prompt,
        initialValue: param.default === true,
      })
      if (p.isCancel(value)) throw value
      result[param.name] = value
    } else if (param.type === 'select' && param.options) {
      const value = await p.select({
        message: param.prompt,
        options: param.options.map((o) => ({
          value: o.value,
          label: o.label,
          hint: o.hint,
        })),
      })
      if (p.isCancel(value)) throw value
      result[param.name] = value as string
    } else {
      // Detect numeric fields from name/prompt/default
      const nameLower = param.name.toLowerCase()
      const promptLower = param.prompt.toLowerCase()
      const defaultIsNumeric = typeof param.default === 'string' && /^\d+(\.\d+)?$/.test(param.default)
      const isNumber = /supply|amount|quantity|limit|fee|rate|price|decimals/.test(nameLower)
        || /supply|amount|quantity/.test(promptLower)
        || defaultIsNumeric
      const isPercent = isNumber && (
        /percent|%/.test(promptLower) || /percent|pct|fee|tax|rate|burn/.test(nameLower)
      )

      let hint = ''
      if (isPercent) hint = ' (0–100)'
      else if (isNumber) hint = ' (positive number)'

      const promptAlreadyHinted = /\(.*\)\s*$/.test(param.prompt)
      const message = promptAlreadyHinted ? param.prompt : param.prompt + hint

      const value = await p.text({
        message,
        placeholder: typeof param.default === 'string' ? param.default : undefined,
        defaultValue: typeof param.default === 'string' ? param.default : undefined,
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
      if (p.isCancel(value)) throw value
      result[param.name] = value as string
    }
  }

  return result
}
