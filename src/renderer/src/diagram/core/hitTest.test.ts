import { describe, expect, it } from 'vitest'
import { rect } from './geometry'
import {
  edgeHitCursor,
  handleAt,
  handleCursor,
  handlesFor,
  hitTestEdge,
  resizeByHandle,
  resizeHandles,
  rubberBandModeFor,
  rubberBandSelectsEdge,
  rubberBandSelectsRect
} from './hitTest'

const box = rect(100, 100, 80, 40)

describe('resize handles', () => {
  it('depends on sizable', () => {
    expect(handlesFor('free')).toHaveLength(8)
    expect(handlesFor('ratio')).toEqual(['nw', 'ne', 'se', 'sw'])
    expect(handlesFor('vert')).toEqual(['n', 's'])
    expect(handlesFor('horz')).toEqual(['e', 'w'])
    expect(handlesFor('none')).toEqual([])
  })

  it('places 8x8 screen-px handles outside the box', () => {
    const hs = Object.fromEntries(resizeHandles(box).map((h) => [h.position, h.rect]))
    expect(hs.nw).toEqual(rect(92, 92, 8, 8))
    expect(hs.n).toEqual(rect(136, 92, 8, 8))
    expect(hs.se).toEqual(rect(180, 140, 8, 8))
    expect(hs.w).toEqual(rect(92, 116, 8, 8))
    // At zoom 2 the handles are 4 diagram units.
    expect(resizeHandles(box, 'free', 2)[0]?.rect).toEqual(rect(96, 96, 4, 4))
  })

  it('finds the handle under a point', () => {
    expect(handleAt(box, { x: 95, y: 95 })).toBe('nw')
    expect(handleAt(box, { x: 140, y: 143 })).toBe('s')
    expect(handleAt(box, { x: 140, y: 120 })).toBeNull()
    expect(handleAt(box, { x: 95, y: 95 }, 'vert')).toBeNull()
  })

  it('picks the nearest of overlapping handles on tiny nodes', () => {
    const tiny = rect(0, 0, 4, 4)
    expect(handleAt(tiny, { x: -3, y: -3 })).toBe('nw')
    expect(handleAt(tiny, { x: 2, y: -6 })).toBe('n')
  })

  it('maps handles to cursors', () => {
    expect(handleCursor('nw')).toBe('nwse-resize')
    expect(handleCursor('ne')).toBe('nesw-resize')
    expect(handleCursor('s')).toBe('ns-resize')
    expect(handleCursor('w')).toBe('ew-resize')
  })
})

describe('resizeByHandle', () => {
  it('moves only the dragged sides', () => {
    expect(resizeByHandle(box, 'se', 10, 20)).toEqual(rect(100, 100, 90, 60))
    expect(resizeByHandle(box, 'nw', -10, 5)).toEqual(rect(90, 105, 90, 35))
    expect(resizeByHandle(box, 'e', 10, 99)).toEqual(rect(100, 100, 90, 40))
  })

  it('respects minimum sizes', () => {
    expect(resizeByHandle(box, 'w', 100, 0, { minWidth: 30 })).toEqual(rect(150, 100, 30, 40))
    expect(resizeByHandle(box, 's', 0, -100, { minHeight: 10 })).toEqual(rect(100, 100, 80, 10))
  })

  it('keeps the aspect ratio for ratio resizing', () => {
    const r = resizeByHandle(rect(0, 0, 26, 55), 'se', 26, 0, { keepRatio: true })
    expect(r.width).toBeCloseTo(52)
    expect(r.height).toBeCloseTo(110)
    const nw = resizeByHandle(rect(0, 0, 20, 10), 'nw', -20, 0, { keepRatio: true })
    expect(nw).toEqual(rect(-20, -10, 40, 20))
  })
})

describe('hitTestEdge', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 }]

  it('prefers vertices within 5 units', () => {
    expect(hitTestEdge(pts, { x: 3, y: 3 })).toEqual({ kind: 'vertex', index: 0, isEnd: true })
    expect(hitTestEdge(pts, { x: 97, y: 2 })).toEqual({ kind: 'vertex', index: 1, isEnd: false })
  })

  it('hits segments within 5 units and reports orientation', () => {
    expect(hitTestEdge(pts, { x: 50, y: 4 })).toEqual({ kind: 'segment', index: 0, orientation: 'horizontal' })
    expect(hitTestEdge(pts, { x: 104, y: 50 })).toEqual({ kind: 'segment', index: 1, orientation: 'vertical' })
    expect(hitTestEdge(pts, { x: 153, y: 147 })).toEqual({ kind: 'segment', index: 2, orientation: 'oblique' })
    expect(hitTestEdge(pts, { x: 50, y: 6 })).toBeNull()
    expect(hitTestEdge(pts, { x: 50, y: 6 }, 8)).not.toBeNull()
  })

  it('maps hits to cursors', () => {
    expect(edgeHitCursor({ kind: 'vertex', index: 0, isEnd: true })).toBe('pointer')
    expect(edgeHitCursor({ kind: 'vertex', index: 1, isEnd: false })).toBe('move')
    expect(edgeHitCursor({ kind: 'segment', index: 0, orientation: 'horizontal' })).toBe('ns-resize')
    expect(edgeHitCursor({ kind: 'segment', index: 0, orientation: 'vertical' })).toBe('ew-resize')
    expect(edgeHitCursor({ kind: 'segment', index: 0, orientation: 'oblique' })).toBe('crosshair')
  })
})

describe('rubber band', () => {
  const band = rect(0, 0, 200, 200)

  it('selects nodes by containment or intersection', () => {
    expect(rubberBandSelectsRect(band, rect(10, 10, 50, 50))).toBe(true)
    expect(rubberBandSelectsRect(band, rect(180, 10, 50, 50))).toBe(false)
    expect(rubberBandSelectsRect(band, rect(180, 10, 50, 50), 'intersect')).toBe(true)
  })

  it('selects edges by containment or intersection', () => {
    const inside = [{ x: 10, y: 10 }, { x: 150, y: 150 }]
    const crossing = [{ x: -50, y: 100 }, { x: 300, y: 100 }]
    const outside = [{ x: 300, y: 0 }, { x: 300, y: 300 }]
    expect(rubberBandSelectsEdge(band, inside)).toBe(true)
    expect(rubberBandSelectsEdge(band, crossing)).toBe(false)
    expect(rubberBandSelectsEdge(band, crossing, 'intersect')).toBe(true)
    expect(rubberBandSelectsEdge(band, outside, 'intersect')).toBe(false)
    expect(rubberBandSelectsEdge(band, [])).toBe(false)
  })

  it('picks window or crossing from the drag direction', () => {
    expect(rubberBandModeFor({ x: 10, y: 10 }, { x: 50, y: 60 })).toBe('contain')
    expect(rubberBandModeFor({ x: 10, y: 60 }, { x: 50, y: 10 })).toBe('contain')
    expect(rubberBandModeFor({ x: 10, y: 10 }, { x: 10, y: 80 })).toBe('contain')
    expect(rubberBandModeFor({ x: 50, y: 10 }, { x: 10, y: 60 })).toBe('intersect')
    expect(rubberBandModeFor({ x: 50, y: 60 }, { x: 49, y: 10 })).toBe('intersect')
  })

  it('crossing takes boxes it touches, but never a box it lies wholly inside', () => {
    expect(rubberBandSelectsRect(band, rect(10, 10, 50, 50), 'intersect')).toBe(true)
    expect(rubberBandSelectsRect(band, rect(150, 150, 100, 100), 'intersect')).toBe(true)
    expect(rubberBandSelectsRect(band, rect(201, 0, 50, 50), 'intersect')).toBe(false)
    // A frame or container around the band: not crossed, unless the band crosses its outline.
    expect(rubberBandSelectsRect(band, rect(-50, -50, 400, 400), 'intersect')).toBe(false)
    expect(rubberBandSelectsRect(band, rect(-50, -50, 400, 400))).toBe(false)
    expect(rubberBandSelectsRect(band, rect(-50, -50, 400, 150), 'intersect')).toBe(true)
    expect(rubberBandSelectsRect(band, rect(100, -50, 400, 400), 'intersect')).toBe(true)
  })

  it('crossing takes edges partly inside, edges passing through without a vertex inside, and touched labels', () => {
    const partly = [{ x: 100, y: 100 }, { x: 300, y: 100 }]
    const through = [{ x: -50, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 300 }]
    const around = [{ x: -50, y: -10 }, { x: 250, y: -10 }, { x: 250, y: 300 }]
    expect(rubberBandSelectsEdge(band, partly)).toBe(false)
    expect(rubberBandSelectsEdge(band, partly, 'intersect')).toBe(true)
    expect(through.some((p) => p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 200)).toBe(false)
    expect(rubberBandSelectsEdge(band, through, 'intersect')).toBe(true)
    expect(rubberBandSelectsEdge(band, around, 'intersect')).toBe(false)
    // A label box reaching into the band takes its edge; in window mode labels do not matter.
    expect(rubberBandSelectsEdge(band, around, 'intersect', [rect(190, 40, 40, 14)])).toBe(true)
    expect(rubberBandSelectsEdge(band, around, 'contain', [rect(10, 40, 40, 14)])).toBe(false)
    expect(rubberBandSelectsEdge(band, [{ x: 50, y: 50 }], 'intersect')).toBe(true)
    expect(rubberBandSelectsEdge(band, [], 'intersect')).toBe(false)
  })
})
