import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/ai/**', 'src/commands/chat.ts', 'src/utils/foundry.ts'],
    },
  },
})
