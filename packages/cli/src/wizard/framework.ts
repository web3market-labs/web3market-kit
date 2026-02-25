import * as p from '@clack/prompts'
import { getChainId, getChainSelectOptions } from '../utils/chains.js'

export interface WizardState {
  [key: string]: unknown
}

export interface WizardContext {
  projectRoot: string
  chain: string
  chainId: number
  existingModules: string[]
  apiKey?: string
}

export interface WizardStep<S extends WizardState = WizardState> {
  id: string
  title: string
  run: (ctx: WizardContext, state: S) => Promise<void>
  skip?: (ctx: WizardContext, state: S) => boolean
}

export interface WizardOptions<S extends WizardState = WizardState> {
  name: string
  steps: WizardStep<S>[]
  context: WizardContext
  initialState: S
  onComplete?: (state: S) => Promise<void>
}

/**
 * Run a wizard with the given steps.
 */
export async function runWizard<S extends WizardState>(options: WizardOptions<S>): Promise<S> {
  const { name, steps, context, initialState, onComplete } = options
  const state = { ...initialState }

  p.intro(`Setting up ${name}`)

  for (const step of steps) {
    if (step.skip?.(context, state)) {
      continue
    }

    try {
      await step.run(context, state)
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_CANCELLED') {
        p.cancel('Wizard cancelled.')
        process.exit(0)
      }
      throw error
    }
  }

  if (onComplete) {
    await onComplete(state)
  }

  return state
}

/**
 * Helper to handle user cancellation in prompts.
 */
export function requireInput<T>(result: T | symbol): T {
  if (p.isCancel(result)) {
    throw new Error('USER_CANCELLED')
  }
  return result
}

// ─── Common Steps ─────────────────────────────────────────────────────

/**
 * Common step: select a blockchain network.
 */
export function createChainSelectionStep<S extends WizardState & { chain?: string; chainId?: number }>(): WizardStep<S> {
  return {
    id: 'chain',
    title: 'Select chain',
    run: async (_ctx, state) => {
      const chain = requireInput(await p.select({
        message: 'Which chain do you want to deploy to?',
        options: getChainSelectOptions(),
      }))

      state.chain = chain as string
      state.chainId = getChainId(chain as string) ?? 31337
    },
  }
}

/**
 * Common step: configure token (existing or new).
 */
export function createTokenSetupStep<S extends WizardState & { tokenAddress?: string; tokenName?: string; tokenSymbol?: string; useExistingToken?: boolean }>(): WizardStep<S> {
  return {
    id: 'token',
    title: 'Token setup',
    run: async (_ctx, state) => {
      const hasToken = requireInput(await p.confirm({
        message: 'Do you have an existing ERC-20 token contract?',
        initialValue: false,
      }))

      if (hasToken) {
        state.useExistingToken = true
        state.tokenAddress = requireInput(await p.text({
          message: 'Enter your token contract address:',
          placeholder: '0x...',
          validate: (val) => {
            if (!/^0x[a-fA-F0-9]{40}$/.test(val)) return 'Invalid Ethereum address'
            return undefined
          },
        })) as string
      } else {
        state.useExistingToken = false
        state.tokenName = requireInput(await p.text({
          message: 'Token name:',
          placeholder: 'My Token',
          defaultValue: 'My Token',
        })) as string
        state.tokenSymbol = requireInput(await p.text({
          message: 'Token symbol:',
          placeholder: 'MTK',
          defaultValue: 'STK',
        })) as string
      }
    },
  }
}
