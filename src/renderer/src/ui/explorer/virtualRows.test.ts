import { describe, expect, it } from 'vitest'
import { scrollToReveal, visibleRows } from './virtualRows'

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
