import { describe, expect, it } from 'vitest'
import { distance, type Point } from './geometry'
import { END_GEOMETRY, edgeEndShapes, endShapePath, endShapes, type EndShape } from './endStyles'

// Tip at (100, 0); the line comes from the left, so u = (-1, 0).
const T = { x: 100, y: 0 }
const ADJ = { x: 0, y: 0 }
const a = Math.PI / 8

function only(shapes: EndShape[], type: EndShape['type']): EndShape {
  expect(shapes).toHaveLength(1)
  expect(shapes[0]?.type).toBe(type)
  return shapes[0] as EndShape
}

function expectPoint(p: Point | undefined, x: number, y: number): void {
  expect(p?.x).toBeCloseTo(x)
  expect(p?.y).toBeCloseTo(y)
}

describe('end shapes', () => {
  it('draws nothing for flat', () => {
    expect(endShapes('flat', T, ADJ)).toEqual([])
  })

  it('draws an open stick arrow with 11-long arms at ±22.5°', () => {
    const s = only(endShapes('stickArrow', T, ADJ), 'polyline')
    if (s.type !== 'polyline') throw new Error()
    expect(s.points[1]).toEqual(T)
    expectPoint(s.points[0], 100 - 11 * Math.cos(a), 11 * Math.sin(a))
    expectPoint(s.points[2], 100 - 11 * Math.cos(a), -11 * Math.sin(a))
  })

  it('draws a small filled arrow and a large hollow triangle', () => {
    const solid = only(endShapes('solidArrow', T, ADJ), 'polygon')
    expect(solid.type === 'polygon' && solid.fill).toBe('line')
    const tri = only(endShapes('triangle', T, ADJ), 'polygon')
    if (tri.type !== 'polygon') throw new Error()
    expect(tri.fill).toBe('background')
    // About 20.3 deep and 16.8 wide.
    expect(100 - (tri.points[1] as Point).x).toBeCloseTo(20.33, 1)
    expect(distance(tri.points[1] as Point, tri.points[2] as Point)).toBeCloseTo(16.84, 1)
    const filled = only(endShapes('filledTriangle', T, ADJ), 'polygon')
    expect(filled.type === 'polygon' && filled.fill).toBe('line')
  })

  it('draws 22-long diamonds about 8.4 wide', () => {
    const d = only(endShapes('diamond', T, ADJ), 'polygon')
    if (d.type !== 'polygon') throw new Error()
    expect(d.fill).toBe('background')
    expect(d.points[0]).toEqual(T)
    expectPoint(d.points[2], 78, 0)
    expect(distance(d.points[1] as Point, d.points[3] as Point)).toBeCloseTo(8.42, 1)
    const f = only(endShapes('filledDiamond', T, ADJ), 'polygon')
    expect(f.type === 'polygon' && f.fill).toBe('line')
  })

  it('puts the arrow of arrow+diamond on the far vertex', () => {
    const shapes = endShapes('arrowFilledDiamond', T, ADJ)
    expect(shapes).toHaveLength(2)
    const arrow = shapes[1]
    if (arrow?.type !== 'polyline') throw new Error()
    expectPoint(arrow.points[1], 78, 0)
    expect((arrow.points[0] as Point).x).toBeLessThan(78)
  })

  it('draws a cross centered 7 from the tip with 5-long arms', () => {
    const shapes = endShapes('cross', T, ADJ)
    expect(shapes).toHaveLength(2)
    for (const s of shapes) {
      if (s.type !== 'polyline') throw new Error()
      const [p, q] = s.points as [Point, Point]
      expectPoint({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, 93, 0)
      expect(distance(p, q)).toBeCloseTo(10)
      expect(Math.abs(p.x - q.x)).toBeCloseTo(Math.abs(p.y - q.y)) // 45 degrees
    }
  })

  it('adds the owned-end dot and shifts the symbol by 6', () => {
    const dotOnly = endShapes({ style: 'flat', dot: true }, T, ADJ)
    expect(dotOnly).toEqual([{ type: 'circle', center: { x: 97, y: 0 }, radius: 3, fill: 'line' }])
    const withArrow = endShapes({ style: 'stickArrow', dot: true }, T, ADJ)
    expect(withArrow).toHaveLength(2)
    const arrow = withArrow[1]
    if (arrow?.type !== 'polyline') throw new Error()
    expectPoint(arrow.points[1], 94, 0)
  })

  it('works in any direction', () => {
    const s = endShapes('triangle', { x: 0, y: 0 }, { x: 0, y: 50 })[0]
    if (s?.type !== 'polygon') throw new Error()
    expect((s.points[1] as Point).y).toBeCloseTo(22 * Math.cos(a))
  })

  it('draws containment as a circle with a plus', () => {
    const shapes = endShapes('circlePlus', T, ADJ)
    expect(shapes[0]).toEqual({ type: 'circle', center: { x: 94, y: 0 }, radius: END_GEOMETRY.circlePlusRadius, fill: 'background' })
    expect(shapes).toHaveLength(3)
  })
})

describe('helpers', () => {
  it('serializes shapes to path data', () => {
    expect(endShapePath({ type: 'polyline', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBe('M0 0 L1 1')
    expect(endShapePath({ type: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], fill: 'line' })).toBe('M0 0 L1 1 L0 1 Z')
    expect(endShapePath({ type: 'circle', center: { x: 10, y: 10 }, radius: 3, fill: 'line' })).toBe('M7 10 A3 3 0 1 0 13 10 A3 3 0 1 0 7 10 Z')
  })

  it('builds both ends of an edge', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]
    const { tail, head } = edgeEndShapes(pts, 'diamond', 'stickArrow')
    expect(tail[0]?.type === 'polygon' && tail[0].points[0]).toEqual({ x: 0, y: 0 })
    expect(head[0]?.type === 'polyline' && head[0].points[1]).toEqual({ x: 50, y: 50 })
    expect(edgeEndShapes([{ x: 0, y: 0 }], 'diamond', 'diamond')).toEqual({ tail: [], head: [] })
  })
})
