import { describe, expect, it } from 'vitest'
import { rect } from './geometry'
import { GRID, ZOOM } from './style'
import {
  canvasExtent,
  fitWidthZoom,
  longCanvasExtent,
  LONG_CANVAS_MIN_OPEN_ZOOM,
  clampZoom,
  exportBounds,
  gridLineSpacing,
  sanitizeGridSize,
  snap,
  snapPoint,
  snapWithDeadZone,
  stepZoom
} from './viewport'

describe('snapping', () => {
  it('rounds to the grid by default and floors on request', () => {
    expect(GRID.size).toBe(8)
    expect(snap(11)).toBe(8)
    expect(snap(12)).toBe(16)
    expect(snap(15, 8, 'floor')).toBe(8)
    expect(snap(-3, 8, 'floor')).toBe(-8)
    expect(snap(-3)).toBe(0)
    expect(Object.is(snap(-3), -0)).toBe(false)
    expect(snap(13, 1)).toBe(13)
    expect(snapPoint({ x: 3, y: 21 })).toEqual({ x: 0, y: 24 })
  })

  it('keeps the original coordinate within the dead zone', () => {
    expect(snapWithDeadZone(100, 105)).toBe(100)
    expect(snapWithDeadZone(100, 93)).toBe(100)
    expect(snapWithDeadZone(100, 109)).toBe(112)
  })
})

describe('zoom and transform', () => {
  it('clamps and steps zoom without drift', () => {
    expect(ZOOM.min).toBe(0.1)
    expect(ZOOM.max).toBe(3)
    expect(clampZoom(5)).toBe(3)
    expect(clampZoom(0.01)).toBe(0.1)
    expect(clampZoom(Number.NaN)).toBe(1)
    let z = 1
    for (let i = 0; i < 7; i++) z = stepZoom(z, 1)
    expect(z).toBe(1.7)
    expect(stepZoom(0.1, -1)).toBe(0.1)
    expect(stepZoom(3, 1)).toBe(3)
  })

  it('accepts whole grid sizes from 2 to 64 and falls back to the default otherwise', () => {
    expect([2, 16, 64, 12.4].map(sanitizeGridSize)).toEqual([2, 16, 64, 12])
    expect([1, 65, 0, -8, Number.NaN, '16', null].map(sanitizeGridSize)).toEqual(Array(7).fill(GRID.size))
  })

  it('draws grid lines every 2 grid steps, never closer than 8 units', () => {
    expect(gridLineSpacing(8)).toBe(16)
    expect(gridLineSpacing(20)).toBe(40)
    expect(gridLineSpacing(2)).toBe(8)
    expect(gridLineSpacing(64)).toBe(128)
  })

  it('computes export bounds with a 10-unit margin', () => {
    expect(exportBounds([rect(10, 10, 20, 20), rect(50, 0, 10, 10)])).toEqual(rect(0, -10, 70, 50))
    expect(exportBounds([])).toBeNull()
  })
})

describe('canvasExtent', () => {
  it('is exactly the viewport when the content fits (no scrollbars, e.g. after fit to window)', () => {
    expect(canvasExtent(700, 1000, 1)).toBe(1000)
    // Fit zoom for a 1500-wide content in 1000 px: (1000 - 20) / (1500 + 10).
    const z = clampZoom((1000 - 20) / 1510)
    expect(canvasExtent(1500, 1000, z) * z).toBeLessThanOrEqual(1000 + 1e-9)
  })

  it('adds scroll room beyond content that does not fit', () => {
    expect(canvasExtent(1500, 1000, 1)).toBe(1900)
    expect(canvasExtent(100, 0, 1)).toBe(500)
  })
})

describe('longCanvasExtent (RAD)', () => {
  it('is at least three screens tall, at any zoom, for a new diagram', () => {
    expect(longCanvasExtent(0, 800, 1)).toBe(2400)
    // Three screens of 800 px at 50% are 4800 diagram units: still three screens on screen.
    expect(longCanvasExtent(0, 800, 0.5) * 0.5).toBe(2400)
  })

  it('always keeps 600 screen pixels below the content', () => {
    expect(longCanvasExtent(5000, 800, 1)).toBe(5600)
    expect((longCanvasExtent(5000, 800, 0.5) - 5000) * 0.5).toBe(600)
    expect((longCanvasExtent(5000, 800, 2) - 5000) * 2).toBeGreaterThanOrEqual(600)
  })
})

describe('fitWidthZoom', () => {
  it('fits the content width into the viewport, never above 100%', () => {
    expect(fitWidthZoom(1500, 1000)).toBeCloseTo(980 / 1510, 10)
    expect(fitWidthZoom(300, 1000)).toBe(1)
  })

  it('opens a long canvas no smaller than a readable zoom; wider content scrolls sideways', () => {
    // 1500 wide in 1000 px would fit at 65%: the RAD opens at 80% instead.
    expect(fitWidthZoom(1500, 1000, LONG_CANVAS_MIN_OPEN_ZOOM)).toBe(0.8)
    // Content that fits between 80% and 100% still fits its width.
    expect(fitWidthZoom(1100, 1000, LONG_CANVAS_MIN_OPEN_ZOOM)).toBeCloseTo(980 / 1110, 10)
    expect(fitWidthZoom(300, 1000, LONG_CANVAS_MIN_OPEN_ZOOM)).toBe(1)
  })
})
