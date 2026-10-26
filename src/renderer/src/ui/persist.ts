/**
 * Per-viewer persistence in `localStorage`. Storage may be unavailable (private mode, tests,
 * blocked site data), so every access is wrapped and falls back to defaults.
 */

const PREFIX = 'openuml.'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Reads and JSON-parses `key`; returns `fallback` when missing, unreadable or malformed. */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const text = storage()?.getItem(PREFIX + key)
    return text == null ? fallback : (JSON.parse(text) as T)
  } catch {
    return fallback
  }
}

/** True when this profile already stored something (so it is not a first run of the app). */
export function hasStoredData(): boolean {
  try {
    const s = storage()
    if (!s) return false
    for (let i = 0; i < s.length; i++) if (s.key(i)?.startsWith(PREFIX)) return true
    return false
  } catch {
    return false
  }
}

/** JSON-serializes `value` under `key`; failures are ignored. */
export function saveJson(key: string, value: unknown): void {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: preferences simply do not persist.
  }
}
