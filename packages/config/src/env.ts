import { z, type ZodType, type ZodRawShape } from 'zod'

const CLIENT_PREFIX = 'NEXT_PUBLIC_'

const FORBIDDEN_CLIENT_PATTERNS = ['PRIVATE_KEY', 'SECRET'] as const

type ServerRecord = Record<string, ZodType>
type ClientRecord = Record<`NEXT_PUBLIC_${string}`, ZodType>

type EnvResult<TServer extends ServerRecord, TClient extends ClientRecord> = {
  [K in keyof TServer]: TServer[K] extends ZodType ? z.infer<TServer[K]> : never
} & {
  [K in keyof TClient]: TClient[K] extends ZodType ? z.infer<TClient[K]> : never
}

export interface CreateEnvOptions<TServer extends ServerRecord, TClient extends ClientRecord> {
  server: TServer
  client: TClient
  runtimeEnv: Record<string, string | undefined>
}

export function createEnv<TServer extends ServerRecord, TClient extends ClientRecord>(
  options: CreateEnvOptions<TServer, TClient>,
): EnvResult<TServer, TClient> {
  const { server, client, runtimeEnv } = options

  for (const key of Object.keys(server)) {
    if (key.startsWith(CLIENT_PREFIX)) {
      throw new Error(
        `Server environment variable "${key}" must not start with "${CLIENT_PREFIX}". Move it to the \`client\` object instead.`,
      )
    }
  }

  for (const key of Object.keys(client)) {
    if (!key.startsWith(CLIENT_PREFIX)) {
      throw new Error(
        `Client environment variable "${key}" must start with "${CLIENT_PREFIX}". Move it to the \`server\` object or add the "${CLIENT_PREFIX}" prefix.`,
      )
    }
  }

  for (const key of Object.keys(client)) {
    for (const pattern of FORBIDDEN_CLIENT_PATTERNS) {
      if (key.toUpperCase().includes(pattern)) {
        throw new Error(
          `Client environment variable "${key}" contains the forbidden pattern "${pattern}". Exposing secrets to the client is a security risk. Move this variable to the \`server\` object and remove the "${CLIENT_PREFIX}" prefix.`,
        )
      }
    }
  }

  const allSchemas: ZodRawShape = { ...server, ...client }
  const combinedSchema = z.object(allSchemas)
  const result = combinedSchema.safeParse(runtimeEnv)

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.') || '(root)'
        return `  - ${path}: ${issue.message}`
      })
      .join('\n')
    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  return result.data as EnvResult<TServer, TClient>
}
