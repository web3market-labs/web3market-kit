import type { Abi, AbiEvent, AbiFunction } from 'viem'

type AbiErrorItem = Extract<Abi[number], { type: 'error' }>

export interface CategorizedAbi {
  reads: AbiFunction[]
  writes: AbiFunction[]
  events: AbiEvent[]
  errors: AbiErrorItem[]
}

export function categorizeAbi(abi: Abi): CategorizedAbi {
  const reads: AbiFunction[] = []
  const writes: AbiFunction[] = []
  const events: AbiEvent[] = []
  const errors: AbiErrorItem[] = []

  for (const item of abi) {
    switch (item.type) {
      case 'function': {
        if (item.stateMutability === 'view' || item.stateMutability === 'pure') {
          reads.push(item)
        } else {
          writes.push(item)
        }
        break
      }
      case 'event': {
        events.push(item)
        break
      }
      case 'error': {
        errors.push(item)
        break
      }
    }
  }

  return { reads, writes, events, errors }
}

export function getReadFunctions(abi: Abi): AbiFunction[] {
  return abi.filter(
    (item): item is AbiFunction =>
      item.type === 'function' &&
      (item.stateMutability === 'view' || item.stateMutability === 'pure')
  )
}

export function getWriteFunctions(abi: Abi): AbiFunction[] {
  return abi.filter(
    (item): item is AbiFunction =>
      item.type === 'function' &&
      (item.stateMutability === 'nonpayable' || item.stateMutability === 'payable')
  )
}

export function getEvents(abi: Abi): AbiEvent[] {
  return abi.filter((item): item is AbiEvent => item.type === 'event')
}

export function formatFunctionName(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .split('_')
    .filter(Boolean)

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}
