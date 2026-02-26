import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'fs-extra'
import { execa } from 'execa'
import { getComponent } from '@web3marketlabs/components'
import { renderTemplate } from './utils/template.js'
import { logger } from './utils/logger.js'
import { installSolidityDep } from './utils/foundry.js'
import type { AppTemplate } from './templates/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const esmRequire = createRequire(import.meta.url)

export interface TemplateScaffoldOptions {
  name: string
  template: AppTemplate
  params: Record<string, string | boolean>
}

export async function scaffoldFromTemplate(options: TemplateScaffoldOptions): Promise<void> {
  const { name, template, params } = options
  const projectDir = path.resolve(process.cwd(), name)

  if (await fs.pathExists(projectDir)) {
    throw new Error(`Directory "${name}" already exists.`)
  }

  logger.step(`Creating project: ${name} (template: ${template.displayName})`)
  await fs.ensureDir(projectDir)

  const templatesDir = path.resolve(__dirname, '..', 'templates', 'apps')
  const sharedDir = path.join(templatesDir, '_shared')

  const componentsArray = template.components.map((c) => `'${c}'`).join(', ')
  const ctx: Record<string, unknown> = {
    ...params,
    projectName: name,
    templateId: template.id,
    componentsArray,
  }

  // 1. Render shared root templates
  logger.step('Writing project config files...')
  await renderSharedDir(path.join(sharedDir, 'root'), projectDir, ctx)

  // 2. Render contracts structure
  logger.step('Setting up contracts...')
  const contractsDir = path.join(projectDir, 'contracts')
  await fs.ensureDir(path.join(contractsDir, 'src'))
  await fs.ensureDir(path.join(contractsDir, 'test'))
  await fs.ensureDir(path.join(contractsDir, 'script'))
  await renderSharedDir(path.join(sharedDir, 'contracts'), contractsDir, ctx)

  // 3. Render component contract templates (reuses existing component system)
  logger.step('Rendering component contracts...')
  for (const componentId of template.components) {
    const component = getComponent(componentId)
    if (!component) {
      logger.warn(`Component "${componentId}" not found in registry, skipping`)
      continue
    }

    for (const file of component.files) {
      const outputRelative = renderTemplate(file.outputPath, ctx as Record<string, unknown>)
      const outputPath = path.join(projectDir, outputRelative)
      await fs.ensureDir(path.dirname(outputPath))

      if (file.template) {
        // Read the component template file and render with params
        try {
          const templateContent = await resolveComponentTemplate(file.templatePath)
          const rendered = renderTemplate(templateContent, ctx as Record<string, unknown>)
          await fs.writeFile(outputPath, rendered, 'utf-8')
        } catch {
          logger.warn(`Could not render template: ${file.templatePath}`)
        }
      } else {
        try {
          const content = await resolveComponentTemplate(file.templatePath)
          await fs.writeFile(outputPath, content, 'utf-8')
        } catch {
          logger.warn(`Could not copy: ${file.templatePath}`)
        }
      }
    }
    logger.success(`Component: ${component.displayName}`)
  }

  // 4. Render shared frontend templates
  logger.step('Setting up frontend...')
  const webDir = path.join(projectDir, 'web')
  await fs.ensureDir(path.join(webDir, 'app'))
  await fs.ensureDir(path.join(webDir, 'components'))
  await fs.ensureDir(path.join(webDir, 'lib'))
  await fs.ensureDir(path.join(webDir, 'hooks'))

  // Render shared frontend files at the correct nested paths
  await renderSharedDir(path.join(sharedDir, 'frontend'), webDir, ctx)

  // 5. Render template-specific frontend files
  logger.step('Rendering template UI...')
  for (const file of template.frontendFiles) {
    const templateFilePath = path.join(templatesDir, file.templatePath)
    const outputPath = path.join(projectDir, file.outputPath)
    await fs.ensureDir(path.dirname(outputPath))

    try {
      const content = await fs.readFile(templateFilePath, 'utf-8')
      const rendered = renderTemplate(content, ctx as Record<string, unknown>)
      await fs.writeFile(outputPath, rendered, 'utf-8')
    } catch {
      logger.warn(`Could not render: ${file.templatePath}`)
    }
  }
  logger.success('Frontend rendered')

  // 6. Install pnpm deps
  logger.step('Installing dependencies with pnpm...')
  try {
    await execa('pnpm', ['install'], { cwd: projectDir, stdio: 'pipe' })
    logger.success('Dependencies installed')
  } catch {
    logger.warn('Could not install dependencies automatically. Run pnpm install manually.')
  }

  // 7. Install Solidity dependencies (requires git repo for forge install)
  logger.step('Installing Solidity dependencies...')
  let allSolDepsOk = true
  for (const dep of ['OpenZeppelin/openzeppelin-contracts', 'foundry-rs/forge-std']) {
    const ok = await installSolidityDep(contractsDir, dep)
    if (ok) {
      logger.success(`Installed ${dep.split('/')[1]}`)
    } else {
      allSolDepsOk = false
    }
  }
  if (!allSolDepsOk) {
    logger.warn('Some Solidity deps failed to install. They will be retried on first build.')
  }

  // 9. Run codegen
  logger.step('Running codegen...')
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: projectDir })
    logger.success('Codegen complete')
  } catch {
    logger.info('Skipping codegen (will run on first "w3m dev")')
  }

  logger.success('Project scaffolded successfully!')
}

/**
 * Recursively render all .hbs files from a source directory into a target directory,
 * preserving subdirectory structure. Non-.hbs files are skipped.
 */
async function renderSharedDir(
  srcDir: string,
  destDir: string,
  ctx: Record<string, unknown>,
): Promise<void> {
  if (!(await fs.pathExists(srcDir))) return

  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    if (entry.isDirectory()) {
      const subDestDir = path.join(destDir, entry.name)
      await fs.ensureDir(subDestDir)
      await renderSharedDir(srcPath, subDestDir, ctx)
    } else if (entry.name.endsWith('.hbs')) {
      const outputName = entry.name.replace(/\.hbs$/, '')
      const outputPath = path.join(destDir, outputName)
      const content = await fs.readFile(srcPath, 'utf-8')
      const rendered = renderTemplate(content, ctx as Record<string, unknown>)
      await fs.writeFile(outputPath, rendered, 'utf-8')
    }
  }
}

/**
 * Resolve a component template file content.
 * First tries the @web3marketlabs/components package, then local fallback.
 */
async function resolveComponentTemplate(templatePath: string): Promise<string> {
  // Try resolving from @web3marketlabs/components package
  try {
    const pkgJsonPath = esmRequire.resolve('@web3marketlabs/components/package.json')
    const pkgRoot = path.dirname(pkgJsonPath)
    const fullPath = path.join(pkgRoot, templatePath)
    return await fs.readFile(fullPath, 'utf-8')
  } catch {
    // Fallback to monorepo path
    const fallback = path.resolve(__dirname, '..', '..', 'components', templatePath)
    return await fs.readFile(fallback, 'utf-8')
  }
}

export interface ScaffoldOptions {
  name: string
  contractFramework: 'foundry' | 'hardhat'
  frontend: 'next' | 'vite' | 'none'
  components: string[]
  chains: string[]
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun'
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
  const projectDir = path.resolve(process.cwd(), options.name)

  if (await fs.pathExists(projectDir)) {
    throw new Error(`Directory "${options.name}" already exists.`)
  }

  logger.step(`Creating project directory: ${options.name}`)
  await fs.ensureDir(projectDir)

  await writeRootPackageJson(projectDir, options)
  await writeKitConfig(projectDir, options)
  await scaffoldContracts(projectDir, options)
  if (options.frontend !== 'none') await scaffoldFrontend(projectDir, options)
  await writeEnvExample(projectDir)
  await writeGitignore(projectDir)
  await writeTurboJson(projectDir)
  if (options.packageManager === 'pnpm') await writePnpmWorkspace(projectDir)
  if (options.frontend !== 'none') await writeVercelJson(projectDir, options)
  await installDependencies(projectDir, options)
  if (options.contractFramework === 'foundry') {
    await installSolidityDeps(projectDir)
  }
  await runInitialCodegen(projectDir)

  logger.success('Project scaffolded successfully!')
}

async function writeRootPackageJson(projectDir: string, options: ScaffoldOptions): Promise<void> {
  const workspaces = options.frontend !== 'none' ? ['contracts', 'web'] : ['contracts']
  const pkg: Record<string, unknown> = {
    name: path.basename(options.name),
    version: '0.0.0',
    private: true,
    scripts: { dev: 'w3m dev', build: 'turbo run build', test: 'w3m test', generate: 'w3m generate', deploy: 'w3m deploy' },
    devDependencies: { '@web3marketlabs/cli': '^0.2.0', turbo: '^2.3.0' },
  }
  if (options.packageManager !== 'pnpm') (pkg as any).workspaces = workspaces
  await fs.writeJson(path.join(projectDir, 'package.json'), pkg, { spaces: 2 })
}

async function writeKitConfig(projectDir: string, options: ScaffoldOptions): Promise<void> {
  const componentsArray = options.components.map((b) => `'${b}'`).join(', ')
  const content = `import { defineConfig } from '@web3marketlabs/config'\n\nexport default defineConfig({\n  contracts: {\n    framework: '${options.contractFramework}',\n  },\n  chains: {\n    default: '${options.chains.includes('sepolia') ? 'sepolia' : 'localhost'}',\n  },\n  components: [${componentsArray}],\n})\n`
  await fs.writeFile(path.join(projectDir, 'kit.config.ts'), content, 'utf-8')
}

async function scaffoldContracts(projectDir: string, options: ScaffoldOptions): Promise<void> {
  const contractsDir = path.join(projectDir, 'contracts')
  await fs.ensureDir(path.join(contractsDir, 'src'))
  await fs.ensureDir(path.join(contractsDir, 'test'))
  await fs.ensureDir(path.join(contractsDir, 'script'))

  if (options.contractFramework === 'foundry') {
    const foundryToml = `[profile.default]\nsrc = "src"\nout = "out"\nlibs = ["lib"]\nsolc_version = "0.8.24"\n\n[fmt]\nline_length = 100\ntab_width = 4\nbracket_spacing = true\n\n[rpc_endpoints]\nlocalhost = "http://127.0.0.1:8545"\nsepolia = "\${SEPOLIA_RPC_URL}"\nmainnet = "\${MAINNET_RPC_URL}"\n`
    await fs.writeFile(path.join(contractsDir, 'foundry.toml'), foundryToml, 'utf-8')

    const remappings = `@openzeppelin/=lib/openzeppelin-contracts/\nforge-std/=lib/forge-std/src/\n`
    await fs.writeFile(path.join(contractsDir, 'remappings.txt'), remappings, 'utf-8')

    const counterSol = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\ncontract Counter {\n    uint256 public number;\n\n    function setNumber(uint256 newNumber) public {\n        number = newNumber;\n    }\n\n    function increment() public {\n        number++;\n    }\n}\n`
    await fs.writeFile(path.join(contractsDir, 'src', 'Counter.sol'), counterSol, 'utf-8')

    const deployScript = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nimport "forge-std/Script.sol";\nimport "../src/Counter.sol";\n\ncontract Deploy is Script {\n    function run() external {\n        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");\n        vm.startBroadcast(deployerPrivateKey);\n        new Counter();\n        vm.stopBroadcast();\n    }\n}\n`
    await fs.writeFile(path.join(contractsDir, 'script', 'Deploy.s.sol'), deployScript, 'utf-8')
  }
}

async function scaffoldFrontend(projectDir: string, options: ScaffoldOptions): Promise<void> {
  const webDir = path.join(projectDir, 'web')
  await fs.ensureDir(webDir)
  if (options.frontend === 'next') await scaffoldNextApp(webDir, options)
  else if (options.frontend === 'vite') await scaffoldViteApp(webDir, options)
}

async function scaffoldNextApp(webDir: string, options: ScaffoldOptions): Promise<void> {
  await fs.ensureDir(path.join(webDir, 'app'))
  await fs.ensureDir(path.join(webDir, 'lib'))

  const pkg = {
    name: `${path.basename(options.name)}-web`, version: '0.0.0', private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dependencies: { next: '^15.1.0', react: '^19.0.0', 'react-dom': '^19.0.0', '@web3marketlabs/react': '^0.1.0', '@web3marketlabs/sdk': '^0.1.0', wagmi: '^2.14.0', viem: '^2.22.0', '@tanstack/react-query': '^5.62.0' },
    devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', typescript: '^5.7.0', tailwindcss: '^4.0.0' },
  }
  await fs.writeJson(path.join(webDir, 'package.json'), pkg, { spaces: 2 })

  const wagmiTs = `import { http, createConfig } from 'wagmi'\nimport { mainnet, sepolia, arbitrum, base, polygon, optimism } from 'wagmi/chains'\n\nexport const wagmiConfig = createConfig({\n  chains: [mainnet, sepolia, arbitrum, base, polygon, optimism],\n  transports: {\n    [mainnet.id]: http(),\n    [sepolia.id]: http(),\n    [arbitrum.id]: http(),\n    [base.id]: http(),\n    [polygon.id]: http(),\n    [optimism.id]: http(),\n  },\n  ssr: true,\n})\n\ndeclare module 'wagmi' {\n  interface Register {\n    config: typeof wagmiConfig\n  }\n}\n`
  await fs.writeFile(path.join(webDir, 'lib', 'wagmi.ts'), wagmiTs, 'utf-8')

  const pageTsx = `export default function Home() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center p-8">\n      <h1 className="text-4xl font-bold mb-4">${options.name}</h1>\n      <p className="text-lg text-gray-600">Built with Web3 Market dApp Kit</p>\n    </main>\n  )\n}\n`
  await fs.writeFile(path.join(webDir, 'app', 'page.tsx'), pageTsx, 'utf-8')

  const layoutTsx = `import type { Metadata } from 'next'\n\nexport const metadata: Metadata = {\n  title: '${options.name}',\n  description: 'Built with Web3 Market dApp Kit',\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  )\n}\n`
  await fs.writeFile(path.join(webDir, 'app', 'layout.tsx'), layoutTsx, 'utf-8')
}

async function scaffoldViteApp(webDir: string, options: ScaffoldOptions): Promise<void> {
  await fs.ensureDir(path.join(webDir, 'src'))
  const pkg = {
    name: `${path.basename(options.name)}-web`, version: '0.0.0', private: true, type: 'module',
    scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', '@web3marketlabs/react': '^0.1.0', '@web3marketlabs/sdk': '^0.1.0', wagmi: '^2.14.0', viem: '^2.22.0', '@tanstack/react-query': '^5.62.0' },
    devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', '@vitejs/plugin-react': '^4.3.0', typescript: '^5.7.0', vite: '^6.0.0' },
  }
  await fs.writeJson(path.join(webDir, 'package.json'), pkg, { spaces: 2 })

  const appTsx = `export function App() {\n  return (\n    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>\n      <h1>${options.name}</h1>\n      <p>Built with Web3 Market dApp Kit</p>\n    </div>\n  )\n}\n`
  await fs.writeFile(path.join(webDir, 'src', 'App.tsx'), appTsx, 'utf-8')
}

async function writeEnvExample(projectDir: string): Promise<void> {
  const content = `# Wallet Connect\nNEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=\n\n# RPC\nSEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY\nMAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY\n\n# Deployer\nDEPLOYER_PRIVATE_KEY=\n\n# Web3 Market API Key\n# WEB3MARKET_API_KEY=\n`
  await fs.writeFile(path.join(projectDir, '.env.example'), content, 'utf-8')
}

async function writeGitignore(projectDir: string): Promise<void> {
  const content = `node_modules/\ndist/\nout/\n.next/\ncache/\nbroadcast/\n.env\n.env.local\n.env.*.local\n.vscode/\n.idea/\n.DS_Store\ncontracts/out/\ncontracts/cache/\ncontracts/lib/\n.turbo/\ndeployments/*.log\nsrc/generated/\n`
  await fs.writeFile(path.join(projectDir, '.gitignore'), content, 'utf-8')
}

async function writeTurboJson(projectDir: string): Promise<void> {
  const turbo = { $schema: 'https://turbo.build/schema.json', globalDependencies: ['**/.env.*local'], tasks: { build: { dependsOn: ['^build'], outputs: ['dist/**', '.next/**', 'out/**'] }, dev: { cache: false, persistent: true }, test: { dependsOn: ['build'] }, lint: {}, typecheck: { dependsOn: ['^build'] } } }
  await fs.writeJson(path.join(projectDir, 'turbo.json'), turbo, { spaces: 2 })
}

async function writePnpmWorkspace(projectDir: string): Promise<void> {
  await fs.writeFile(path.join(projectDir, 'pnpm-workspace.yaml'), `packages:\n  - "contracts"\n  - "web"\n`, 'utf-8')
}

async function writeVercelJson(projectDir: string, options: ScaffoldOptions): Promise<void> {
  const { generateVercelJson } = await import('./lib/vercel/index.js')
  await generateVercelJson(projectDir, { frontend: options.frontend, projectName: options.name })
}

async function installDependencies(projectDir: string, options: ScaffoldOptions): Promise<void> {
  logger.step(`Installing dependencies with ${options.packageManager}...`)
  try {
    await execa(options.packageManager, ['install'], { cwd: projectDir, stdio: 'pipe' })
    logger.success('Dependencies installed')
  } catch {
    logger.warn('Could not install dependencies automatically. Run install manually.')
  }
}

async function installSolidityDeps(projectDir: string): Promise<void> {
  const contractsDir = path.join(projectDir, 'contracts')
  logger.step('Installing Solidity dependencies...')
  for (const dep of ['OpenZeppelin/openzeppelin-contracts', 'foundry-rs/forge-std']) {
    const ok = await installSolidityDep(contractsDir, dep)
    if (ok) {
      logger.success(`Installed ${dep.split('/')[1]}`)
    }
  }
}

async function runInitialCodegen(projectDir: string): Promise<void> {
  try {
    const { runCodegen } = await import('@web3marketlabs/codegen')
    await runCodegen({ root: projectDir })
    logger.success('Initial codegen complete')
  } catch {
    logger.info('Skipping initial codegen (will run on first "w3m dev")')
  }
}
