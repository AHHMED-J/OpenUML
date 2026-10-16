import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { viewerRuntime } from './viewer-runtime.plugin'

export default defineConfig({
  plugins: [viewerRuntime()],
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], environment: 'node' }
})
