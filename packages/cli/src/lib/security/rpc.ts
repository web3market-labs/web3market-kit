export interface RpcValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateRpcUrl(rpcUrl: string, chainId: number): RpcValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let parsed: URL
  try {
    parsed = new URL(rpcUrl)
  } catch {
    return { valid: false, errors: ['Invalid URL format'], warnings: [] }
  }

  const isLocal = chainId === 31337 || chainId === 1337

  if (!isLocal && parsed.protocol !== 'https:') {
    errors.push(
      `RPC URL for chain ${chainId} must use HTTPS. Got: ${parsed.protocol}//. ` +
        'HTTP is only allowed for local development chains (31337, 1337).',
    )
  }

  if (parsed.username || parsed.password) {
    errors.push('RPC URL must not contain credentials. Use environment variables for authentication.')
  }

  if (!isLocal && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    warnings.push(`RPC URL for chain ${chainId} points to localhost. This is unusual for a non-local chain.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}
