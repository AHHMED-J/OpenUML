/**
 * Runtime validation of what the renderer sends to the main process. The renderer shows content
 * from untrusted files, so the main process treats every IPC argument as untrusted input: wrong
 * types are rejected, sizes are bounded, and only known values reach Electron APIs.
 * Kept free of Electron so it can be unit tested.
 */
import { extname, posix, resolve, win32 } from 'node:path'
import type { FileFilter, MenuItemSpec } from '../shared/ipc'

/** Longest path accepted from the renderer, the command line or the OS. */
export const MAX_PATH_LENGTH = 4096
const MAX_LABEL = 200
const MAX_COMMAND = 200
const MAX_ACCELERATOR = 64
const MAX_MENU_DEPTH = 8
const MAX_MENU_ITEMS = 5000
const MAX_MESSAGE = 10_000
const MAX_BUTTONS = 8
const MAX_TITLE = 500

/**
 * Menu roles the renderer may use. Roles that reload the page or open the developer tools are
 * left out: the main process adds those itself, in development builds only.
 */
const MENU_ROLES: ReadonlySet<string> = new Set([
  'about',
  'services',
  'hide',
  'hideOthers',
  'unhide',
  'quit',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'pasteAndMatchStyle',
  'delete',
  'selectAll',
  'minimize',
  'zoom',
  'close',
  'togglefullscreen',
  'front',
  'window',
  'windowMenu',
  'appMenu',
  'fileMenu',
  'editMenu',
  'viewMenu',
  'help'
])

const MENU_TYPES: ReadonlySet<string> = new Set(['normal', 'separator', 'checkbox', 'submenu'])
const MESSAGE_TYPES: ReadonlySet<string> = new Set(['none', 'info', 'warning', 'question'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * A clean copy of a renderer menu: unknown keys dropped, strings bounded, roles from the
 * allowlist only, nesting and item count limited. Invalid items are skipped.
 */
export function sanitizeMenu(items: unknown): MenuItemSpec[] {
  let budget = MAX_MENU_ITEMS
  const visit = (list: unknown, depth: number): MenuItemSpec[] => {
    if (!Array.isArray(list) || depth > MAX_MENU_DEPTH) return []
    const out: MenuItemSpec[] = []
    for (const raw of list) {
      if (budget-- <= 0) break
      if (!isRecord(raw)) continue
      const item: MenuItemSpec = {}
      const label = boundedString(raw['label'], MAX_LABEL)
      if (label !== undefined) item.label = label
      const command = boundedString(raw['command'], MAX_COMMAND)
      if (command !== undefined) item.command = command
      const accelerator = raw['accelerator']
      if (typeof accelerator === 'string' && accelerator.length <= MAX_ACCELERATOR) item.accelerator = accelerator
      const type = raw['type']
      if (typeof type === 'string' && MENU_TYPES.has(type)) item.type = type as MenuItemSpec['type']
      const role = raw['role']
      if (typeof role === 'string' && MENU_ROLES.has(role)) item.role = role
      else if (role !== undefined) continue // A disallowed role: drop the item rather than show a dead entry.
      const enabled = optionalBoolean(raw['enabled'])
      if (enabled !== undefined) item.enabled = enabled
      const checked = optionalBoolean(raw['checked'])
      if (checked !== undefined) item.checked = checked
      if (raw['submenu'] !== undefined) item.submenu = visit(raw['submenu'], depth + 1)
      out.push(item)
    }
    return out
  }
  return visit(items, 0)
}

export interface SafeMessageBoxOptions {
  message: string
  detail?: string
  buttons: string[]
  type?: 'none' | 'info' | 'warning' | 'question'
}

/** Only the message box options the app uses (no icons, checkboxes or signals), with bounded text. */
export function sanitizeMessageBox(options: unknown): SafeMessageBoxOptions | null {
  if (!isRecord(options)) return null
  const message = boundedString(options['message'], MAX_MESSAGE)
  if (message === undefined) return null
  const buttons = Array.isArray(options['buttons'])
    ? options['buttons'].filter((b): b is string => typeof b === 'string').slice(0, MAX_BUTTONS).map((b) => b.slice(0, MAX_LABEL))
    : []
  const out: SafeMessageBoxOptions = { message, buttons: buttons.length > 0 ? buttons : ['OK'] }
  const detail = boundedString(options['detail'], MAX_MESSAGE)
  if (detail !== undefined) out.detail = detail
  const type = options['type']
  if (typeof type === 'string' && MESSAGE_TYPES.has(type)) out.type = type as SafeMessageBoxOptions['type']
  return out
}

/** Dialog file filters: a bounded list of names and alphanumeric extensions (or `*`). */
export function sanitizeFilters(filters: unknown): FileFilter[] {
  if (!Array.isArray(filters)) return []
  const out: FileFilter[] = []
  for (const f of filters.slice(0, 20)) {
    if (!isRecord(f) || typeof f['name'] !== 'string' || !Array.isArray(f['extensions'])) continue
    const extensions = f['extensions']
      .filter((e): e is string => typeof e === 'string' && /^(\*|[a-z0-9]{1,16})$/i.test(e))
      .slice(0, 20)
    if (extensions.length > 0) out.push({ name: f['name'].slice(0, MAX_LABEL), extensions })
  }
  return out
}

/** A bounded single-line string for window titles and dialog titles. */
export function sanitizeTitle(value: unknown, fallback = 'OpenUML'): string {
  if (typeof value !== 'string') return fallback
  return value.replace(/[\r\n\0]/g, ' ').slice(0, MAX_TITLE)
}

/** A string usable as a file-system path: non-empty, bounded, absolute and without NUL bytes. */
export function isAbsolutePath(path: unknown, platform: NodeJS.Platform = process.platform): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH || path.includes('\0')) return false
  return platform === 'win32' ? win32.isAbsolute(path) : posix.isAbsolute(path)
}

/** An absolute path naming a `.mdj` project file. */
export function isProjectPath(path: unknown): path is string {
  return isAbsolutePath(path) && extname(path).toLowerCase() === '.mdj'
}

/**
 * The project file named on a command line (`argv[0]` is the executable), resolved against the
 * working directory of the process that received it. Switches (`-x`, `--x`, macOS `-psn_…`) are
 * skipped; only `.mdj` files are accepted.
 */
export function findFileArgument(argv: readonly unknown[], workingDirectory: string): string | null {
  for (const arg of argv.slice(1)) {
    if (typeof arg !== 'string' || arg.length === 0 || arg.length > MAX_PATH_LENGTH || arg.startsWith('-') || arg.includes('\0')) continue
    if (extname(arg).toLowerCase() !== '.mdj') continue
    return resolve(workingDirectory, arg)
  }
  return null
}

/**
 * Web pages the app may open in the user's browser: the project's own pages on GitHub (help,
 * issues). Anything else is refused, so a compromised renderer cannot use the browser to send
 * data elsewhere or launch other URL handlers.
 */
const EXTERNAL_URL_PREFIXES: readonly string[] = ['https://github.com/AHHMED-J/OpenUML']

/** The normalized URL when `url` may be opened externally, else null. */
export function allowedExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2048) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null
  const href = parsed.href
  for (const prefix of EXTERNAL_URL_PREFIXES) {
    const p = prefix.toLowerCase()
    const h = href.toLowerCase()
    // The prefix must end at a path, query or fragment boundary (not `OpenUML-evil`).
    if (h === p || h.startsWith(`${p}/`) || h.startsWith(`${p}#`) || h.startsWith(`${p}?`)) return href
  }
  return null
}
