import { describe, expect, it } from 'vitest'
import type { Point } from './geometry'
import {
  EDGE_LABEL_DEFAULTS,
  NODE_LABEL_DEFAULTS,
  edgeAnchor,
  edgeLabelParamsFromBox,
  placeEdgeLabel,
  placeNodeLabel,
  polarLabelCenter
} from './labels'
import { EdgePosition } from './style'

const horizontal: Point[] = [{ x: 0, y: 100 }, { x: 200, y: 100 }]

describe('edgeAnchor', () => {
  it('uses the end points for tail and head', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }]
    expect(edgeAnchor(pts, EdgePosition.Tail)).toEqual({ anchor: { x: 0, y: 0 }, reference: { x: 10, y: 0 } })
    expect(edgeAnchor(pts, EdgePosition.Head)).toEqual({ anchor: { x: 10, y: 20 }, reference: { x: 10, y: 0 } })
  })

  it('uses the middle vertex for odd point counts', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(edgeAnchor(pts, EdgePosition.Middle)).toEqual({ anchor: { x: 100, y: 0 }, reference: { x: 100, y: 100 } })
  })

  it('uses the floored midpoint of the middle segment for even point counts', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 11 }, { x: 20, y: 11 }]
    expect(edgeAnchor(pts, EdgePosition.Middle)).toEqual({ anchor: { x: 10, y: 5 }, reference: { x: 10, y: 11 } })
    expect(edgeAnchor(horizontal, EdgePosition.Middle)).toEqual({ anchor: { x: 100, y: 100 }, reference: { x: 200, y: 100 } })
  })

  it('handles degenerate edges', () => {
    expect(edgeAnchor([{ x: 5, y: 5 }], EdgePosition.Middle).anchor).toEqual({ x: 5, y: 5 })
    expect(() => edgeAnchor([], EdgePosition.Head)).toThrow()
  })
})

describe('placeEdgeLabel', () => {
  const size = { width: 40, height: 13 }

  it('places name above, stereotype further above and property below a left-to-right edge', () => {
    const name = placeEdgeLabel(horizontal, EdgePosition.Middle, EDGE_LABEL_DEFAULTS.name, size)
    expect(name).toEqual({ left: 80, top: 78, width: 40, height: 13 }) // center (100, 85)
    const st = placeEdgeLabel(horizontal, EdgePosition.Middle, EDGE_LABEL_DEFAULTS.stereotype, size)
    expect(st.top).toBe(63) // center (100, 70)
    const prop = placeEdgeLabel(horizontal, EdgePosition.Middle, EDGE_LABEL_DEFAULTS.property, size)
    expect(prop.top).toBe(108) // center (100, 115)
  })

  it('puts role names above and multiplicities below at both ends', () => {
    const c = (k: keyof typeof EDGE_LABEL_DEFAULTS): Point => {
      const d = EDGE_LABEL_DEFAULTS[k]
      return polarLabelCenter(edgeAnchor(horizontal, d.edgePosition), d)
    }
    expect(c('tailRoleName')).toEqual({ x: 25, y: 85 })
    expect(c('tailMultiplicity')).toEqual({ x: 21, y: 112 })
    expect(c('headRoleName').y).toBeLessThan(100)
    expect(c('headRoleName').x).toBeLessThan(200)
    expect(c('headMultiplicity').y).toBeGreaterThan(100)
    expect(c('headMultiplicity').x).toBeLessThan(200)
  })

  it('swaps sides when the edge direction flips', () => {
    const reversed = [...horizontal].reverse()
    const name = placeEdgeLabel(reversed, EdgePosition.Middle, EDGE_LABEL_DEFAULTS.name, size)
    expect(name.top + 6.5).toBeGreaterThan(100)
  })

  it('places labels to the right of a downward edge (counter-clockwise from its direction)', () => {
    const down = [{ x: 0, y: 0 }, { x: 0, y: 100 }]
    const center = polarLabelCenter(edgeAnchor(down, EdgePosition.Middle), EDGE_LABEL_DEFAULTS.name)
    expect(center).toEqual({ x: 15, y: 50 })
  })
})

describe('label drag round-trip', () => {
  let seed = 7
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }

  it('recomputes (alpha, distance) so the label lands where it was dropped', () => {
    for (let i = 0; i < 500; i++) {
      const pts = Array.from({ length: 2 + rnd(4) }, () => ({ x: rnd(500), y: rnd(500) }))
      const position = rnd(3) as EdgePosition
      const size = { width: 10 + rnd(80), height: 13 }
      const dropped = { left: rnd(600) - 50, top: rnd(600) - 50, ...size }
      const params = edgeLabelParamsFromBox(pts, position, dropped)
      const placed = placeEdgeLabel(pts, position, params, size)
      expect(Math.abs(placed.left - dropped.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.top - dropped.top)).toBeLessThanOrEqual(1)
    }
  })

  it('keeps the label position relative to the edge when the edge moves', () => {
    const size = { width: 30, height: 13 }
    const params = EDGE_LABEL_DEFAULTS.tailRoleName
    const before = placeEdgeLabel(horizontal, EdgePosition.Tail, params, size)
    const moved = horizontal.map((p) => ({ x: p.x + 37, y: p.y - 12 }))
    const after = placeEdgeLabel(moved, EdgePosition.Tail, params, size)
    expect(after.left - before.left).toBe(37)
    expect(after.top - before.top).toBe(-12)
  })

  it('round-trips default parameters', () => {
    const size = { width: 30, height: 14 }
    for (const d of Object.values(EDGE_LABEL_DEFAULTS)) {
      const box = placeEdgeLabel(horizontal, d.edgePosition, d, size)
      const p = edgeLabelParamsFromBox(horizontal, d.edgePosition, box)
      expect(Math.abs(p.distance - d.distance)).toBeLessThan(1.5)
      expect(Math.abs(p.alpha - d.alpha)).toBeLessThan(0.1)
    }
  })
})

describe('node-attached labels', () => {
  const node = { left: 100, top: 100, width: 18, height: 18 } // center (109, 109)

  it('places the name up-left and the property down-left', () => {
    const size = { width: 20, height: 13 }
    const name = placeNodeLabel(node, NODE_LABEL_DEFAULTS.name, size)
    expect(name.left + 10).toBeLessThan(109)
    expect(name.top + 6.5).toBeLessThan(109)
    const prop = placeNodeLabel(node, NODE_LABEL_DEFAULTS.property, size)
    expect(prop.left + 10).toBeLessThan(109)
    expect(prop.top + 6.5).toBeGreaterThan(109)
  })
})
