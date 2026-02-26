export { tokenComponent } from './token.js'

import { tokenComponent } from './token.js'
import type { KitComponent } from '@web3marketlabs/sdk'

export const componentRegistry: Record<string, KitComponent> = {
  token: tokenComponent,
}

export function getComponent(id: string): KitComponent | undefined {
  return componentRegistry[id]
}

export function listComponents(): KitComponent[] {
  return Object.values(componentRegistry)
}
