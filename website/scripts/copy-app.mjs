// Copies the web build of OpenUML (out/web, from `npm run build:web` at the repository root) to
// public/app, so the site serves it at /app/.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../out/web', import.meta.url))
const to = fileURLToPath(new URL('../public/app', import.meta.url))
if (!existsSync(`${from}/index.html`)) {
  console.error('out/web is missing: run `npm run build:web` at the repository root first.')
  process.exit(1)
}
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
console.log('Copied the web app to public/app')
