import { describe, expect, it } from 'vitest'
import { rowSlots, scrollToReveal, visibleRows } from './virtualRows'

describe('visibleRows', () => {
  it('covers the viewport plus the overscan, clamped to the list', () => {
    expect(visibleRows(1000, 20, 0, 200, 5)).toEqual({ start: 0, end: 15 })
    expect(visibleRows(1000, 20, 400, 200, 5)).toEqual({ start: 15, end: 35 })
    expect(visibleRows(1000, 20, 19_900, 200, 5)).toEqual({ start: 990, end: 1000 })
    expect(visibleRows(10, 20, 0, 1000, 5)).toEqual({ start: 0, end: 10 })
  })

  it('renders something sensible before the viewport is measured and for empty lists', () => {
    expect(visibleRows(0, 20, 0, 200)).toEqual({ start: 0, end: 0 })
    expect(visibleRows(1000, 20, 0, 0)).toEqual({ start: 0, end: 60 })
    expect(visibleRows(5, 0, 0, 200)).toEqual({ start: 0, end: 5 })
  })

  it('keeps at least one row when scrolled past the end (list shrank)', () => {
    expect(visibleRows(3, 20, 5000, 200, 2)).toEqual({ start: 2, end: 3 })
  })
})

describe('scrollToReveal', () => {
  it('scrolls the least needed to show a row fully', () => {
    expect(scrollToReveal(5, 20, 0, 200)).toBe(0)
    expect(scrollToReveal(10, 20, 0, 200)).toBe(20)
    expect(scrollToReveal(2, 20, 100, 200)).toBe(40)
    expect(scrollToReveal(2, 20, 100, 200, 2)).toBe(42)
  })
})

describe('rowSlots', () => {
  it('renders the window with spacers around it', () => {
    expect(rowSlots(10, { start: 3, end: 5 })).toEqual([
      { kind: 'gap', rows: 3 },
      { kind: 'row', index: 3 },
      { kind: 'row', index: 4 },
      { kind: 'gap', rows: 5 }
    ])
    expect(rowSlots(2, { start: 0, end: 2 }, 1)).toEqual([
      { kind: 'row', index: 0 },
      { kind: 'row', index: 1 }
    ])
    expect(rowSlots(0, { start: 0, end: 0 }, 0)).toEqual([])
  })

  it('keeps the focused row rendered in its place when it is scrolled out of the window', () => {
    // Scrolled down past the focused row 1.
    expect(rowSlots(100, { start: 40, end: 42 }, 1)).toEqual([
      { kind: 'gap', rows: 1 },
      { kind: 'row', index: 1 },
      { kind: 'gap', rows: 38 },
      { kind: 'row', index: 40 },
      { kind: 'row', index: 41 },
      { kind: 'gap', rows: 58 }
    ])
    // Scrolled up above the focused last row.
    expect(rowSlots(100, { start: 0, end: 2 }, 99)).toEqual([
      { kind: 'row', index: 0 },
      { kind: 'row', index: 1 },
      { kind: 'gap', rows: 97 },
      { kind: 'row', index: 99 }
    ])
    // The slots always add up to every row exactly once.
    const total = (slots: ReturnType<typeof rowSlots>): number => slots.reduce((n, s) => n + (s.kind === 'gap' ? s.rows : 1), 0)
    for (const pinned of [null, 0, 5, 50, 99, 150]) expect(total(rowSlots(100, { start: 10, end: 30 }, pinned))).toBe(100)
  })
})
