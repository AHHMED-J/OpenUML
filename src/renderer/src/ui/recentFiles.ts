/** Most-recently-used file list (pure helpers; persistence lives in `uiStore`). */

export const MAX_RECENT_FILES = 10

/** Puts `path` at the top, removing duplicates, keeping at most `max` entries. */
export function addRecentFile(list: readonly string[], path: string, max = MAX_RECENT_FILES): string[] {
  if (!path) return [...list].slice(0, max)
  return [path, ...list.filter((p) => p !== path)].slice(0, max)
}

export function removeRecentFile(list: readonly string[], path: string): string[] {
  return list.filter((p) => p !== path)
}

/** Validates a persisted value: an array of non-empty strings, deduplicated and capped. */
export function sanitizeRecentFiles(value: unknown, max = MAX_RECENT_FILES): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !result.includes(item)) result.push(item)
    if (result.length >= max) break
  }
  return result
}

/** Last path segment, for menu labels and titles. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}
