import { describe, expect, it } from 'vitest'
import {
  boundsOfPoints,
  closestPointOnSegment,
  diamondBorderPointToward,
  distancePointToPolyline,
  distancePointToSegment,
  ellipseBorderPointToward,
  inflateRect,
  normalizeAngle,
  rect,
  rectBorderPointToward,
  rectCenter,
  rectContainsPoint,
  rectContainsRect,
  rectFromPoints,
  rectsIntersect,
  rotate,
  segmentIntersection,
  segmentIntersectsRect,
  unionRects
} from './geometry'

describe('rect helpers', () => {
  const r = rect(10, 20, 100, 50)

  it('computes center and containment with tolerance', () => {
    expect(rectCenter(r)).toEqual({ x: 60, y: 45 })
    expect(rectContainsPoint(r, { x: 10, y: 20 })).toBe(true)
    expect(rectContainsPoint(r, { x: 110, y: 70 })).toBe(true)
    expect(rectContainsPoint(r, { x: 112, y: 70 })).toBe(false)
    expect(rectContainsPoint(r, { x: 112, y: 70 }, 2)).toBe(true)
  })

  it('normalizes drag rectangles', () => {
    expect(rectFromPoints({ x: 50, y: 40 }, { x: 10, y: 5 })).toEqual(rect(10, 5, 40, 35))
  })

  it('inflates, unions and bounds', () => {
    expect(inflateRect(r, 1)).toEqual(rect(9, 19, 102, 52))
    expect(unionRects([rect(0, 0, 10, 10), rect(20, -5, 5, 5)])).toEqual(rect(0, -5, 25, 15))
    expect(unionRects([])).toBeNull()
    expect(boundsOfPoints([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual(rect(-1, 2, 4, 7))
    expect(boundsOfPoints([])).toBeNull()
  })

  it('tests rect containment and intersection', () => {
    expect(rectContainsRect(r, rect(20, 30, 10, 10))).toBe(true)
    expect(rectContainsRect(r, rect(5, 30, 10, 10))).toBe(false)
    expect(rectsIntersect(r, rect(105, 65, 10, 10))).toBe(true)
    expect(rectsIntersect(r, rect(111, 65, 10, 10))).toBe(false)
  })
})

describe('segments', () => {
  it('measures distance to a segment, including beyond its ends', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(distancePointToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
    expect(distancePointToSegment({ x: 13, y: 4 }, a, b)).toBe(5)
    expect(distancePointToSegment({ x: 3, y: 4 }, a, a)).toBe(5)
    expect(closestPointOnSegment({ x: -5, y: 2 }, a, b)).toEqual({ x: 0, y: 0 })
  })

  it('measures distance to a polyline', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(distancePointToPolyline({ x: 12, y: 5 }, pts)).toBe(2)
    expect(distancePointToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity)
  })

  it('intersects segments', () => {
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 5 })
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBeNull()
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull()
  })

  it('detects segments crossing a rectangle', () => {
    const r = rect(10, 10, 10, 10)
    expect(segmentIntersectsRect({ x: 0, y: 15 }, { x: 30, y: 15 }, r)).toBe(true)
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 30, y: 0 }, r)).toBe(false)
    expect(segmentIntersectsRect({ x: 12, y: 12 }, { x: 13, y: 13 }, r)).toBe(true)
  })
})

describe('outline clipping', () => {
  const r = rect(0, 0, 100, 50)

  it('clips to the rectangle border', () => {
    expect(rectBorderPointToward(r, { x: 250, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(rectBorderPointToward(r, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 })
    const p = rectBorderPointToward(r, { x: 150, y: 125 })
    expect(p.x).toBeCloseTo(75)
    expect(p.y).toBeCloseTo(50)
    expect(rectBorderPointToward(r, { x: 60, y: 30 })).toEqual({ x: 50, y: 25 })
  })

  it('clips to the ellipse', () => {
    expect(ellipseBorderPointToward(r, { x: 200, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(ellipseBorderPointToward(r, { x: 50, y: 200 })).toEqual({ x: 50, y: 50 })
    const p = ellipseBorderPointToward(r, { x: 150, y: 125 })
    // On the ellipse: ((x-50)/50)^2 + ((y-25)/25)^2 = 1
    expect(((p.x - 50) / 50) ** 2 + ((p.y - 25) / 25) ** 2).toBeCloseTo(1)
    expect(ellipseBorderPointToward(r, { x: 55, y: 25 })).toEqual({ x: 50, y: 25 })
  })

  it('clips to the diamond', () => {
    expect(diamondBorderPointToward(r, { x: 200, y: 25 })).toEqual({ x: 100, y: 25 })
    const p = diamondBorderPointToward(r, { x: 150, y: 125 })
    expect(Math.abs(p.x - 50) / 50 + Math.abs(p.y - 25) / 25).toBeCloseTo(1)
  })
})

describe('angles', () => {
  it('rotates clockwise on screen for positive angles', () => {
    const v = rotate({ x: 1, y: 0 }, Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
  })

  it('normalizes into (-pi, pi]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2)
    expect(normalizeAngle(0.5)).toBe(0.5)
  })
})
