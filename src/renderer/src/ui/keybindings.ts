/**
 * Customized keyboard shortcuts (Keyboard Shortcuts dialog): per command, the list of keystrokes
 * the user chose replaces the default ones (an empty list removes them). Stored per viewer as
 * canonical descriptors (`cmd-shift-s`; see `keymap.ts`), never in the project.
 */
import { formatKeystroke, parseKeystroke, type KeyBinding, type Platform } from './keymap'

/** Command id → its keystrokes (canonical descriptors), replacing the defaults. */
export type KeybindingOverrides = Readonly<Record<string, readonly string[]>>

/** Most keystrokes kept for one command. */
const MAX_KEYS_PER_COMMAND = 4
const MAX_COMMANDS = 1000

/** The canonical descriptor of `descriptor`, or null when it is not a valid keystroke. */
function canonicalKeystroke(descriptor: string, platform: Platform): string | null {
  const k = parseKeystroke(descriptor, platform)
  return k ? formatKeystroke(k) : null
}

/** Valid overrides from stored (untrusted) data: canonical, unique, a few per command. */
export function sanitizeOverrides(value: unknown, platform: Platform): KeybindingOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string[]> = {}
  for (const [command, keys] of Object.entries(value as Record<string, unknown>).slice(0, MAX_COMMANDS)) {
    if (!command || command.length > 200 || !Array.isArray(keys)) continue
    const valid = keys.filter((k): k is string => typeof k === 'string').map((k) => canonicalKeystroke(k, platform))
    result[command] = [...new Set(valid.filter((k): k is string => k !== null))].slice(0, MAX_KEYS_PER_COMMAND)
  }
  return result
}

/**
 * The bindings in effect: the defaults of every command without overrides, then the overrides
 * (which win a keystroke shared with a default). An override keeps the context (`when`) and
 * arguments of the default binding with the same keystroke.
 */
export function effectiveBindings(defaults: readonly KeyBinding[], overrides: KeybindingOverrides, platform: Platform): KeyBinding[] {
  const out = defaults.filter((b) => !Object.hasOwn(overrides, b.command))
  for (const [command, keys] of Object.entries(overrides)) {
    for (const key of keys) {
      const original = defaults.find(
        (d) => d.command === command && (!d.platforms || d.platforms.includes(platform)) && canonicalKeystroke(d.key, platform) === key
      )
      out.push({ key, command, ...(original?.when ? { when: original.when } : {}), ...(original?.args !== undefined ? { args: original.args } : {}) })
    }
  }
  return out
}

/**
 * Overrides after giving `descriptor` to `command`: added to its keystrokes and, when another
 * command (`owner`) had it, taken from that one.
 */
export function assignKeystroke(
  overrides: KeybindingOverrides,
  current: (command: string) => readonly string[],
  command: string,
  descriptor: string,
  owner: string | null
): KeybindingOverrides {
  const next: Record<string, readonly string[]> = { ...overrides }
  if (owner && owner !== command) next[owner] = current(owner).filter((k) => k !== descriptor)
  next[command] = [...current(command).filter((k) => k !== descriptor), descriptor].slice(-MAX_KEYS_PER_COMMAND)
  return next
}

/** Overrides after removing `descriptor` from `command`. */
export function removeKeystroke(overrides: KeybindingOverrides, current: (command: string) => readonly string[], command: string, descriptor: string): KeybindingOverrides {
  return { ...overrides, [command]: current(command).filter((k) => k !== descriptor) }
}

/** Overrides with `command` back on its default keystrokes. */
export function resetKeystrokes(overrides: KeybindingOverrides, command: string): KeybindingOverrides {
  const next = { ...overrides }
  delete (next as Record<string, readonly string[]>)[command]
  return next
}
