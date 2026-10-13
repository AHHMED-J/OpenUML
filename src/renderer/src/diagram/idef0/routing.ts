/**
 * Orthogonal routing of IDEF0 arrows (spec 11 §3.2). Pure: ends in, axis-aligned point list out.
 *
 * An end is an attachment point plus the outward normal at that point (away from the box, or into
 * the drawing area for a boundary port). Shapes follow the standard's conventions: forward arrows
 * run H-V-H, control feedback goes "up and over", input and mechanism feedback goes "down and
 * under", and every first and last run leaves room for heads, parentheses and codes.
 */
import { removeCollinearPoints, removeDuplicatePoints, type Point, type Rect } from '../core'
import { dirVector, isHorizontal, type Dir } from './geometry'

/** One end of an arrow. */
export interface RouteEnd {
  readonly point: Point
  /** Outward normal at the attachment. */
  readonly dir: Dir
  /** The function box of this end (null for ports); used to run feedback lanes around it. */
  readonly box?: Rect | null
  /** A boundary port: its first run stays short. */
  readonly port?: boolean
}

export interface RouteInput {
  readonly tail: RouteEnd
  readonly head: RouteEnd
  /** Extra lane for feedback arrows crossing the same channel (0 = closest to the boxes). */
  readonly lane?: number
}

/** Shortest first/last run; the elbow clearance of a bend (radius 8 each side). */
export const STUB = 24
const ELBOW = 16
const LANE_GAP = 12
const FEEDBACK_CLEARANCE = 24

const r8 = (n: number): number => Math.round(n / 8) * 8

function clean(points: Point[]): Point[] {
  return removeCollinearPoints(removeDuplicatePoints(points))
}

/** Which way an arrow loops back when its head lies behind its tail; null for forward arrows. */
export type FeedbackKind = 'over' | 'under'

/** Classification of a route: the arrow loops over the top, under the bottom, or goes straight on. */
export function feedbackKind(tail: RouteEnd, head: RouteEnd): FeedbackKind | null {
  const a = tail.point
  const b = head.point
  if (tail.dir === 'E' && head.dir === 'W') return b.x - a.x >= ELBOW ? null : 'under'
  if (tail.dir === 'E' && head.dir === 'N') return b.x >= a.x + ELBOW && b.y >= a.y + ELBOW ? null : 'over'
  if (tail.dir === 'E' && head.dir === 'S') return 'under'
  return null
}

function bottomOf(...ends: RouteEnd[]): number {
  const values = ends.map((e) => (e.box ? e.box.top + e.box.height : e.point.y))
  return Math.max(...values)
}

function topOf(...ends: RouteEnd[]): number {
  const values = ends.map((e) => (e.box ? e.box.top : e.point.y))
  return Math.min(...values)
}

/** Fallback: leave and arrive along the normals through two stubs, joined by an elbow or a Z. */
function generic(tail: RouteEnd, head: RouteEnd): Point[] {
  const a = tail.point
  const b = head.point
  const va = dirVector(tail.dir)
  const vb = dirVector(head.dir)
  const p1 = { x: a.x + va.x * STUB, y: a.y + va.y * STUB }
  const q1 = { x: b.x + vb.x * STUB, y: b.y + vb.y * STUB }
  const middle: Point[] = isHorizontal(tail.dir) === isHorizontal(head.dir)
    ? isHorizontal(tail.dir)
      ? [{ x: r8((p1.x + q1.x) / 2), y: p1.y }, { x: r8((p1.x + q1.x) / 2), y: q1.y }]
      : [{ x: p1.x, y: r8((p1.y + q1.y) / 2) }, { x: q1.x, y: r8((p1.y + q1.y) / 2) }]
    : isHorizontal(tail.dir)
      ? [{ x: q1.x, y: p1.y }]
      : [{ x: p1.x, y: q1.y }]
  return clean([a, p1, ...middle, q1, b])
}

/**
 * Routes an arrow from `tail` to `head`.
 * - E to W: H-V-H through the channel between the boxes, straight when level; feedback runs down and under.
 * - E to N (control): H-V; feedback runs up and over, in lane `lane`.
 * - E to S (mechanism): right, down below both boxes, across, up into the bottom slot.
 * - Port to side: straight when aligned, else one short bend inside the first run.
 */
export function routeArrow({ tail, head, lane = 0 }: RouteInput): Point[] {
  const a = tail.point
  const b = head.point
  const td = tail.dir
  const hd = head.dir

  if (td === 'E' && hd === 'W') {
    if (b.x - a.x >= ELBOW) {
      if (a.y === b.y) return [a, b]
      const mid = tail.port ? a.x + Math.round(Math.min(STUB, (b.x - a.x) / 2)) : r8((a.x + b.x) / 2)
      const xm = Math.max(a.x + 8, Math.min(b.x - 8, mid))
      return clean([a, { x: xm, y: a.y }, { x: xm, y: b.y }, b])
    }
    const yb = bottomOf(tail, head) + FEEDBACK_CLEARANCE + LANE_GAP * lane
    return clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yb }, { x: b.x - ELBOW, y: yb }, { x: b.x - ELBOW, y: b.y }, b])
  }
  if (td === 'E' && hd === 'N') {
    if (b.x >= a.x + ELBOW && b.y >= a.y + ELBOW) return clean([a, { x: b.x, y: a.y }, b])
    const yt = topOf(tail, head) - FEEDBACK_CLEARANCE - LANE_GAP * lane
    return clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yt }, { x: b.x, y: yt }, b])
  }
  if (td === 'E' && hd === 'S') {
    const yb = bottomOf(tail, head) + FEEDBACK_CLEARANCE + LANE_GAP * lane
    return clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yb }, { x: b.x, y: yb }, b])
  }
  if (td === 'S' && hd === 'N') {
    if (a.x === b.x && b.y > a.y) return [a, b]
    if (b.y - a.y >= 2 * ELBOW) {
      const ym = a.y + Math.round(Math.min(STUB, (b.y - a.y) / 2))
      return clean([a, { x: a.x, y: ym }, { x: b.x, y: ym }, b])
    }
  }
  if (td === 'S' && hd === 'W' && b.x >= a.x + ELBOW && b.y >= a.y + ELBOW) return clean([a, { x: a.x, y: b.y }, b])
  if (td === 'N' && hd === 'S') {
    if (a.x === b.x && b.y < a.y) return [a, b]
    if (a.y - b.y >= 2 * ELBOW) {
      const ym = a.y - Math.round(Math.min(STUB, (a.y - b.y) / 2))
      return clean([a, { x: a.x, y: ym }, { x: b.x, y: ym }, b])
    }
  }
  if (td === 'N' && hd === 'W' && b.x >= a.x + ELBOW && b.y <= a.y - ELBOW) return clean([a, { x: a.x, y: b.y }, b])
  if (td === 'E' && hd === 'E' && b.x === a.x) return [a, b]
  return generic(tail, head)
}

function segments(points: readonly Point[]): Array<{ a: Point; b: Point; horizontal: boolean }> {
  const out: Array<{ a: Point; b: Point; horizontal: boolean }> = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    if (a.x === b.x && a.y === b.y) continue
    out.push({ a, b, horizontal: a.y === b.y })
  }
  return out
}

/**
 * Route of a fork branch: from a point of the `trunk` polyline, perpendicular to it, to the
 * attachment `head`. Horizontal arrivals leave vertical trunk runs (and vice versa); runs of the
 * right orientation are preferred, extended collinearly when the head lies beyond their end. For
 * a join, route the other end the same way and reverse the result.
 */
export function routeBranch(trunk: readonly Point[], head: RouteEnd): Point[] {
  const b = head.point
  const arrivesVertically = !isHorizontal(head.dir)
  const segs = segments(trunk)
  type Candidate = { points: Point[]; cost: number }
  let best: Candidate | null = null
  const consider = (points: Point[], cost: number): void => {
    if (!best || cost < best.cost) best = { points: clean(points), cost }
  }
  const forward = (value: number, target: number): boolean =>
    head.dir === 'N' || head.dir === 'W' ? value < target - 8 : value > target + 8

  // Preferred: trunk runs parallel to the final run's cross axis, extended as needed.
  for (const s of segs.filter((x) => x.horizontal === arrivesVertically)) {
    if (arrivesVertically) {
      const ys = s.a.y
      if (!forward(ys, b.y)) continue
      const ax = Math.max(Math.min(s.a.x, s.b.x), Math.min(Math.max(s.a.x, s.b.x), b.x))
      consider([{ x: ax, y: ys }, { x: b.x, y: ys }, b], Math.abs(b.x - ax) + Math.abs(b.y - ys))
    } else {
      const xs = s.a.x
      if (!forward(xs, b.x)) continue
      const ay = Math.max(Math.min(s.a.y, s.b.y), Math.min(Math.max(s.a.y, s.b.y), b.y))
      consider([{ x: xs, y: ay }, { x: xs, y: b.y }, b], Math.abs(b.y - ay) + Math.abs(b.x - xs))
    }
  }
  if (best) return (best as Candidate).points
  // Otherwise leave a perpendicular trunk run sideways, 16 beyond its start.
  for (const s of segs.filter((x) => x.horizontal !== arrivesVertically)) {
    if (arrivesVertically) {
      const lo = Math.min(s.a.y, s.b.y)
      const hi = Math.max(s.a.y, s.b.y)
      const yh = Math.max(lo + 8, Math.min(hi - 8, lo + 16))
      if (!forward(yh, b.y)) continue
      consider([{ x: s.a.x, y: yh }, { x: b.x, y: yh }, b], Math.abs(b.x - s.a.x) + Math.abs(b.y - yh))
    } else {
      const lo = Math.min(s.a.x, s.b.x)
      const hi = Math.max(s.a.x, s.b.x)
      const xh = Math.max(lo + 8, Math.min(hi - 8, lo + 16))
      if (!forward(xh, b.x)) continue
      consider([{ x: xh, y: s.a.y }, { x: xh, y: b.y }, b], Math.abs(b.y - s.a.y) + Math.abs(b.x - xh))
    }
  }
  if (best) return (best as Candidate).points
  // Degenerate trunk or no valid run: straight from its nearest point.
  const first = trunk[0] ?? b
  return clean([first, arrivesVertically ? { x: first.x, y: b.y } : { x: b.x, y: first.y }, b])
}

/** Length of the longest straight run and its endpoints, oriented west-to-east / north-to-south. */
export function longestSegment(points: readonly Point[]): [Point, Point] | null {
  let best: [Point, Point] | null = null
  let bestLen = -1
  for (const s of segments(points)) {
    const len = Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y)
    if (len > bestLen) {
      bestLen = len
      const forwardOrder = s.horizontal ? s.a.x <= s.b.x : s.a.y <= s.b.y
      best = forwardOrder ? [s.a, s.b] : [s.b, s.a]
    }
  }
  return best
}

/** Moves the last point back along its run by `distance` (no more than the run allows). */
export function trimEnd(points: readonly Point[], distance: number): Point[] {
  return trim(points.map((p) => ({ ...p })), distance, 'end')
}

export function trimStart(points: readonly Point[], distance: number): Point[] {
  return trim(points.map((p) => ({ ...p })), distance, 'start')
}

function trim(points: Point[], distance: number, which: 'start' | 'end'): Point[] {
  if (points.length < 2) return points
  const i = which === 'end' ? points.length - 1 : 0
  const j = which === 'end' ? points.length - 2 : 1
  const p = points[i] as Point
  const q = points[j] as Point
  const len = Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
  const d = Math.min(distance, Math.max(0, len - 1))
  if (len === 0) return points
  points[i] = { x: p.x + (Math.sign(q.x - p.x) * d), y: p.y + (Math.sign(q.y - p.y) * d) }
  return points
}
