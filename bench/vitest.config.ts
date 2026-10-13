import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** Benchmarks (bench/*.perf.ts), kept out of `npm test`: `npx vitest run -c bench/vitest.config.ts`. */
export default defineConfig({
  root: resolve(__dirname, '..'),
  resolve: { alias: { '@': resolve(__dirname, '../src/renderer/src') } },
  test: { include: ['bench/**/*.perf.ts'], environment: 'node', testTimeout: 120_000 }
})
