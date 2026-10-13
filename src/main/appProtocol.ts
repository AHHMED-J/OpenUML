/**
 * The `app://openuml/` scheme that serves the packaged renderer. Loading the UI from a custom
 * scheme instead of `file://` lets the build turn off the extra privileges Electron grants to
 * `file://` pages (reading any local file with `fetch`), see the `grantFileProtocolExtraPrivileges`
 * fuse in package.json. Kept free of Electron so the path mapping can be unit tested.
 */
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'openuml'
/** Origin of the renderer in packaged builds. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`

/** File types the renderer bundle consists of; anything else under the folder is not served. */
const SERVED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.map'
])

/**
 * The file under `root` that an `app://openuml/...` request names, or null when the URL is not
 * ours, escapes `root` (`..`, encoded separators) or names a file type the bundle does not use.
 */
export function resolveAppAsset(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.includes('\\')) return null
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const file = normalize(join(root, pathname))
  const rel = relative(root, file)
  if (rel === '' || isAbsolute(rel) || rel.startsWith('..') || rel.split(sep).includes('..')) return null
  if (!SERVED_EXTENSIONS.has(extname(file).toLowerCase())) return null
  return file
}
