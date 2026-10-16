/**
 * The single-file website: a static HTML page carrying the model digest as inert JSON and the
 * viewer runtime as one inline script. The Content Security Policy allows only that script (by
 * its hash), inline styles and data images: the page cannot load or send anything over the
 * network. Model text reaches the page only inside the JSON (escaped) and the escaped title.
 */
import type { WebsiteDigest } from '../../../shared/website'

/** Text for an HTML text node or attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * JSON safe inside `<script type="application/json">`: `<` (so no `</script>` or `<!--` can end
 * or change the block), and the line separators some parsers treat as line ends, are escaped.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/** Code safe inside a `<script>` element (a `</script` inside a string would end it). */
function scriptCode(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1')
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** The page for `digest`, running `runtime` (the bundled viewer, `src/viewer`). */
export async function websiteHtml(digest: WebsiteDigest, runtime: string): Promise<string> {
  const code = scriptCode(runtime)
  const hash = await sha256Base64(code)
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="generator" content="${escapeHtml(digest.generator)}">
<title>${escapeHtml(digest.title)}</title>
</head>
<body>
<noscript>This model viewer needs JavaScript. It runs entirely in your browser and loads nothing from the internet.</noscript>
<div id="openuml-viewer"></div>
<script type="application/json" id="openuml-data">${scriptJson(digest)}</script>
<script>${code}</script>
</body>
</html>
`
}
