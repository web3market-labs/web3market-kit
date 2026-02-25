import { Command } from 'commander'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { logger } from '../utils/logger.js'
import { ensureAuth } from '../utils/auth-guard.js'
import { createClient } from '../utils/api-client.js'
import { runWizard, requireInput } from '../wizard/index.js'
import type { WizardState, WizardStep } from '../wizard/index.js'

interface PublishState extends WizardState {
  module?: string
  variant?: string
  chains?: string[]
  deployments?: Record<string, unknown>[]
  title?: string
  tagline?: string
  description?: string
  price?: string
  isFree?: boolean
  isSupported?: boolean
  category?: string
  subcategory?: string
  tags?: string[]
  zipPath?: string
  fileCount?: number
  sizeBytes?: number
  thumbnailPath?: string
  useCustomThumbnail?: boolean
  productId?: number
  productSlug?: string
  marketplaceUrl?: string
}

export function publishCommand(): Command {
  return new Command('publish')
    .description('Publish your dApp to the Web3 Market marketplace')
    .action(async () => {
      try {
        const projectRoot = process.cwd()

        await runWizard<PublishState>({
          name: pc.bgMagenta(pc.white(pc.bold(' Web3 Market — Publish to Marketplace '))),
          context: { projectRoot, chain: 'sepolia', chainId: 11155111, existingModules: [] },
          initialState: {},
          steps: [
            createReadConfigStep(),
            createReadDeploymentsStep(),
            createMetadataStep(),
            createPricingStep(),
            createCategoryStep(),
            createPackageStep(),
            createThumbnailStep(),
            createAuthCheckStep(),
            createUploadStep(),
          ],
          onComplete: async (state) => {
            console.log('')
            p.outro(pc.green(pc.bold('Product submitted!')))
            console.log(pc.dim('\n  Your product details:'))
            console.log(pc.dim(`  Title:  ${state.title}`))
            console.log(pc.dim(`  Status: ${pc.yellow('Pending review')}`))
            if (state.marketplaceUrl) {
              console.log(pc.dim(`  URL:    ${state.marketplaceUrl}`))
            }
            console.log(pc.dim("\n  You'll receive an email once your product is reviewed."))
            console.log(pc.dim(`  Manage products: ${pc.bold('w3m products')}`))
            console.log('')
          },
        })
      } catch (error) {
        if (p.isCancel(error)) { p.cancel('Cancelled.'); process.exit(0) }
        const message = error instanceof Error ? error.message : 'Publish failed'
        logger.error(message)
        process.exit(1)
      }
    })
}

function createReadConfigStep(): WizardStep<PublishState> {
  return {
    id: 'read-config',
    title: 'Read project config',
    run: async (ctx, state) => {
      logger.step('Reading project configuration...')
      const configPath = join(ctx.projectRoot, 'kit.config.ts')
      if (!existsSync(configPath)) { logger.warn('No kit.config.ts found.'); return }

      try {
        const { loadConfig } = await import('@web3market/config')
        const config = await loadConfig({ cwd: ctx.projectRoot })
        const modules = config.modules ? Object.keys(config.modules) : []
        if (modules.length > 0) {
          state.module = modules[0]
          const firstModule = modules[0]!
          const moduleConfig = config.modules[firstModule] as Record<string, unknown> | undefined
          if (moduleConfig?.type) state.variant = moduleConfig.type as string
        }
        if (!state.module && config.components.length > 0) state.module = config.components[0]
        if (config.chains?.targets) state.chains = Object.keys(config.chains.targets)
        if (state.module) logger.success(`Detected module: ${pc.bold(state.module)}${state.variant ? ` (${state.variant})` : ''}`)
      } catch { logger.warn('Could not parse kit.config.ts') }
    },
  }
}

function createReadDeploymentsStep(): WizardStep<PublishState> {
  return {
    id: 'read-deployments',
    title: 'Read deployments',
    run: async (ctx, state) => {
      const deploymentsDir = join(ctx.projectRoot, 'deployments')
      if (!existsSync(deploymentsDir)) return
      try {
        const { readdirSync } = await import('node:fs')
        const files = readdirSync(deploymentsDir).filter((f: string) => f.endsWith('.json'))
        const deployments: Record<string, unknown>[] = []
        for (const file of files) {
          try { deployments.push(JSON.parse(readFileSync(join(deploymentsDir, file), 'utf-8'))) } catch {}
        }
        if (deployments.length > 0) { state.deployments = deployments; logger.success(`Found ${deployments.length} deployment(s)`) }
      } catch {}
    },
  }
}

function createMetadataStep(): WizardStep<PublishState> {
  return {
    id: 'metadata',
    title: 'Product metadata',
    run: async (_ctx, state) => {
      const moduleNames: Record<string, string> = { token: 'ERC-20 Token' }
      let defaultTitle = 'My dApp'
      if (state.module) defaultTitle = moduleNames[state.module as string] || (state.module as string)

      state.title = requireInput(await p.text({ message: 'Product title:', defaultValue: defaultTitle, placeholder: defaultTitle })) as string
      state.tagline = requireInput(await p.text({ message: 'Tagline (max 60 chars):', placeholder: 'A one-line description', validate: (v) => { if (!v) return 'Required'; if (v.length > 60) return 'Max 60 chars'; return undefined } })) as string
      state.description = requireInput(await p.text({ message: 'Full description:', placeholder: 'Describe your product...', validate: (v) => { if (!v) return 'Required'; if (v.length < 20) return 'Min 20 chars'; return undefined } })) as string
    },
  }
}

function createPricingStep(): WizardStep<PublishState> {
  return {
    id: 'pricing',
    title: 'Pricing',
    run: async (_ctx, state) => {
      const isFree = requireInput(await p.confirm({ message: 'Is this product free?', initialValue: true }))
      state.isFree = isFree
      if (!isFree) {
        state.price = requireInput(await p.text({ message: 'Price (USD):', placeholder: '49', validate: (v) => { const n = Number(v); if (Number.isNaN(n) || n <= 0) return 'Must be positive'; return undefined } })) as string
      } else { state.price = '0' }
      state.isSupported = requireInput(await p.confirm({ message: 'Will you provide support?', initialValue: true }))
    },
  }
}

function createCategoryStep(): WizardStep<PublishState> {
  return {
    id: 'category',
    title: 'Category & tags',
    run: async (_ctx, state) => {
      const { MODULE_CATEGORY_MAP, resolveBlockchains } = await import('../lib/marketplace/index.js')
      const module = (state.module as string) || 'token'
      const mapping = MODULE_CATEGORY_MAP[module]

      if (mapping) {
        state.category = mapping.category
        state.subcategory = mapping.subcategory
        state.tags = [...mapping.defaultTags]
        logger.success(`Category: ${mapping.category} > ${mapping.subcategory}`)
      } else {
        state.category = requireInput(await p.select({
          message: 'Select a category:',
          options: [
            { value: 'defi-dex', label: 'DeFi & DEX' },
            { value: 'token-tools', label: 'Token Tools' },
            { value: 'nfts-games', label: 'NFTs & Games' },
            { value: 'launch-token-sales', label: 'Launch & Token Sales' },
            { value: 'templates-clones', label: 'Templates & Clones' },
          ],
        })) as string
        state.tags = []
      }

      const extraTags = requireInput(await p.text({ message: 'Additional tags (comma-separated):', placeholder: 'solidity, audited', defaultValue: '' })) as string
      if (extraTags.trim()) {
        state.tags = [...(state.tags || []), ...extraTags.split(',').map((t) => t.trim()).filter(Boolean)]
      }

      if (state.chains && (state.chains as string[]).length > 0) {
        logger.success(`Blockchains: ${resolveBlockchains(state.chains as string[]).join(', ')}`)
      }
    },
  }
}

function createPackageStep(): WizardStep<PublishState> {
  return {
    id: 'package',
    title: 'Package project',
    run: async (ctx, state) => {
      const spinner = p.spinner()
      spinner.start('Packaging project files...')
      try {
        const { createProjectZip } = await import('../lib/marketplace/index.js')
        const result = createProjectZip(ctx.projectRoot)
        state.zipPath = result.zipPath
        state.fileCount = result.fileCount
        state.sizeBytes = result.sizeBytes
        spinner.stop(`Packaged ${result.fileCount} files (${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB)`)
      } catch (err) { spinner.stop('Packaging failed'); throw err }
    },
  }
}

function createThumbnailStep(): WizardStep<PublishState> {
  return {
    id: 'thumbnail',
    title: 'Thumbnail',
    run: async (ctx, state) => {
      const useCustom = requireInput(await p.confirm({ message: 'Do you have a custom thumbnail?', initialValue: false }))
      if (useCustom) {
        const thumbnailPath = requireInput(await p.text({
          message: 'Path to thumbnail (PNG or JPG):',
          placeholder: './thumbnail.png',
          validate: (v) => { if (!v) return 'Required'; if (!existsSync(resolve(ctx.projectRoot, v))) return 'File not found'; return undefined },
        })) as string
        state.thumbnailPath = resolve(ctx.projectRoot, thumbnailPath)
        state.useCustomThumbnail = true
      } else {
        state.useCustomThumbnail = false
        logger.info('A placeholder thumbnail will be generated.')
      }
    },
  }
}

function createAuthCheckStep(): WizardStep<PublishState> {
  return {
    id: 'auth-check',
    title: 'Authentication check',
    run: async (_ctx, _state) => {
      const { apiKey, user } = await ensureAuth()
      logger.success(`Authenticated as ${pc.bold(user.name)} (${user.email})`)
    },
  }
}

function createUploadStep(): WizardStep<PublishState> {
  return {
    id: 'upload',
    title: 'Upload & publish',
    run: async (_ctx, state) => {
      const spinner = p.spinner()
      spinner.start('Publishing to Web3 Market...')
      try {
        const { ensureAuth } = await import('../utils/auth-guard.js')
        const { apiKey } = await ensureAuth()
        const client = createClient(apiKey)
        const { fileToBlob, generatePlaceholderThumbnail, resolveBlockchains } = await import('../lib/marketplace/index.js')

        const formData = new FormData()
        formData.set('module', (state.module as string) || 'custom')
        if (state.variant) formData.set('variant', state.variant as string)
        formData.set('title', state.title as string)
        formData.set('tagline', state.tagline as string)
        formData.set('description', state.description as string)
        formData.set('price', state.price as string)
        formData.set('is_supported', String(state.isSupported ?? true))
        if (state.category) formData.set('category', state.category as string)
        if (state.subcategory) formData.set('subcategory', state.subcategory as string)
        if (state.tags) formData.set('tags', JSON.stringify(state.tags))

        const blockchains = state.chains ? resolveBlockchains(state.chains as string[]) : ['Ethereum']
        formData.set('blockchains', JSON.stringify(blockchains))

        // Attach zip
        const zipBuffer = readFileSync(state.zipPath as string)
        formData.set('product_zip', new Blob([zipBuffer], { type: 'application/zip' }), 'product.zip')

        // Attach thumbnail
        if (state.useCustomThumbnail && state.thumbnailPath) {
          const thumb = fileToBlob(state.thumbnailPath as string, 'image/png')
          formData.set('thumbnail', thumb, 'thumbnail.png')
        } else {
          const placeholder = generatePlaceholderThumbnail()
          formData.set('thumbnail', new Blob([placeholder], { type: 'image/png' }), 'thumbnail.png')
        }

        const result = await client.publishProduct(formData)
        state.productId = result.product.id
        state.productSlug = result.product.slug
        state.marketplaceUrl = result.marketplace_url
        spinner.stop('Published successfully!')

        // Cleanup
        try { const { unlinkSync } = await import('node:fs'); unlinkSync(state.zipPath as string) } catch {}
      } catch (err) { spinner.stop('Publishing failed'); throw err }
    },
  }
}
