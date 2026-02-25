import { execa } from 'execa'

export interface VercelDeployOptions {
  projectDir: string
  production?: boolean
  token?: string
}

export interface VercelDeployResult {
  url: string
  output: string
}

export async function deployToVercel(options: VercelDeployOptions): Promise<VercelDeployResult> {
  const { projectDir, production = true, token } = options

  const args = ['deploy']
  if (production) args.push('--prod')
  if (token) args.push('--token', token)

  const result = await execa('vercel', args, {
    cwd: projectDir,
    env: process.env as Record<string, string>,
  })

  const lines = result.stdout.trim().split('\n')
  const url = lines[lines.length - 1] ?? ''

  return { url, output: result.stdout }
}
