/**
 * Temporary highlight of views (Model Explorer > Highlight): the views pulse in red for
 * `HIGHLIGHT_MS`, then the highlight clears itself. Editors subscribe to draw it.
 */

export const HIGHLIGHT_MS = 2000

interface Highlight {
  readonly viewIds: readonly string[]
  readonly until: number
}

let current: Highlight | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Pulses `viewIds` for `HIGHLIGHT_MS`; a new request replaces the previous one. */
export function highlightViews(viewIds: readonly string[], now = Date.now()): void {
  if (timer) clearTimeout(timer)
  current = viewIds.length > 0 ? { viewIds: [...viewIds], until: now + HIGHLIGHT_MS } : null
  timer = current
    ? setTimeout(() => {
        current = null
        timer = null
        notify()
      }, HIGHLIGHT_MS)
    : null
  notify()
}

/** The view ids currently highlighted (empty when none). */
export function highlightedViewIds(): readonly string[] {
  return current?.viewIds ?? NONE
}

export function subscribeHighlight(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const NONE: readonly string[] = []
