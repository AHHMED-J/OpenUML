import { describe, expect, it } from 'vitest'
import { rect } from './geometry'
import {
  edgeAsEndpoint,
  edgeMiddleSegmentCenter,
  obliqueJunction,
  orthogonalJunction,
  shapeJunction,
  shapeOrthogonalJunction
} from './junction'

// Box (100,100)-(200,150); enlarged by 1 for junctions: x 99..201, y 99..151, center (150,125).
const box = rect(100, 100, 100, 50)

describe('orthogonalJunction', () => {
  it('attaches vertically when x is strictly inside the box span', () => {
    expect(orthogonalJunction(box, { x: 120, y: 0 })).toEqual({ x: 120, y: 99 })
    expect(orthogonalJunction(box, { x: 120, y: 300 })).toEqual({ x: 120, y: 151 })
  })

  it('attaches horizontally when y is strictly inside the box span', () => {
    expect(orthogonalJunction(box, { x: 0, y: 110 })).toEqual({ x: 99, y: 110 })
    expect(orthogonalJunction(box, { x: 400, y: 140 })).toEqual({ x: 201, y: 140 })
  })

  it('handles points exactly on a side line', () => {
    expect(orthogonalJunction(box, { x: 99, y: 0 })).toEqual({ x: 99, y: 99 })
    expect(orthogonalJunction(box, { x: 0, y: 151 })).toEqual({ x: 99, y: 151 })
  })

  it('returns null when no axis-aligned segment reaches the box', () => {
    expect(orthogonalJunction(box, { x: 300, y: 0 })).toBeNull()
    expect(orthogonalJunction(box, { x: 0, y: 0 })).toBeNull()
  })
})

describe('obliqueJunction', () => {
  it('uses the orthogonal junction when the point is level with the center', () => {
    expect(obliqueJunction(box, { x: 400, y: 125 })).toEqual({ x: 201, y: 125 })
    expect(obliqueJunction(box, { x: 150, y: -50 })).toEqual({ x: 150, y: 99 })
  })

  it('stops at the enlarged box on the line toward the center', () => {
    // d = (200, 100): leaves through the right side at t = 51/200.
    expect(obliqueJunction(box, { x: 350, y: 225 })).toEqual({ x: 201, y: 150.5 })
    // d = (-150, -200): leaves through the top at t = 26/200.
    const p = obliqueJunction(box, { x: 0, y: -75 })
    expect(p.y).toBe(99)
    expect(p.x).toBeCloseTo(150 - 150 * (26 / 200))
  })

  it('falls back to the center for points inside the box', () => {
    expect(obliqueJunction(box, { x: 160, y: 130 })).toEqual({ x: 150, y: 125 })
  })

  it('uses a floored center', () => {
    const odd = rect(0, 0, 11, 11) // center 5.5 -> 5
    expect(obliqueJunction(odd, { x: 5, y: 100 })).toEqual({ x: 5, y: 12 })
  })
})

describe('outline-aware junctions', () => {
  const r = rect(0, 0, 100, 50) // enlarged: x -1..101, y -1..51; rx 51, ry 26, center (50, 25)

  it('clips to the true ellipse and diamond outline', () => {
    expect(shapeJunction({ box: r, outline: 'ellipse' }, { x: 300, y: 25 })).toEqual({ x: 101, y: 25 })
    const e = shapeJunction({ box: r, outline: 'ellipse' }, { x: 300, y: 300 })
    expect(((e.x - 50) / 51) ** 2 + ((e.y - 25) / 26) ** 2).toBeCloseTo(1)
    const d = shapeJunction({ box: r, outline: 'diamond' }, { x: 300, y: 300 })
    expect(Math.abs(d.x - 50) / 51 + Math.abs(d.y - 25) / 26).toBeCloseTo(1)
    expect(shapeJunction({ box: r }, { x: 300, y: 25 })).toEqual({ x: 101, y: 25 })
  })

  it('slides orthogonal attachments onto the outline along their axis', () => {
    expect(shapeOrthogonalJunction({ box: r, outline: 'ellipse' }, { x: 50, y: -100 })).toEqual({ x: 50, y: -1 })
    const e = shapeOrthogonalJunction({ box: r, outline: 'ellipse' }, { x: 75.5, y: -100 })
    expect(e?.x).toBe(75.5)
    expect(e?.y).toBeCloseTo(25 - 26 * Math.sqrt(0.75))
    const d = shapeOrthogonalJunction({ box: r, outline: 'diamond' }, { x: 300, y: 38 })
    expect(d).toEqual({ x: 50 + 51 * 0.5, y: 38 })
    expect(shapeOrthogonalJunction({ box: r, outline: 'ellipse' }, { x: 300, y: 300 })).toBeNull()
  })

  it('treats point endpoints as the point itself', () => {
    const end = { box: rect(10, 20, 0, 0), outline: 'point' as const }
    expect(shapeJunction(end, { x: 500, y: 500 })).toEqual({ x: 10, y: 20 })
    expect(shapeOrthogonalJunction(end, { x: 10, y: 500 })).toEqual({ x: 10, y: 20 })
    expect(shapeOrthogonalJunction(end, { x: 11, y: 500 })).toBeNull()
  })
})

describe('edge-to-edge targets', () => {
  it('uses the middle segment center', () => {
    expect(edgeMiddleSegmentCenter([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual({ x: 100, y: 50 })
    expect(edgeMiddleSegmentCenter([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }])).toEqual({ x: 10, y: 5 })
    expect(edgeMiddleSegmentCenter([{ x: 0, y: 0 }, { x: 15, y: 0 }])).toEqual({ x: 7, y: 0 })
    expect(edgeAsEndpoint([{ x: 0, y: 0 }, { x: 15, y: 0 }])).toEqual({ box: rect(7, 0, 0, 0), outline: 'point' })
  })
})
