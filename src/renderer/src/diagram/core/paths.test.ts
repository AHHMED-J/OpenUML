import { describe, expect, it } from 'vitest'
import { curvePath, diamondPoints, edgePath, ellipsePath, fmt, polygonPath, polylinePath, roundedPolylinePath, roundedRectPath } from './paths'
import { LineStyle } from './style'

describe('path builders', () => {
  it('formats numbers compactly', () => {
    expect(fmt(1.23456)).toBe('1.235')
    expect(fmt(-0)).toBe('0')
    expect(fmt(-0.0001)).toBe('0')
    expect(fmt(10)).toBe('10')
  })

  it('builds polylines and polygons', () => {
    expect(polylinePath([])).toBe('')
    expect(polylinePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0 0 L10 5')
    expect(polygonPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }])).toBe('M0 0 L10 0 L5 5 Z')
  })

  it('rounds rectilinear bends with radius 8 and the correct sweep', () => {
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toBe('M0 0 L92 0 A8 8 0 0 1 100 8 L100 100')
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -100 }])).toBe('M0 0 L92 0 A8 8 0 0 0 100 -8 L100 -100')
  })

  it('limits the radius to half of a short segment', () => {
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }])).toBe('M0 0 L5 0 A5 5 0 0 1 10 5 L10 100')
  })

  it('leaves straight runs and 2-point edges unrounded', () => {
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0 0 L10 0')
    expect(roundedPolylinePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBe('M0 0 L10 0 L20 0')
  })

  it('builds quadratic curves through interior midpoints', () => {
    expect(curvePath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe('M0 0 L10 10')
    expect(curvePath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 100 }])).toBe('M0 0 Q50 0 100 100')
    expect(curvePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }])).toBe('M0 0 Q10 0 15 5 Q20 10 30 10')
  })

  it('dispatches by line style', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(edgePath(pts, LineStyle.Oblique)).toBe(polylinePath(pts))
    expect(edgePath(pts, LineStyle.Rectilinear)).toBe(polylinePath(pts))
    expect(edgePath(pts, LineStyle.RoundedRectilinear)).toBe(roundedPolylinePath(pts))
    expect(edgePath(pts, LineStyle.Curve)).toBe(curvePath(pts))
  })

  it('builds shapes', () => {
    expect(roundedRectPath({ left: 0, top: 0, width: 100, height: 40 }, 10)).toBe(
      'M10 0 L90 0 A10 10 0 0 1 100 10 L100 30 A10 10 0 0 1 90 40 L10 40 A10 10 0 0 1 0 30 L0 10 A10 10 0 0 1 10 0 Z'
    )
    expect(roundedRectPath({ left: 0, top: 0, width: 10, height: 10 }, 0)).toBe('M0 0 L10 0 L10 10 L0 10 Z')
    expect(ellipsePath({ left: 0, top: 0, width: 70, height: 32 })).toBe('M0 16 A35 16 0 1 0 70 16 A35 16 0 1 0 0 16 Z')
    expect(diamondPoints({ left: 0, top: 0, width: 23, height: 19 })).toEqual([
      { x: 11.5, y: 0 },
      { x: 23, y: 9.5 },
      { x: 11.5, y: 19 },
      { x: 0, y: 9.5 }
    ])
  })
})
