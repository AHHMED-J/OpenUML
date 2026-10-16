import { describe, expect, it } from 'vitest'
import { FIT_MAX_SCALE, fitCamera, interpolate, MAX_SCALE, panBy, toDiagram, viewBoxOf, zoomAround } from './camera'

const VIEWPORT = { width: 800, height: 600 }

describe('viewer camera', () => {
  it('fits bounds in the viewport with padding, centered', () => {
    const cam = fitCamera({ left: 100, top: 50, width: 1000, height: 500 }, VIEWPORT, 0)
    expect(cam).toEqual({ cx: 600, cy: 300, scale: 0.8 })
    expect(viewBoxOf(cam, VIEWPORT)).toEqual([100, -75, 1000, 750])
    // A small diagram is not blown up: fitting stops at 2x unless a larger limit is asked for.
    expect(fitCamera({ left: 0, top: 0, width: 10, height: 10 }, VIEWPORT).scale).toBe(FIT_MAX_SCALE)
    expect(fitCamera({ left: 0, top: 0, width: 1, height: 1 }, VIEWPORT, 24, MAX_SCALE).scale).toBe(MAX_SCALE)
  })

  it('keeps the diagram point under the pointer while zooming', () => {
    const cam = { cx: 300, cy: 200, scale: 1 }
    const p = { x: 120, y: 450 }
    const before = toDiagram(cam, VIEWPORT, p)
    const after = zoomAround(cam, 2.5, VIEWPORT, p)
    expect(after.scale).toBe(2.5)
    const moved = toDiagram(after, VIEWPORT, p)
    expect(moved.x).toBeCloseTo(before.x)
    expect(moved.y).toBeCloseTo(before.y)
  })

  it('pans with the pointer', () => {
    expect(panBy({ cx: 100, cy: 100, scale: 2 }, 40, -20)).toEqual({ cx: 80, cy: 110, scale: 2 })
  })

  it('interpolates from one camera to another', () => {
    const a = { cx: 0, cy: 0, scale: 1 }
    const b = { cx: 500, cy: 300, scale: 4 }
    expect(interpolate(a, b, 0)).toEqual(a)
    const end = interpolate(a, b, 1)
    expect(end.cx).toBeCloseTo(500)
    expect(end.cy).toBeCloseTo(300)
    expect(end.scale).toBeCloseTo(4)
    // Halfway the zoom is halfway geometrically.
    expect(interpolate(a, b, 0.5).scale).toBeCloseTo(2)
  })
})
