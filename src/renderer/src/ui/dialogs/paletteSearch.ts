/** Command palette ranking (pure): fuzzy subsequence match, most-recently-used first. */

export interface PaletteEntry {
  readonly id: string
  readonly title: string
}

/**
 * Scores `text` against `query`: substring matches beat subsequence matches; earlier and
 * word-start matches score higher. Returns null when `query` is not a subsequence of `text`.
 */
export function fuzzyScore(text: string, query: string): number | null {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const sub = t.indexOf(q)
  if (sub >= 0) return 1000 - sub + (sub === 0 || /\W/.test(t[sub - 1] ?? '') ? 100 : 0)
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found < 0) return null
    score += found === prev + 1 ? 5 : 1
    if (found === 0 || /\W/.test(t[found - 1] ?? '')) score += 3
    prev = found
    ti = found + 1
  }
  return score
}

/** Filters and orders entries: by score; with an empty query, MRU entries first then title order. */
export function rankEntries<T extends PaletteEntry>(entries: readonly T[], query: string, mru: readonly string[]): T[] {
  const mruRank = (id: string): number => {
    const i = mru.indexOf(id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const scored: Array<{ entry: T; score: number }> = []
  for (const entry of entries) {
    const score = Math.max(fuzzyScore(entry.title, query) ?? -1, fuzzyScore(entry.id, query) ?? -1)
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => {
    if (query.trim() && a.score !== b.score) return b.score - a.score
    const m = mruRank(a.entry.id) - mruRank(b.entry.id)
    if (m !== 0) return m
    return a.entry.title.localeCompare(b.entry.title)
  })
  return scored.map((s) => s.entry)
}
