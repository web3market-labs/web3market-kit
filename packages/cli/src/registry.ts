/**
 * Component registry — wraps @web3market/components for CLI use.
 */
import type { KitComponent, ComponentTier } from '@web3market/sdk'
import {
  componentRegistry,
  getComponent,
  listComponents as listComponentDescriptors,
} from '@web3market/components'

export interface RegistryEntry {
  name: string
  tier: ComponentTier
  description: string
}

/**
 * List all available components from the components package.
 */
export function listComponents(): RegistryEntry[] {
  return listComponentDescriptors().map((c) => ({
    name: c.id,
    tier: c.tier,
    description: c.description,
  }))
}

/**
 * Resolve a component by name from the components package.
 */
export function resolveComponent(name: string): KitComponent | null {
  return getComponent(name) ?? null
}

/**
 * Check if a component name exists in the registry.
 */
export function isKnownComponent(name: string): boolean {
  return getComponent(name) !== undefined
}
