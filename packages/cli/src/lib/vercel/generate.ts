import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface VercelConfig {
  framework?: 'nextjs' | 'vite' | null
  buildCommand?: string
  outputDirectory?: string
  installCommand?: string
  devCommand?: string
}

export async function generateVercelJson(
  projectDir: string,
  options: { frontend: 'next' | 'vite' | 'none'; projectName?: string },
): Promise<void> {
  const config: VercelConfig & Record<string, unknown> = {}

  if (options.frontend === 'next') {
    config.framework = 'nextjs'
    config.buildCommand = 'cd web && next build'
    config.outputDirectory = 'web/.next'
    config.installCommand = 'pnpm install'
  } else if (options.frontend === 'vite') {
    config.framework = 'vite'
    config.buildCommand = 'cd web && vite build'
    config.outputDirectory = 'web/dist'
    config.installCommand = 'pnpm install'
  }

  if (options.projectName) {
    (config as any).name = options.projectName
  }

  await fs.writeFile(
    path.join(projectDir, 'vercel.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  )
}

export function generateDeployButton(repoUrl?: string): string {
  if (!repoUrl) {
    return '[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)'
  }
  const encoded = encodeURIComponent(repoUrl)
  return `[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=${encoded})`
}
