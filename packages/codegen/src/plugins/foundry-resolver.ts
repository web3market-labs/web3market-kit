import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CodegenPlugin, ContractArtifact, ResolveConfig } from '../types.js'

const TEST_CONTRACT_PATTERNS = [
  /\.t\.sol$/, /\.s\.sol$/, /Test\.sol$/, /Script\.sol$/,
  /test\//i, /script\//i, /forge-std\//,
]

function isTestOrScript(sourcePath: string): boolean {
  return TEST_CONTRACT_PATTERNS.some((pattern) => pattern.test(sourcePath))
}

function matchesPattern(name: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
  return regex.test(name)
}

function passesFilters(name: string, sourcePath: string, include: string[], exclude: string[]): boolean {
  if (include.length > 0) {
    const included = include.some((p) => matchesPattern(name, p) || matchesPattern(sourcePath, p))
    if (!included) return false
  }
  if (exclude.length > 0) {
    const excluded = exclude.some((p) => matchesPattern(name, p) || matchesPattern(sourcePath, p))
    if (excluded) return false
  }
  return true
}

async function parseFoundryArtifact(filePath: string, contractName: string): Promise<ContractArtifact | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const json = JSON.parse(raw)
    if (!json.abi || !Array.isArray(json.abi) || json.abi.length === 0) return null

    let sourcePath: string | undefined
    if (json.metadata?.settings?.compilationTarget) {
      sourcePath = Object.keys(json.metadata.settings.compilationTarget)[0]
    } else if (json.ast?.absolutePath) {
      sourcePath = json.ast.absolutePath
    }

    const bytecode = typeof json.bytecode === 'object' && json.bytecode?.object
      ? json.bytecode.object
      : typeof json.bytecode === 'string' ? json.bytecode : undefined

    const deployedBytecode = typeof json.deployedBytecode === 'object' && json.deployedBytecode?.object
      ? json.deployedBytecode.object
      : typeof json.deployedBytecode === 'string' ? json.deployedBytecode : undefined

    return { name: contractName, abi: json.abi, bytecode, deployedBytecode, sourcePath }
  } catch {
    return null
  }
}

export const foundryResolverPlugin: CodegenPlugin = {
  name: 'foundry-resolver',

  async resolve(config: ResolveConfig): Promise<ContractArtifact[]> {
    const outDir = path.join(config.root, 'out')
    const artifacts: ContractArtifact[] = []

    let contractDirs: string[]
    try {
      contractDirs = await fs.readdir(outDir)
    } catch {
      throw new Error(`Foundry output directory not found at "${outDir}". Run \`forge build\` first.`)
    }

    for (const contractDir of contractDirs) {
      const contractDirPath = path.join(outDir, contractDir)
      let stat
      try { stat = await fs.stat(contractDirPath) } catch { continue }
      if (!stat.isDirectory()) continue

      let jsonFiles: string[]
      try { jsonFiles = await fs.readdir(contractDirPath) } catch { continue }

      for (const jsonFile of jsonFiles) {
        if (!jsonFile.endsWith('.json')) continue
        const contractName = jsonFile.replace('.json', '')
        const artifactPath = path.join(contractDirPath, jsonFile)

        if (isTestOrScript(contractDir)) continue

        const artifact = await parseFoundryArtifact(artifactPath, contractName)
        if (!artifact) continue
        if (artifact.sourcePath && isTestOrScript(artifact.sourcePath)) continue
        if (!passesFilters(contractName, artifact.sourcePath ?? contractDir, config.include, config.exclude)) continue

        artifacts.push(artifact)
      }
    }

    return artifacts
  },
}
