/**
 * Edge routing without obstacle avoidance (spec 03 §3.3): ends are re-attached every layout
 * pass, interior vertices stay where the user put them.
 *
 * - Oblique / curve / direct: ends aim at the adjacent vertex (or the other node's center).
 * - Rectilinear / rounded: axis-aligned polyline; ends attach orthogonally, vertices next to an
 *   end are realigned when needed, then the polyline is cleaned up.
 * - Self loops (tail = head) with fewer than 4 bends get the default loop and are rectilinear.
 *
 * All returned points are rounded to integers.
 */
import {
  distancePointToSegment,
  inflateRect,
  pointsEqual,
  rectContainsPoint,
  rectRight,
  roundPoint,
  type Point,
  type Rect
} from './geometry'
import {
  JUNCTION_MARGIN,
  junctionCenter,
  shapeJunction,
  shapeOrthogonalJunction,
  type EdgeEndpoint
} from './junction'
import { LineStyle, OBLIQUE_SIMPLIFY_TOLERANCE, isRectilinearStyle } from './style'

export type SegmentOrientation = 'horizontal' | 'vertical' | 'oblique'

/** Orientation of segment `a`–`b`. A zero-length segment counts as horizontal. */
export function segmentOrientation(a: Point, b: Point): SegmentOrientation {
  if (a.y === b.y) return 'horizontal'
  if (a.x === b.x) return 'vertical'
  return 'oblique'
}

function endpointCenter(end: EdgeEndpoint): Point {
  return junctionCenter(end.box)
}

// ---------------------------------------------------------------------------
// Point list clean-up helpers
// ---------------------------------------------------------------------------

/** Removes consecutive duplicate points (keeps the first and last point). */
export function removeDuplicatePoints(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || !pointsEqual(last, p)) out.push({ x: p.x, y: p.y })
  }
  // A polyline that collapsed to a single point keeps both ends.
  if (out.length === 1 && points.length > 1) out.push({ ...(points[points.length - 1] as Point) })
  return out
}

/** Removes the middle point of every three consecutive collinear axis-aligned points. */
export function removeCollinearPoints(points: readonly Point[]): Point[] {
  const out: Point[] = points.map((p) => ({ x: p.x, y: p.y }))
  let i = 1
  while (i < out.length - 1) {
    const a = out[i - 1] as Point
    const b = out[i] as Point
    const c = out[i + 1] as Point
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
      out.splice(i, 1)
      if (i > 1) i--
    } else {
      i++
    }
  }
  return out
}

/**
 * Converts every oblique segment into an "L" by inserting a corner: `(a.x, max(a.y, b.y))`,
 * or `(b.x, a.y)` when that corner would be level with `a` (a is the lower point).
 */
export function rectilinearize(points: readonly Point[]): Point[] {
  if (points.length === 0) return []
  const out: Point[] = [{ ...(points[0] as Point) }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    if (segmentOrientation(a, b) === 'oblique') out.push(lCorner(a, b))
    out.push({ x: b.x, y: b.y })
  }
  return out
}

function lCorner(a: Point, b: Point): Point {
  const y = Math.max(a.y, b.y)
  return y === a.y ? { x: b.x, y: a.y } : { x: a.x, y }
}

/**
 * Oblique simplification after a user edit: removes interior vertices that lie within
 * `tolerance` of the segment joining their neighbours.
 */
export function simplifyOblique(points: readonly Point[], tolerance = OBLIQUE_SIMPLIFY_TOLERANCE): Point[] {
  const out = removeDuplicatePoints(points)
  let i = 1
  while (i < out.length - 1) {
    if (distancePointToSegment(out[i] as Point, out[i - 1] as Point, out[i + 1] as Point) <= tolerance) {
      out.splice(i, 1)
      if (i > 1) i--
    } else {
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Oblique routing
// ---------------------------------------------------------------------------

/**
 * Re-attaches the ends of an oblique (or curve/direct) edge. With no interior vertices the ends
 * aim at each other's centers; otherwise at the adjacent interior vertex.
 */
export function routeOblique(points: readonly Point[], tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  const interior = points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
  const tailRef = interior[0] ?? endpointCenter(head)
  const headRef = interior[interior.length - 1] ?? endpointCenter(tail)
  const p0 = shapeJunction(tail, tailRef)
  const pn = shapeJunction(head, headRef)
  return [p0, ...interior, pn].map(roundPoint)
}

// ---------------------------------------------------------------------------
// Rectilinear routing
// ---------------------------------------------------------------------------

/**
 * Route for a new rectilinear edge. A straight horizontal/vertical segment is used when the
 * boxes overlap on one axis; otherwise an "L" through both centers (corner rule of
 * `rectilinearize`), attached and cleaned up.
 *
 * Deliberate deviation: the reference starts the "L" from the oblique junction points, which
 * often makes the second leg run along the head's border; starting from the centers attaches the
 * second leg at the middle of the head's side.
 */
export function initialRectilinearRoute(tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  return cleanupRectilinear(straightOrL(tail, head), tail, head)
}

function straightOrL(tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  const ct = endpointCenter(tail)
  const ch = endpointCenter(head)
  // Straight: the head center lies in the tail's span, or the tail center in the head's span.
  const t = shapeOrthogonalJunction(tail, ch)
  if (t) {
    const h = shapeOrthogonalJunction(head, t)
    if (h && segmentOrientation(t, h) !== 'oblique') return [t, h]
  }
  const h = shapeOrthogonalJunction(head, ct)
  if (h) {
    const t2 = shapeOrthogonalJunction(tail, h)
    if (t2 && segmentOrientation(t2, h) !== 'oblique') return [t2, h]
  }
  // "L" through both centers; use the other corner when the first falls inside a box.
  let corner = lCorner(ct, ch)
  if (insideEndpoint(corner, tail) || insideEndpoint(corner, head)) {
    corner = corner.x === ct.x ? { x: ch.x, y: ct.y } : { x: ct.x, y: ch.y }
  }
  return [ct, corner, ch]
}

/** Moves `p` onto the endpoint's center line, keeping the orientation of segment `p`–`other`. */
function alignWithCenter(p: Point, other: Point, end: EdgeEndpoint): Point {
  const c = endpointCenter(end)
  return segmentOrientation(p, other) === 'horizontal' ? { x: c.x, y: p.y } : { x: p.x, y: c.y }
}

/**
 * Re-attaches both ends of an axis-aligned polyline (spec 03 §3.3 step 2). Interior vertices next
 * to an end are realigned with that end's center when no orthogonal junction exists. A two-point
 * edge without a junction gets an extra bend.
 */
export function attachRectilinearEnds(points: readonly Point[], tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  let pts = points.map((p) => ({ x: p.x, y: p.y }))
  if (pts.length < 2) pts = straightOrL(tail, head)

  if (pts.length === 2) {
    const t = shapeOrthogonalJunction(tail, pts[1] as Point)
    if (t) {
      const h = shapeOrthogonalJunction(head, t)
      if (h && segmentOrientation(t, h) !== 'oblique') return [t, h]
    }
    // No straight connection from the current points: insert a bend.
    pts = straightOrL(tail, head)
    if (pts.length === 2) return pts
  }

  const n = pts.length
  // Tail.
  let t = shapeOrthogonalJunction(tail, pts[1] as Point)
  if (!t) {
    pts[1] = alignWithCenter(pts[1] as Point, pts[2] as Point, tail)
    t = shapeOrthogonalJunction(tail, pts[1] as Point)
  }
  pts[0] = t ?? shapeJunction(tail, pts[1] as Point)

  // Head.
  let h = shapeOrthogonalJunction(head, pts[n - 2] as Point)
  if (!h) {
    pts[n - 2] = alignWithCenter(pts[n - 2] as Point, pts[n - 3] as Point, head)
    h = shapeOrthogonalJunction(head, pts[n - 2] as Point)
    if (n === 3) {
      // The shared vertex moved: re-attach the tail to it.
      pts[0] = shapeOrthogonalJunction(tail, pts[1] as Point) ?? shapeJunction(tail, pts[1] as Point)
    }
  }
  pts[n - 1] = h ?? shapeJunction(head, pts[n - 2] as Point)
  return pts
}

/** True when `p` falls inside the endpoint box (enlarged by the junction margin). */
function insideEndpoint(p: Point, end: EdgeEndpoint): boolean {
  if (end.outline === 'point') return false
  return rectContainsPoint(inflateRect(end.box, JUNCTION_MARGIN), p)
}

/** Maximum clean-up passes before falling back to a fresh route. */
const MAX_CLEANUP_PASSES = 4

function isSettled(pts: readonly Point[], tail: EdgeEndpoint, head: EdgeEndpoint): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentOrientation(pts[i] as Point, pts[i + 1] as Point) === 'oblique') return false
  }
  for (let i = 1; i < pts.length - 1; i++) {
    if (insideEndpoint(pts[i] as Point, tail) || insideEndpoint(pts[i] as Point, head)) return false
  }
  // Both ends must be the attachment computed from their current neighbour (removing a
  // collinear point can change the neighbour after the ends were attached).
  const n = pts.length
  if (n < 2) return false
  const t = shapeOrthogonalJunction(tail, pts[1] as Point)
  const h = shapeOrthogonalJunction(head, pts[n - 2] as Point)
  return t !== null && h !== null && pointsEqual(roundPoint(t), pts[0] as Point) && pointsEqual(roundPoint(h), pts[n - 1] as Point)
}

function tidy(pts: readonly Point[]): Point[] {
  return removeCollinearPoints(removeDuplicatePoints(pts.map(roundPoint)))
}

/**
 * Rectilinear clean-up (spec 03 §3.3 step 3): remove repeated points, remove the middle of
 * collinear axis-aligned triples, remove interior points inside the tail or head box, re-attach
 * the ends, round to integers.
 *
 * Removing a point can leave an oblique segment, so the pass re-inserts "L" corners and repeats
 * until the route is axis-aligned with no interior point inside an end box. If that does not
 * settle within a few passes the user's bends are dropped and a fresh route is used.
 */
export function cleanupRectilinear(points: readonly Point[], tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  let pts = points.map((p) => ({ x: p.x, y: p.y }))
  for (let pass = 0; pass < MAX_CLEANUP_PASSES; pass++) {
    pts = removeCollinearPoints(removeDuplicatePoints(pts))
    const n = pts.length
    pts = pts.filter((p, i) => i === 0 || i === n - 1 || (!insideEndpoint(p, tail) && !insideEndpoint(p, head)))
    pts = tidy(attachRectilinearEnds(rectilinearize(pts), tail, head))
    if (isSettled(pts, tail, head)) return pts
  }
  return tidy(attachRectilinearEnds(straightOrL(tail, head), tail, head))
}

/**
 * Full rectilinear routing pass: converts any oblique segments into "L"s, re-attaches the ends
 * and cleans up. Accepts any polyline (e.g. an oblique edge switched to rectilinear).
 */
export function routeRectilinear(points: readonly Point[], tail: EdgeEndpoint, head: EdgeEndpoint): Point[] {
  if (points.length < 2) return initialRectilinearRoute(tail, head)
  return cleanupRectilinear(points.map(roundPoint), tail, head)
}

// ---------------------------------------------------------------------------
// Self loops
// ---------------------------------------------------------------------------

/** Distance the default self loop rises above the node, and extends right of it. */
export const SELF_LOOP_RISE = 20
export const SELF_LOOP_REACH = 30

/**
 * Default self loop: out of the top edge, right, down, back into the right edge.
 * Center → up by h/2 + 20 → right to cx + w/2 + 30 → down to cy → back to the center, with the
 * ends clipped to the box.
 */
export function selfLoopRoute(box: Rect): Point[] {
  const c = junctionCenter(box)
  const upY = c.y - box.height / 2 - SELF_LOOP_RISE
  const rightX = c.x + box.width / 2 + SELF_LOOP_REACH
  const b = inflateRect(box, JUNCTION_MARGIN)
  return [
    { x: c.x, y: b.top },
    { x: c.x, y: upY },
    { x: rightX, y: upY },
    { x: rightX, y: c.y },
    { x: rectRight(b), y: c.y }
  ].map(roundPoint)
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface RouteEdgeInput {
  lineStyle: LineStyle
  /** Current stored points (may be empty for a new edge). */
  points: readonly Point[]
  tail: EdgeEndpoint
  head: EdgeEndpoint
  /** True when tail and head are the same view. */
  selfLoop?: boolean
}

export interface RouteEdgeResult {
  points: Point[]
  /** The line style to store (self loops are forced to rectilinear). */
  lineStyle: LineStyle
}

/** Routes an edge according to its line style (one layout pass). */
export function routeEdge(input: RouteEdgeInput): RouteEdgeResult {
  const { points, tail, head } = input
  if (input.selfLoop) {
    const bends = Math.max(0, points.length - 2)
    if (bends < 4) return { points: selfLoopRoute(tail.box), lineStyle: LineStyle.Rectilinear }
    const style = isRectilinearStyle(input.lineStyle) ? input.lineStyle : LineStyle.Rectilinear
    return { points: routeRectilinear(points, tail, head), lineStyle: style }
  }
  if (isRectilinearStyle(input.lineStyle)) {
    return { points: routeRectilinear(points, tail, head), lineStyle: input.lineStyle }
  }
  return { points: routeOblique(points, tail, head), lineStyle: input.lineStyle }
}
