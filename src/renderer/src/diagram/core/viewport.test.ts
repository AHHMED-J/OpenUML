import { describe, expect, it } from 'vitest'
import { rect } from './geometry'
import { GRID, ZOOM } from './style'
import {
  canvasExtent,
  clampOrigin,
  clampZoom,
  diagramToScreen,
  exportBounds,
  gridLines,
  screenToDiagram,
  snap,
  snapPoint,
  snapRect,
  snapWithDeadZone,
  stepZoom,
  zoomAt
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

  it('snaps both corners of a rect', () => {
    expect(snapRect(rect(3, 5, 30, 30))).toEqual(rect(0, 8, 32, 24))
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

  it('converts between diagram and screen space', () => {
    const vp = { origin: { x: -100, y: -50 }, zoom: 2 }
    const s = diagramToScreen({ x: 150, y: 75 }, vp)
    expect(s).toEqual({ x: 100, y: 50 })
    expect(screenToDiagram(s, vp)).toEqual({ x: 150, y: 75 })
    expect(clampOrigin({ x: 10, y: -5 })).toEqual({ x: 0, y: -5 })
  })

  it('zooms around a fixed screen point', () => {
    const vp = { origin: { x: -100, y: -100 }, zoom: 1 }
    const mouse = { x: 200, y: 100 }
    const before = screenToDiagram(mouse, vp)
    const after = zoomAt(vp, 2, mouse)
    expect(after.zoom).toBe(2)
    expect(screenToDiagram(mouse, after)).toEqual(before)
  })

  it('lists grid lines every 2 x grid size', () => {
    expect(gridLines(rect(0, 5, 40, 30))).toEqual({ xs: [0, 16, 32], ys: [16, 32] })
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
