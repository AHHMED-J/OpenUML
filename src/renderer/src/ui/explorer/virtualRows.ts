/**
 * Row virtualization for fixed-height lists (the Model Explorer): only the rows in or near the
 * viewport are rendered, with spacers standing in for the others, so a tree of thousands of rows
 * re-renders in time proportional to the viewport rather than to the tree.
 */

/** Rows rendered beyond each edge of the viewport (smooth scrolling, keyboard steps). */
const OVERSCAN = 12

/** Rows rendered before the viewport size is known. */
const INITIAL_ROWS = 60

export interface RowWindow {
  /** First rendered row index. */
  readonly start: number
  /** One past the last rendered row index. */
  readonly end: number
}

/** The rows to render for a scroll position (`scrollTop` relative to the first row). */
export function visibleRows(count: number, rowHeight: number, scrollTop: number, viewportHeight: number, overscan = OVERSCAN): RowWindow {
  if (count === 0) return { start: 0, end: 0 }
  if (rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: Math.min(count, INITIAL_ROWS) }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight)
  const start = Math.max(0, Math.min(count - 1, first - overscan))
  return { start, end: Math.max(start + 1, Math.min(count, last + overscan)) }
}

/**
 * The scroll position that brings row `index` fully into view with the least movement (the
 * current one when it already is). `offset` is the space above the first row.
 */
export function scrollToReveal(index: number, rowHeight: number, scrollTop: number, viewportHeight: number, offset = 0): number {
  const top = offset + index * rowHeight
  const bottom = top + rowHeight
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight)
  return scrollTop
}

/** A rendered row, or a spacer standing in for `rows` rows that are not rendered. */
export type RowSlot = { readonly kind: 'row'; readonly index: number } | { readonly kind: 'gap'; readonly rows: number }

/**
 * What to render for `count` rows: the rows of `window` plus row `pinned` wherever it is (the
 * focused row: it is the tree's `aria-activedescendant`, so it must stay in the document even when
 * scrolled out of view), with spacers for the rows in between.
 */
export function rowSlots(count: number, window: RowWindow, pinned: number | null = null): RowSlot[] {
  const indices: number[] = []
  const extra = pinned !== null && pinned >= 0 && pinned < count && (pinned < window.start || pinned >= window.end) ? pinned : null
  if (extra !== null && extra < window.start) indices.push(extra)
  for (let i = window.start; i < Math.min(window.end, count); i++) indices.push(i)
  if (extra !== null && extra >= window.end) indices.push(extra)
  const slots: RowSlot[] = []
  let next = 0
  for (const index of indices) {
    if (index > next) slots.push({ kind: 'gap', rows: index - next })
    slots.push({ kind: 'row', index })
    next = index + 1
  }
  if (count > next) slots.push({ kind: 'gap', rows: count - next })
  return slots
}
