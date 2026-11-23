// Copies the web build of OpenUML (out/web, from `npm run build:web` at the repository root) to
// public/app, so the site serves it at /app/, and gives its page what search engines and link
// previews read: a title, the canonical address and the share tags of the rest of the site. Only
// <title>, <meta> and <link>: nothing that runs, so the page's Content-Security-Policy is untouched.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../../out/web', import.meta.url))
const to = fileURLToPath(new URL('../public/app', import.meta.url))
if (!existsSync(`${from}/index.html`)) {
  console.error('out/web is missing: run `npm run build:web` at the repository root first.')
  process.exit(1)
}
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })

const URL_ = 'https://openuml.org/app/'
const IMAGE = 'https://openuml.org/og.jpg'
const TITLE = 'OpenUML in your browser: free online UML editor'
const DESCRIPTION =
  'Use OpenUML, a free, open-source UML and IDEF0 editor, in your browser with nothing to install. Your .mdj files stay on your computer.'
const IMAGE_ALT = 'OpenUML, a free UML, IDEF0 and RAD modeling tool, with a class diagram open'

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const meta = (key, name, content) => `    <meta ${key}="${name}" content="${escape(content)}" />`
const tags = [
  `    <title>${escape(TITLE)}</title>`,
  meta('name', 'description', DESCRIPTION),
  `    <link rel="canonical" href="${URL_}" />`,
  meta('property', 'og:title', TITLE),
  meta('property', 'og:description', DESCRIPTION),
  meta('property', 'og:type', 'website'),
  meta('property', 'og:url', URL_),
  meta('property', 'og:site_name', 'OpenUML'),
  meta('property', 'og:locale', 'en'),
  meta('property', 'og:image', IMAGE),
  meta('property', 'og:image:width', '1200'),
  meta('property', 'og:image:height', '630'),
  meta('property', 'og:image:alt', IMAGE_ALT),
  meta('name', 'twitter:card', 'summary_large_image'),
  meta('name', 'twitter:image', IMAGE),
  meta('name', 'twitter:image:alt', IMAGE_ALT)
].join('\n')

// The app's own title and description are replaced; a page without them is a changed build: stop.
const page = `${to}/index.html`
const html = readFileSync(page, 'utf8')
const own = [/^ *<meta name="description"[^>]*>\n/m, /^ *<title>[^<]*<\/title>\n/m]
if (!own.every((re) => re.test(html))) {
  console.error('out/web/index.html has no <title> or description to replace: update scripts/copy-app.mjs.')
  process.exit(1)
}
const bare = own.reduce((s, re) => s.replace(re, ''), html)
writeFileSync(page, bare.replace(/\n *<\/head>/, `\n${tags}\n  </head>`))
console.log('Copied the web app to public/app')
