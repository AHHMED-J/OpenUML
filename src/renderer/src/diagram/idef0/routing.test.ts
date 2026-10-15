import { describe, expect, it } from 'vitest'
import type { Point, Rect } from '../core'
import { feedbackKind, longestSegment, routeArrowDetailed, routeBranch, trimEnd, trimStart, type RouteEnd, type RouteInput } from './routing'
import { slotPoint } from './geometry'

const routeArrow = (input: RouteInput): Point[] => routeArrowDetailed(input).points

const boxA: Rect = { left: 100, top: 100, width: 168, height: 88 }
const boxB: Rect = { left: 400, top: 250, width: 168, height: 88 }

const out = (box: Rect, i = 0, n = 1): RouteEnd => ({ point: slotPoint(box, 'right', i, n), dir: 'E', box })
const inp = (box: Rect, i = 0, n = 1): RouteEnd => ({ point: slotPoint(box, 'left', i, n), dir: 'W', box })
const ctl = (box: Rect, i = 0, n = 1): RouteEnd => ({ point: slotPoint(box, 'top', i, n), dir: 'N', box })
const mech = (box: Rect, i = 0, n = 1): RouteEnd => ({ point: slotPoint(box, 'bottom', i, n), dir: 'S', box })

function axisAligned(points: readonly Point[]): boolean {
  return points.every((p, i) => i === 0 || p.x === (points[i - 1] as Point).x || p.y === (points[i - 1] as Point).y)
}

function noRepeats(points: readonly Point[]): boolean {
  return points.every((p, i) => i === 0 || p.x !== (points[i - 1] as Point).x || p.y !== (points[i - 1] as Point).y)
}

describe('routeArrow', () => {
  it('routes output to input H-V-H through the channel between the boxes', () => {
    const pts = routeArrow({ tail: out(boxA), head: inp(boxB) })
    expect(axisAligned(pts)).toBe(true)
    expect(pts).toHaveLength(4)
    expect(pts[0]).toEqual({ x: 269, y: 144 })
    expect(pts.at(-1)).toEqual({ x: 399, y: 294 })
    expect(pts[1]?.x).toBe(pts[2]?.x)
    expect(pts[1]?.x).toBeGreaterThan(269)
    expect(pts[1]?.x).toBeLessThan(399)
  })

  it('draws a single straight run when the ends are level', () => {
    const level: Rect = { ...boxB, top: 100 }
    const pts = routeArrow({ tail: out(boxA), head: inp(level) })
    expect(pts).toEqual([{ x: 269, y: 144 }, { x: 399, y: 144 }])
  })

  it('routes output to control H-V with the vertical on the control slot', () => {
    const pts = routeArrow({ tail: out(boxA), head: ctl(boxB) })
    expect(pts).toEqual([{ x: 269, y: 144 }, { x: 484, y: 144 }, { x: 484, y: 249 }])
  })

  it('sends control feedback up and over, above both boxes', () => {
    const tail = out(boxB)
    const head = ctl(boxA)
    expect(feedbackKind(tail, head)).toBe('over')
    const pts = routeArrow({ tail, head })
    expect(axisAligned(pts)).toBe(true)
    const top = Math.min(...pts.map((p) => p.y))
    expect(top).toBeLessThan(boxA.top - 20)
    expect(pts.at(-1)).toEqual(head.point)
    // The last run drops straight into the top slot.
    expect(pts.at(-2)?.x).toBe(head.point.x)
  })

  it('sends input feedback down and under, below both boxes, entering through the left stub', () => {
    const tail = out(boxB)
    const head = inp(boxA)
    expect(feedbackKind(tail, head)).toBe('under')
    const pts = routeArrow({ tail, head })
    const bottom = Math.max(...pts.map((p) => p.y))
    expect(bottom).toBeGreaterThan(boxB.top + boxB.height + 20)
    expect(pts.at(-2)).toEqual({ x: head.point.x - 16, y: head.point.y })
  })

  it('routes output to mechanism around the bottom: right, down, across, up', () => {
    const pts = routeArrow({ tail: out(boxA), head: mech(boxB) })
    expect(axisAligned(pts)).toBe(true)
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(boxB.top + boxB.height)
    expect(pts.at(-2)?.x).toBe(pts.at(-1)?.x)
    expect(pts.at(-2)!.y).toBeGreaterThan(pts.at(-1)!.y)
  })

  it('gives parallel feedback arrows distinct lanes', () => {
    const tail = out(boxB)
    const head = ctl(boxA)
    const a = routeArrow({ tail, head, lane: 0 })
    const b = routeArrow({ tail, head, lane: 1 })
    expect(Math.min(...b.map((p) => p.y))).toBeLessThan(Math.min(...a.map((p) => p.y)))
    expect(Math.min(...a.map((p) => p.y)) - Math.min(...b.map((p) => p.y))).toBe(12)
  })

  it('routes a port straight into an aligned side and with one short bend otherwise', () => {
    const port: RouteEnd = { point: { x: 24, y: 144 }, dir: 'E', port: true }
    expect(routeArrow({ tail: port, head: inp(boxA) })).toEqual([{ x: 24, y: 144 }, { x: 99, y: 144 }])
    const low: RouteEnd = { point: { x: 24, y: 300 }, dir: 'E', port: true }
    const pts = routeArrow({ tail: low, head: inp(boxA) })
    expect(pts).toHaveLength(4)
    expect(pts[1]?.x).toBe(48)
    const top: RouteEnd = { point: { x: 184, y: 64 }, dir: 'S', port: true }
    expect(routeArrow({ tail: top, head: ctl(boxA) })).toEqual([{ x: 184, y: 64 }, { x: 184, y: 99 }])
    const bottom: RouteEnd = { point: { x: 184, y: 696 }, dir: 'N', port: true }
    expect(routeArrow({ tail: bottom, head: mech(boxA) })).toEqual([{ x: 184, y: 696 }, { x: 184, y: 189 }])
  })

  it('routes an output to a boundary output port with one bend when not level', () => {
    const port: RouteEnd = { point: { x: 1000, y: 454 }, dir: 'W', port: true }
    const pts = routeArrow({ tail: out(boxB), head: port })
    expect(axisAligned(pts)).toBe(true)
    expect(pts).toHaveLength(4)
    expect(pts.at(-1)).toEqual({ x: 1000, y: 454 })
  })

  it('never produces diagonals or repeated points across a grid of box positions', () => {
    const tails = [out(boxA), out(boxB)]
    const heads = [inp(boxA), inp(boxB), ctl(boxA), ctl(boxB), mech(boxA), mech(boxB)]
    for (const tail of tails) {
      for (const head of heads) {
        const pts = routeArrow({ tail, head })
        expect(axisAligned(pts)).toBe(true)
        expect(noRepeats(pts)).toBe(true)
        expect(pts[0]).toEqual(tail.point)
        expect(pts.at(-1)).toEqual(head.point)
      }
    }
  })

  it('keeps the ends one unit outside the boxes', () => {
    expect(slotPoint(boxA, 'left', 0, 1).x).toBe(boxA.left - 1)
    expect(slotPoint(boxA, 'right', 0, 1).x).toBe(boxA.left + boxA.width + 1)
    expect(slotPoint(boxA, 'top', 0, 1).y).toBe(boxA.top - 1)
    expect(slotPoint(boxA, 'bottom', 0, 1).y).toBe(boxA.top + boxA.height + 1)
  })
})

describe('routeBranch', () => {
  const trunk: Point[] = [{ x: 204, y: 64 }, { x: 204, y: 109 }]

  it('forks sideways off a vertical trunk, 16 below its start, then down to the control', () => {
    const head = ctl({ left: 400, top: 260, width: 168, height: 88 })
    expect(routeBranch(trunk, head)).toEqual([{ x: 204, y: 80 }, { x: 484, y: 80 }, { x: 484, y: 259 }])
  })

  it('prefers extending a horizontal run of the trunk for a second branch', () => {
    const first = [{ x: 204, y: 80 }, { x: 484, y: 80 }, { x: 484, y: 259 }]
    const head = ctl({ left: 680, top: 410, width: 168, height: 88 })
    expect(routeBranch(first, head)).toEqual([{ x: 484, y: 80 }, { x: 764, y: 80 }, { x: 764, y: 409 }])
  })

  it('drops straight from a horizontal trunk run above the target', () => {
    const horizontal = [{ x: 100, y: 80 }, { x: 600, y: 80 }]
    const head = ctl({ left: 300, top: 200, width: 168, height: 88 })
    expect(routeBranch(horizontal, head)).toEqual([{ x: 384, y: 80 }, { x: 384, y: 199 }])
  })

  it('reaches an input from a vertical trunk run left of the box', () => {
    const vertical = [{ x: 50, y: 60 }, { x: 50, y: 300 }]
    const head = inp({ left: 300, top: 200, width: 168, height: 88 })
    expect(routeBranch(vertical, head)).toEqual([{ x: 50, y: 244 }, { x: 299, y: 244 }])
  })
})

describe('segments and trimming', () => {
  it('finds the longest run, oriented west-to-east or north-to-south', () => {
    expect(longestSegment([{ x: 100, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 20 }])).toEqual([{ x: 0, y: 10 }, { x: 100, y: 10 }])
    expect(longestSegment([{ x: 5, y: 90 }, { x: 5, y: 0 }])).toEqual([{ x: 5, y: 0 }, { x: 5, y: 90 }])
  })

  it('trims the ends along their last run but never past it', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    expect(trimEnd(line, 10).at(-1)).toEqual({ x: 90, y: 0 })
    expect(trimStart(line, 10)[0]).toEqual({ x: 10, y: 0 })
    expect(trimEnd([{ x: 0, y: 0 }, { x: 4, y: 0 }], 10).at(-1)).toEqual({ x: 1, y: 0 })
  })
})
