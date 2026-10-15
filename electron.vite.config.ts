import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { viewerRuntime } from './viewer-runtime.plugin'

/**
 * The Vite dev server injects CSS as <style> elements, which the production Content Security
 * Policy (src/renderer/index.html) blocks. Development builds only allow inline styles.
 */
function devInlineStyles(): Plugin {
  return {
    name: 'openuml-dev-inline-styles',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), devInlineStyles(), viewerRuntime()],
    // electron-vite leaves the renderer unminified by default: ~2.2 MB of JS to load and compile
    // at every start instead of ~1 MB.
    build: { minify: true }
  }
})
