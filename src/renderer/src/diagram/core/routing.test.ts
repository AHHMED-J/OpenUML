import { describe, expect, it } from 'vitest'
import { inflateRect, rect, rectBottom, rectRight, type Point, type Rect } from './geometry'
import {
  cleanupRectilinear,
  initialRectilinearRoute,
  rectilinearize,
  removeCollinearPoints,
  removeDuplicatePoints,
  routeEdge,
  routeOblique,
  routeRectilinear,
  segmentOrientation,
  selfLoopRoute,
  simplifyOblique
} from './routing'
import { LineStyle } from './style'

// Tail box: x 0..100, y 0..50 (junction box x -1..101, y -1..51, center (50, 25)).
// Head box: x 300..400, y 200..250 (junction box x 299..401, y 199..251, center (350, 225)).
const T = { box: rect(0, 0, 100, 50) }
const H = { box: rect(300, 200, 100, 50) }

function axisAligned(points: readonly Point[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentOrientation(points[i] as Point, points[i + 1] as Point) === 'oblique') return false
  }
  return true
}

function onBorder(p: Point, box: Rect): boolean {
  const b = inflateRect(box, 1)
  const onX = (p.x === b.left || p.x === rectRight(b)) && p.y >= b.top && p.y <= rectBottom(b)
  const onY = (p.y === b.top || p.y === rectBottom(b)) && p.x >= b.left && p.x <= rectRight(b)
  return onX || onY
}

describe('point list helpers', () => {
  it('removes duplicates and collinear axis-aligned points', () => {
    expect(removeDuplicatePoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }])
    expect(removeDuplicatePoints([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }, { x: 1, y: 1 }])
    expect(
      removeCollinearPoints([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }])
    ).toEqual([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 30 }])
    // Oblique collinear points are not removed (only axis-aligned triples are).
    expect(removeCollinearPoints([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }])).toHaveLength(3)
  })

  it('turns oblique segments into L shapes', () => {
    expect(rectilinearize([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 }])
    // a is the lower point: the corner is (b.x, a.y).
    expect(rectilinearize([{ x: 0, y: 20 }, { x: 10, y: 0 }])).toEqual([{ x: 0, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 0 }])
    expect(rectilinearize([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })

  it('simplifies near-collinear oblique vertices', () => {
    expect(simplifyOblique([{ x: 0, y: 0 }, { x: 50, y: 3 }, { x: 100, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(simplifyOblique([{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 0 }])).toHaveLength(3)
  })
})

describe('oblique routing', () => {
  it('aims a fresh edge at the other node center', () => {
    expect(routeOblique([], T, H)).toEqual([{ x: 89, y: 51 }, { x: 311, y: 199 }])
  })

  it('keeps interior vertices and aims ends at them', () => {
    expect(routeOblique([{ x: 0, y: 0 }, { x: 200, y: 25 }, { x: 0, y: 0 }], T, H)).toEqual([
      { x: 101, y: 25 },
      { x: 200, y: 25 },
      { x: 331, y: 199 }
    ])
  })

  it('clips ellipse ends to the true outline', () => {
    const pts = routeOblique([], T, { box: rect(300, 0, 100, 50), outline: 'ellipse' })
    expect(pts).toEqual([{ x: 101, y: 25 }, { x: 299, y: 25 }])
  })
})

describe('rectilinear routing', () => {
  it('creates an L through the centers for a new edge', () => {
    expect(initialRectilinearRoute(T, H)).toEqual([{ x: 50, y: 51 }, { x: 50, y: 225 }, { x: 299, y: 225 }])
  })

  it('creates a straight segment when the boxes overlap on one axis', () => {
    expect(initialRectilinearRoute(T, { box: rect(50, 200, 100, 50) })).toEqual([{ x: 100, y: 51 }, { x: 100, y: 199 }])
    expect(routeRectilinear([], T, { box: rect(300, 10, 100, 50) })).toEqual([{ x: 101, y: 35 }, { x: 299, y: 35 }])
  })

  it('re-attaches ends and realigns the neighbouring vertex when the head moves', () => {
    const route = [{ x: 50, y: 51 }, { x: 50, y: 225 }, { x: 299, y: 225 }]
    const moved = { box: rect(300, 300, 100, 50) } // center (350, 325)
    expect(routeRectilinear(route, T, moved)).toEqual([{ x: 50, y: 51 }, { x: 50, y: 325 }, { x: 299, y: 325 }])
  })

  it('keeps user bends that still connect', () => {
    const route = [{ x: 50, y: 51 }, { x: 50, y: 120 }, { x: 330, y: 120 }, { x: 330, y: 199 }]
    expect(routeRectilinear(route, T, H)).toEqual(route)
  })

  it('cleans up duplicates, collinear points and points inside the end boxes', () => {
    const messy = [
      { x: 50, y: 51 },
      { x: 50, y: 30 }, // inside the tail box
      { x: 50, y: 100 },
      { x: 50, y: 100 },
      { x: 50, y: 225 },
      { x: 200, y: 225 },
      { x: 299, y: 225 }
    ]
    expect(cleanupRectilinear(messy, T, H)).toEqual([{ x: 50, y: 51 }, { x: 50, y: 225 }, { x: 299, y: 225 }])
  })

  it('rounds coordinates to integers', () => {
    const pts = routeRectilinear([{ x: 50.4, y: 51 }, { x: 50.4, y: 225.6 }, { x: 299, y: 225.6 }], T, H)
    expect(pts).toEqual([{ x: 50, y: 51 }, { x: 50, y: 226 }, { x: 299, y: 226 }])
  })

  it('converts an oblique polyline when the style changes to rectilinear', () => {
    const pts = routeRectilinear([{ x: 89, y: 51 }, { x: 311, y: 199 }], T, H)
    expect(axisAligned(pts)).toBe(true)
    expect(onBorder(pts[0] as Point, T.box)).toBe(true)
    expect(onBorder(pts[pts.length - 1] as Point, H.box)).toBe(true)
  })

  it('always yields a stable axis-aligned route attached to both boxes (randomized)', () => {
    let seed = 12345
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const overlap = (a: Rect, b: Rect): boolean => {
      const ia = inflateRect(a, 1)
      const ib = inflateRect(b, 1)
      return ia.left <= rectRight(ib) && ib.left <= rectRight(ia) && ia.top <= rectBottom(ib) && ib.top <= rectBottom(ia)
    }
    let checked = 0
    for (let i = 0; i < 1500; i++) {
      const a = rect(rnd(400), rnd(400), 20 + rnd(150), 20 + rnd(100))
      const b = rect(rnd(400), rnd(400), 20 + rnd(150), 20 + rnd(100))
      const moved = rect(rnd(600), rnd(600), b.width, b.height)
      if (overlap(a, b) || overlap(a, moved)) continue
      checked++
      // Either a fresh route or an arbitrary user polyline, then the head node moves.
      const start =
        i % 2 === 0
          ? initialRectilinearRoute({ box: a }, { box: b })
          : Array.from({ length: 2 + rnd(5) }, () => ({ x: rnd(700), y: rnd(700) }))
      const pts = routeRectilinear(start, { box: a }, { box: moved })
      expect(pts.length).toBeGreaterThanOrEqual(2)
      expect(axisAligned(pts)).toBe(true)
      expect(onBorder(pts[0] as Point, a)).toBe(true)
      expect(onBorder(pts[pts.length - 1] as Point, moved)).toBe(true)
      expect(pts.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true)
      // Routing a settled route again is a no-op.
      expect(routeRectilinear(pts, { box: a }, { box: moved })).toEqual(pts)
    }
    expect(checked).toBeGreaterThan(500)
  })
})

describe('self loops', () => {
  it('builds the default loop out of the top and into the right side', () => {
    expect(selfLoopRoute(rect(100, 100, 60, 40))).toEqual([
      { x: 130, y: 99 },
      { x: 130, y: 80 },
      { x: 190, y: 80 },
      { x: 190, y: 120 },
      { x: 161, y: 120 }
    ])
  })

  it('forces rectilinear style for self loops with fewer than 4 bends', () => {
    const box = rect(100, 100, 60, 40)
    const r = routeEdge({ lineStyle: LineStyle.Oblique, points: [], tail: { box }, head: { box }, selfLoop: true })
    expect(r.lineStyle).toBe(LineStyle.Rectilinear)
    expect(r.points).toEqual(selfLoopRoute(box))
  })
})

describe('routeEdge dispatch', () => {
  it('routes by line style', () => {
    expect(routeEdge({ lineStyle: LineStyle.Oblique, points: [], tail: T, head: H }).points).toEqual(routeOblique([], T, H))
    expect(routeEdge({ lineStyle: LineStyle.Curve, points: [], tail: T, head: H }).points).toEqual(routeOblique([], T, H))
    const rr = routeEdge({ lineStyle: LineStyle.RoundedRectilinear, points: [], tail: T, head: H })
    expect(rr.lineStyle).toBe(LineStyle.RoundedRectilinear)
    expect(rr.points).toEqual(initialRectilinearRoute(T, H))
  })
})
