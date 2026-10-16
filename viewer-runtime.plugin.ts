/** Vite plugin shared by electron.vite.config.ts (app build) and vitest.config.ts (tests). */
import { resolve } from 'node:path'
import { build, type Plugin, type Rollup } from 'vite'

/**
 * `virtual:openuml-viewer`: the website viewer runtime (`src/viewer/main.ts`) bundled into one
 * minified script and exported as a string, which File > Export Interactive Website inlines into
 * the page it writes.
 */
export function viewerRuntime(): Plugin {
  const id = 'virtual:openuml-viewer'
  const resolved = `\0${id}`
  const entry = resolve(__dirname, 'src/viewer/main.ts')
  return {
    name: 'openuml-viewer-runtime',
    resolveId: (source) => (source === id ? resolved : undefined),
    async load(source) {
      if (source !== resolved) return undefined
      const result = await build({
        configFile: false,
        logLevel: 'warn',
        build: {
          write: false,
          minify: true,
          target: 'es2020',
          lib: { entry, formats: ['iife'], name: 'OpenUMLViewer', fileName: () => 'viewer.js' }
        }
      })
      const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
      const chunk = output.output.find((o): o is Rollup.OutputChunk => o.type === 'chunk')
      if (!chunk) throw new Error('The viewer runtime produced no code')
      for (const file of chunk.moduleIds) if (!file.startsWith('\0')) this.addWatchFile(file)
      return `export default ${JSON.stringify(chunk.code)}`
    }
  }
}
