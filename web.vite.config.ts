/**
 * The web build of OpenUML (`npm run build:web`): the desktop renderer with the browser bridge of
 * `src/web`, served from /app/ of the website. Output: out/web.
 */
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { version } from './package.json'
import { viewerRuntime } from './viewer-runtime.plugin'

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: '/app/',
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react(), viewerRuntime()],
  define: { __OPENUML_VERSION__: JSON.stringify(version) },
  server: { fs: { allow: [__dirname] } },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true, minify: true, target: 'es2022', chunkSizeWarningLimit: 1600 }
})
