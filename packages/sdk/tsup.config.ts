import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/chains.ts', 'src/abi.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
})
