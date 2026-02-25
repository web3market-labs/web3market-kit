import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  'dist',
  'out',
  'cache',
  'artifacts',
  '.next',
  '.turbo',
]

export function collectProjectFiles(projectRoot: string): string[] {
  const files: string[] = []
  const include = ['contracts', 'src', 'kit.config.ts', 'package.json', 'foundry.toml']

  for (const entry of include) {
    const fullPath = join(projectRoot, entry)
    if (!existsSync(fullPath)) continue

    const stat = statSync(fullPath)
    if (stat.isFile()) {
      files.push(entry)
    } else if (stat.isDirectory()) {
      collectDir(projectRoot, entry, files)
    }
  }

  return files
}

function collectDir(root: string, dir: string, files: string[]): void {
  const fullDir = join(root, dir)
  for (const entry of readdirSync(fullDir)) {
    if (EXCLUDE_PATTERNS.includes(entry)) continue

    const relPath = join(dir, entry)
    const fullPath = join(root, relPath)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      collectDir(root, relPath, files)
    } else {
      files.push(relPath)
    }
  }
}

export function createProjectZip(projectRoot: string): { zipPath: string; fileCount: number; sizeBytes: number } {
  const files = collectProjectFiles(projectRoot)
  if (files.length === 0) {
    throw new Error('No project files found to package')
  }

  const zipPath = join(tmpdir(), `web3market-product-${Date.now()}.zip`)
  const fileList = files.map((f) => `"${f}"`).join(' ')

  execSync(`cd "${projectRoot}" && zip -q -r "${zipPath}" ${fileList}`, {
    stdio: 'pipe',
  })

  const stat = statSync(zipPath)
  return { zipPath, fileCount: files.length, sizeBytes: stat.size }
}

export function generatePlaceholderThumbnail(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  )
}

export function fileToBlob(filePath: string, mimeType: string): Blob {
  const buffer = readFileSync(filePath)
  return new Blob([buffer], { type: mimeType })
}
