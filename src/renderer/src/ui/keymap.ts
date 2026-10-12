/**
 * Keymaps: keystroke descriptors (`cmdctrl-shift-s`), parsing per platform, matching keyboard
 * events, and formatting for menus (Electron accelerators and display labels).
 *
 * Descriptor grammar: lowercase, `-` separated; modifiers `cmd`, `ctrl`, `alt`, `shift` (and the
 * portable `cmdctrl` = `cmd` on macOS, `ctrl` elsewhere), then one key name: `a`–`z`, `0`–`9`,
 * `f1`–`f12`, `up`/`down`/`left`/`right`, `delete`, `backspace`, `enter`, `esc`, `tab`, `space`,
 * `plus`, `minus`, `=`, `[`, `]`, `,`, `.`, `/`, `home`, `end`, `pageup`, `pagedown`.
 */

export type Platform = 'darwin' | 'win32' | 'linux' | string

export interface Keystroke {
  readonly cmd: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly key: string
}

const MODIFIERS = new Set(['cmd', 'ctrl', 'alt', 'shift', 'cmdctrl'])

/** Parses a descriptor; returns null when it is malformed. */
export function parseKeystroke(descriptor: string, platform: Platform): Keystroke | null {
  const text = descriptor.trim().toLowerCase()
  if (!text) return null
  // A trailing "-" means the key itself is "-" (e.g. "cmd--"); normalize it to "minus".
  const parts = text.endsWith('--') ? [...text.slice(0, -2).split('-'), 'minus'] : text.split('-')
  const key = parts.pop()
  if (!key || MODIFIERS.has(key)) return null
  let cmd = false
  let ctrl = false
  let alt = false
  let shift = false
  for (const part of parts) {
    switch (part) {
      case 'cmd':
        cmd = true
        break
      case 'ctrl':
        ctrl = true
        break
      case 'cmdctrl':
        if (platform === 'darwin') cmd = true
        else ctrl = true
        break
      case 'alt':
        alt = true
        break
      case 'shift':
        shift = true
        break
      default:
        return null
    }
  }
  return { cmd, ctrl, alt, shift, key: normalizeKeyName(key) }
}

function normalizeKeyName(key: string): string {
  switch (key) {
    case 'escape':
      return 'esc'
    case 'return':
      return 'enter'
    case 'del':
      return 'delete'
    case '-':
      return 'minus'
    case '+':
      return 'plus'
    default:
      return key
  }
}

/** Canonical descriptor: modifiers in the order cmd, ctrl, alt, shift. */
export function formatKeystroke(k: Keystroke): string {
  return [k.cmd && 'cmd', k.ctrl && 'ctrl', k.alt && 'alt', k.shift && 'shift', k.key].filter(Boolean).join('-')
}

/** Minimal shape of a DOM keyboard event, so the matcher is testable without a DOM. */
export interface KeyEventLike {
  readonly key: string
  readonly code?: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: 'minus',
  NumpadSubtract: 'minus',
  NumpadAdd: 'plus',
  Equal: '=',
  Backquote: '`',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\'
}

const NAMED_KEYS: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'esc',
  Esc: 'esc',
  Enter: 'enter',
  Tab: 'tab',
  Delete: 'delete',
  Backspace: 'backspace',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ' ': 'space',
  Spacebar: 'space'
}

/**
 * Converts a keyboard event to a keystroke. Letters, digits and punctuation use the physical
 * `code` (so Shift/Alt do not change the key name); `=` with Shift becomes `plus`.
 * Returns null for lone modifier presses.
 */
export function keystrokeFromEvent(e: KeyEventLike): Keystroke | null {
  if (['Meta', 'Control', 'Alt', 'Shift', 'OS', 'AltGraph', 'CapsLock'].includes(e.key)) return null
  let key: string | undefined
  let shift = e.shiftKey
  const code = e.code ?? ''
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase()
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^Numpad[0-9]$/.test(code)) key = code.slice(6)
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code.toLowerCase()
  else if (code in CODE_KEYS) key = CODE_KEYS[code]
  if (key === '=' && shift) {
    key = 'plus'
    shift = false
  }
  if (key === undefined) key = NAMED_KEYS[e.key]
  if (key === undefined) {
    if (/^F([1-9]|1[0-2])$/.test(e.key)) key = e.key.toLowerCase()
    else if (e.key.length === 1) key = normalizeKeyName(e.key.toLowerCase())
    else return null
  }
  return { cmd: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift, key }
}

export function eventToDescriptor(e: KeyEventLike): string | null {
  const k = keystrokeFromEvent(e)
  return k ? formatKeystroke(k) : null
}

// ---------------------------------------------------------------------------------------------
// Keymap

export interface KeyBinding {
  /** Descriptor, e.g. `cmdctrl-s`. */
  readonly key: string
  readonly command: string
  /** Optional JSON-serializable argument passed to the command. */
  readonly args?: unknown
  /** Restrict to platforms (default: all). */
  readonly platforms?: readonly Platform[]
}

export interface ResolvedBinding {
  readonly descriptor: string
  readonly command: string
  readonly args?: unknown
}

export class Keymap {
  private readonly byKey = new Map<string, ResolvedBinding>()
  /** First (primary) descriptor per command, for menu accelerators and the palette. */
  private readonly byCommand = new Map<string, string>()
  readonly warnings: string[] = []

  constructor(
    readonly platform: Platform,
    bindings: readonly KeyBinding[] = []
  ) {
    this.addAll(bindings)
  }

  /** Adds bindings; a later binding for the same keystroke overrides the earlier one (with a warning). */
  addAll(bindings: readonly KeyBinding[]): void {
    for (const b of bindings) {
      if (b.platforms && !b.platforms.includes(this.platform)) continue
      const k = parseKeystroke(b.key, this.platform)
      if (!k) {
        this.warnings.push(`Invalid keystroke "${b.key}" for ${b.command}`)
        continue
      }
      const descriptor = formatKeystroke(k)
      const existing = this.byKey.get(descriptor)
      if (existing && existing.command !== b.command) {
        this.warnings.push(`Keystroke ${descriptor}: ${b.command} overrides ${existing.command}`)
        if (this.byCommand.get(existing.command) === descriptor) this.byCommand.delete(existing.command)
      }
      this.byKey.set(descriptor, { descriptor, command: b.command, args: b.args })
      if (!this.byCommand.has(b.command)) this.byCommand.set(b.command, descriptor)
    }
  }

  /** The binding for a descriptor (already canonical) or keyboard event. */
  match(input: string | KeyEventLike): ResolvedBinding | undefined {
    const descriptor = typeof input === 'string' ? input : eventToDescriptor(input)
    return descriptor ? this.byKey.get(descriptor) : undefined
  }

  /** Primary descriptor bound to `command`, if any. */
  keystrokeFor(command: string): string | undefined {
    return this.byCommand.get(command)
  }

  bindings(): ResolvedBinding[] {
    return [...this.byKey.values()]
  }
}

// ---------------------------------------------------------------------------------------------
// Formatting

const ACCELERATOR_KEYS: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  delete: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  esc: 'Esc',
  tab: 'Tab',
  space: 'Space',
  plus: 'Plus',
  minus: '-',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

function acceleratorKey(key: string): string {
  return ACCELERATOR_KEYS[key] ?? (/^f\d+$/.test(key) ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key)
}

/** Electron accelerator string for a canonical descriptor (e.g. `Cmd+Shift+S`). */
export function toAccelerator(descriptor: string, platform: Platform): string | undefined {
  const k = parseKeystroke(descriptor, platform)
  if (!k) return undefined
  const parts: string[] = []
  if (k.cmd) parts.push(platform === 'darwin' ? 'Cmd' : 'Super')
  if (k.ctrl) parts.push('Ctrl')
  if (k.alt) parts.push('Alt')
  if (k.shift) parts.push('Shift')
  parts.push(acceleratorKey(k.key))
  return parts.join('+')
}

const MAC_KEYS: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  delete: '⌦',
  backspace: '⌫',
  enter: '↩',
  esc: '⎋',
  tab: '⇥',
  space: 'Space',
  plus: '+',
  minus: '-'
}

/** Human label: `⌘⇧S` on macOS, `Ctrl+Shift+S` elsewhere. */
export function displayKeystroke(descriptor: string, platform: Platform): string {
  const k = parseKeystroke(descriptor, platform)
  if (!k) return descriptor
  if (platform === 'darwin') {
    const key = MAC_KEYS[k.key] ?? acceleratorKey(k.key)
    return `${k.ctrl ? '⌃' : ''}${k.alt ? '⌥' : ''}${k.shift ? '⇧' : ''}${k.cmd ? '⌘' : ''}${key}`
  }
  const key = k.key === 'delete' ? 'Del' : k.key === 'minus' ? '-' : k.key === 'plus' ? '+' : acceleratorKey(k.key)
  return [k.ctrl && 'Ctrl', k.cmd && 'Win', k.alt && 'Alt', k.shift && 'Shift', key].filter(Boolean).join('+')
}

/** True for keystrokes that a focused text field must keep (native editing). */
export function isNativeEditKeystroke(descriptor: string, platform: Platform): boolean {
  const k = parseKeystroke(descriptor, platform)
  if (!k) return false
  const mod = platform === 'darwin' ? k.cmd : k.ctrl
  if (!mod && !k.alt && ['delete', 'backspace', 'left', 'right', 'up', 'down', 'home', 'end', 'enter', 'tab', 'space'].includes(k.key)) {
    return true
  }
  if (mod && !k.alt && !k.shift && ['c', 'x', 'v', 'z', 'y', 'a'].includes(k.key)) return true
  if (mod && !k.alt && k.shift && k.key === 'z') return true
  // Plain characters typed into the field.
  if (!mod && !k.ctrl && !k.cmd && k.key.length === 1) return true
  return false
}

export interface KeyDispatchContext {
  /** Keyboard focus is in an editable text control. */
  readonly textFocused: boolean
  /** Commands that a focused text field must not trigger with an unmodified key (e.g. Esc → Select tool). */
  readonly textBlockedCommands?: ReadonlySet<string>
}

/**
 * The binding the window-level keyboard dispatcher runs for a keystroke, or undefined to leave the
 * key alone. Native edit keys stay with a focused text field; otherwise text fields only see
 * modified shortcuts. Keys that the native menu also registers as accelerators are dispatched here
 * too: the dispatcher prevents the default, so the menu (which only receives keys the page did not
 * handle) never runs them twice, and they work wherever the page has focus.
 */
export function bindingToDispatch(
  keymap: Keymap,
  descriptor: string,
  ctx: KeyDispatchContext
): ResolvedBinding | undefined {
  if (ctx.textFocused && isNativeEditKeystroke(descriptor, keymap.platform)) return undefined
  const binding = keymap.match(descriptor)
  if (!binding) return undefined
  if (ctx.textFocused && (ctx.textBlockedCommands?.has(binding.command) || !/^(cmd|ctrl|alt)-/.test(descriptor))) return undefined
  return binding
}
