/**
 * Edge end attachment ("junction") to node bounds (spec 03 §3.2).
 *
 * All junctions are computed against the node box enlarged by `JUNCTION_MARGIN` (1 unit) on
 * every side, so edge ends stop just outside the node's stroke.
 */
import {
  EPSILON,
  diamondBorderPointToward,
  ellipseBorderPointToward,
  inflateRect,
  rectBottom,
  rectCenter,
  rectContainsPoint,
  rectRight,
  type Point,
  type Rect
} from './geometry'

/** Node boxes are enlarged by this much before computing junctions. */
export const JUNCTION_MARGIN = 1

/**
 * Outline used to clip edge ends:
 * - `rect`: the bounding box (reference behavior for every node).
 * - `ellipse`: true ellipse/circle outline (use cases, initial/final nodes, interface balls).
 * - `diamond`: true diamond outline (decision/merge).
 * - `point`: a zero-size target (e.g. another edge's middle segment); the junction is the point.
 */
export type NodeOutline = 'rect' | 'ellipse' | 'diamond' | 'point'

/** One end of an edge: the attached view's box and the outline to clip against. */
export interface EdgeEndpoint {
  box: Rect
  outline?: NodeOutline
}

/** Integer center used by junctions (center of the box, floored). */
export function junctionCenter(box: Rect): Point {
  const c = rectCenter(box)
  return { x: Math.floor(c.x), y: Math.floor(c.y) }
}

/**
 * Orthogonal (rectilinear) junction: the point on the enlarged box border reached by a
 * horizontal or vertical segment from `p`, or `null` when no axis-aligned segment from `p`
 * can reach the box.
 */
export function orthogonalJunction(box: Rect, p: Point, margin = JUNCTION_MARGIN): Point | null {
  const b = inflateRect(box, margin)
  const left = b.left
  const right = rectRight(b)
  const top = b.top
  const bottom = rectBottom(b)
  const c = rectCenter(b)
  if (p.x > left && p.x < right) return { x: p.x, y: p.y < c.y ? top : bottom }
  if (p.y > top && p.y < bottom) return { x: p.x < c.x ? left : right, y: p.y }
  if (p.x === left || p.x === right) return { x: p.x, y: p.y < c.y ? top : bottom }
  if (p.y === top || p.y === bottom) return { x: p.x < c.x ? left : right, y: p.y }
  return null
}

/**
 * Oblique junction (reference behavior): the point where the line from the box center toward
 * `p` leaves the enlarged box. When `p` shares an x or y with the center the orthogonal
 * junction is used; when `p` is inside the box the center is returned.
 */
export function obliqueJunction(box: Rect, p: Point, margin = JUNCTION_MARGIN): Point {
  const b = inflateRect(box, margin)
  const c = junctionCenter(box)
  if (p.x === c.x || p.y === c.y) {
    const o = orthogonalJunction(box, p, margin)
    if (o) return o
  }
  if (rectContainsPoint(b, p)) return c
  const d = { x: p.x - c.x, y: p.y - c.y }
  const candidates: number[] = []
  if (Math.abs(d.x) > EPSILON) {
    candidates.push((b.left - c.x) / d.x, (rectRight(b) - c.x) / d.x)
  }
  if (Math.abs(d.y) > EPSILON) {
    candidates.push((b.top - c.y) / d.y, (rectBottom(b) - c.y) / d.y)
  }
  let best: Point | null = null
  let bestT = Infinity
  for (const t of candidates) {
    if (t < -EPSILON || t > 1 + EPSILON || t >= bestT) continue
    const q = { x: c.x + d.x * t, y: c.y + d.y * t }
    if (rectContainsPoint(b, q, 1e-6)) {
      best = q
      bestT = t
    }
  }
  return best ?? c
}

/**
 * Junction toward `p` honoring the endpoint's outline. Rect outlines use the reference oblique
 * junction; ellipse and diamond outlines clip to the true shape (OpenUML improvement); point
 * targets return the point itself.
 */
export function shapeJunction(end: EdgeEndpoint, p: Point, margin = JUNCTION_MARGIN): Point {
  const outline = end.outline ?? 'rect'
  switch (outline) {
    case 'point':
      return rectCenter(end.box)
    case 'ellipse':
      return ellipseBorderPointToward(inflateRect(end.box, margin), p)
    case 'diamond':
      return diamondBorderPointToward(inflateRect(end.box, margin), p)
    default:
      return obliqueJunction(end.box, p, margin)
  }
}

/**
 * Orthogonal junction honoring the endpoint's outline: the axis-aligned attachment found on
 * the bounding box is slid along its axis onto the ellipse/diamond outline, so the final
 * segment stays horizontal or vertical. Point targets attach only when `p` shares x or y.
 */
export function shapeOrthogonalJunction(end: EdgeEndpoint, p: Point, margin = JUNCTION_MARGIN): Point | null {
  const outline = end.outline ?? 'rect'
  if (outline === 'point') {
    const c = rectCenter(end.box)
    return p.x === c.x || p.y === c.y ? c : null
  }
  const j = orthogonalJunction(end.box, p, margin)
  if (!j || outline === 'rect') return j
  const b = inflateRect(end.box, margin)
  const c = rectCenter(b)
  const hw = b.width / 2
  const hh = b.height / 2
  if (hw < EPSILON || hh < EPSILON) return j
  const vertical = j.y === b.top || j.y === rectBottom(b)
  if (vertical) {
    const dx = Math.min(1, Math.abs(j.x - c.x) / hw)
    const dy = outline === 'ellipse' ? hh * Math.sqrt(1 - dx * dx) : hh * (1 - dx)
    return { x: j.x, y: j.y < c.y ? c.y - dy : c.y + dy }
  }
  const dy = Math.min(1, Math.abs(j.y - c.y) / hh)
  const dx = outline === 'ellipse' ? hw * Math.sqrt(1 - dy * dy) : hw * (1 - dy)
  return { x: j.x < c.x ? c.x - dx : c.x + dx, y: j.y }
}

/**
 * Edge-to-edge attachment target (e.g. an association-class link): the center of the host
 * edge's middle segment `points[floor((n−1)/2)]`→next, as a zero-size `point` endpoint.
 */
export function edgeAsEndpoint(points: readonly Point[]): EdgeEndpoint {
  const c = edgeMiddleSegmentCenter(points)
  return { box: { left: c.x, top: c.y, width: 0, height: 0 }, outline: 'point' }
}

/** Center of an edge's middle segment (floored); the point itself for a single-point edge. */
export function edgeMiddleSegmentCenter(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const i = Math.floor((points.length - 1) / 2)
  const a = points[i] as Point
  const b = points[Math.min(i + 1, points.length - 1)] as Point
  return { x: Math.floor((a.x + b.x) / 2), y: Math.floor((a.y + b.y) / 2) }
}
