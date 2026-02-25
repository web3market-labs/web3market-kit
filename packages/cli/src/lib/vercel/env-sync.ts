import { execa } from 'execa'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export async function syncEnvToVercel(
  projectDir: string,
  options?: { token?: string },
): Promise<string[]> {
  const synced: string[] = []

  const envPath = path.join(projectDir, '.env')
  let envContent: string
  try {
    envContent = await fs.readFile(envPath, 'utf-8')
  } catch {
    return synced
  }

  const lines = envContent.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)

    if (!key.startsWith('NEXT_PUBLIC_')) continue
    if (!value) continue

    try {
      const args = ['env', 'add', key, '--']
      if (options?.token) args.push('--token', options.token)

      await execa('vercel', args, {
        cwd: projectDir,
        input: value,
        env: process.env as Record<string, string>,
      })
      synced.push(key)
    } catch {
      // Skip vars that fail to sync
    }
  }

  return synced
}
