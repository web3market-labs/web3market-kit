import { describe, it, expect, vi } from 'vitest'
import { chatCommand } from '../chat.js'

// Mock the dynamic import to avoid loading the full chat module
vi.mock('../../ai/chat.js', () => ({
  runChatSession: vi.fn(),
}))

describe('chatCommand', () => {
  it('creates a command with name "chat"', () => {
    const cmd = chatCommand()
    expect(cmd.name()).toBe('chat')
  })

  it('has a description', () => {
    const cmd = chatCommand()
    expect(cmd.description()).toContain('AI chat')
  })

  it('has --no-anvil option', () => {
    const cmd = chatCommand()
    const opts = cmd.options
    const anvilOpt = opts.find((o) => o.long === '--no-anvil')
    expect(anvilOpt).toBeTruthy()
  })

  it('defaults anvil to true (--no-anvil is opt-out)', () => {
    const cmd = chatCommand()
    // When --no-anvil is not passed, opts.anvil should not be false
    // Commander handles --no-* flags by defaulting to true
    const opts = cmd.opts()
    // Default value should not be explicitly set (Commander handles the negation)
    expect(opts.anvil).not.toBe(false)
  })
})
