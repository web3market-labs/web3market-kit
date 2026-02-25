import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CRED_DIR = join(homedir(), '.web3market')
const CRED_FILE = join(CRED_DIR, 'credentials.json')

export function readApiKey(): string | null {
  try {
    if (!existsSync(CRED_FILE)) return null
    const raw = readFileSync(CRED_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.apiKey) return parsed.apiKey
    return null
  } catch {
    return null
  }
}

export function writeApiKey(apiKey: string): void {
  mkdirSync(CRED_DIR, { recursive: true })
  writeFileSync(CRED_FILE, JSON.stringify({ apiKey }, null, 2), 'utf-8')
}

export function clearApiKey(): void {
  try {
    if (existsSync(CRED_FILE)) {
      unlinkSync(CRED_FILE)
    }
  } catch {
    // ignore
  }
}
