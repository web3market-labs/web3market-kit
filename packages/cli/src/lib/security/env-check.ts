export interface EnvSecurityResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const SECRET_PATTERNS = [
  /private.?key/i,
  /secret/i,
  /mnemonic/i,
  /seed.?phrase/i,
]

export function validateEnvSecurity(envVars: Record<string, string>): EnvSecurityResult {
  const errors: string[] = []
  const warnings: string[] = []

  for (const key of Object.keys(envVars)) {
    const isPublic = key.startsWith('NEXT_PUBLIC_')

    if (isPublic) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(key)) {
          errors.push(
            `Environment variable "${key}" appears to contain a secret but has the NEXT_PUBLIC_ prefix. ` +
              'This would expose it in the browser bundle. Remove the NEXT_PUBLIC_ prefix.',
          )
          break
        }
      }
    }

    if (!isPublic && SECRET_PATTERNS.some((p) => p.test(key)) && !envVars[key]) {
      warnings.push(`Secret environment variable "${key}" is empty.`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
