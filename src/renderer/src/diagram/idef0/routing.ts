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
  /**
   * User hint for the adjustable run of the route (the y of a horizontal run, the x of a vertical
   * one, see `RouteAdjust`); kept inside the valid range and off the boxes. Absent = automatic.
   */
  readonly hint?: RunValues
  /** Automatic value of the adjustable run chosen by the lane planner (used when there is no hint). */
  readonly preferred?: RunValues
  /** Drawing area: adjustable runs stay inside it. */
  readonly area?: Rect
  /** Function boxes a hinted run must not cross. */
  readonly obstacles?: readonly Rect[]
  /** Extra limits of the adjustable run per axis (e.g. from the branches leaving it). */
  readonly limit?: Readonly<Partial<Record<RunAxis, RunLimit>>>
}

/** Axis of an adjustable run: `y` moves a horizontal run up and down, `x` a vertical one sideways. */
export type RunAxis = 'x' | 'y'

/** A value per axis (only the axis of the route's adjustable run is used). */
export type RunValues = Readonly<Partial<Record<RunAxis, number>>>

export interface RunLimit {
  readonly min?: number
  readonly max?: number
  /** Extent of the run along its own direction (so boxes under branches extending it are avoided too). */
  readonly span?: readonly [number, number]
}

/** The run of a route the user can drag, with its current value and valid range. */
export interface RouteAdjust {
  readonly axis: RunAxis
  readonly value: number
  readonly min: number
  readonly max: number
  /** Value intervals the run may not take (it would cross a box), open at both ends. */
  readonly forbidden: ReadonlyArray<readonly [number, number]>
}

export interface RoutedArrow {
  readonly points: Point[]
  readonly adjust: RouteAdjust | null
}

/** Shortest first/last run; the elbow clearance of a bend (radius 8 each side). */
export const STUB = 24
const ELBOW = 16
const LANE_GAP = 12
const FEEDBACK_CLEARANCE = 24

const r8 = (n: number): number => Math.round(n / 8) * 8
/** Clearance between a dragged run and a box it passes. */
const BOX_CLEARANCE = 8
/** Shortest run between a dragged run and an arrowhead it leads to. */
const HEAD_CLEARANCE = 16

/**
 * The value closest to `value` inside `[min, max]` that lies in none of the `forbidden` open
 * intervals (rounded). When every value is forbidden, the clamped value.
 */
export function resolveRun(value: number, min: number, max: number, forbidden: ReadonlyArray<readonly [number, number]> = []): number {
  const clamp = (v: number): number => Math.round(Math.max(min, Math.min(max, v)))
  const free = (v: number): boolean => forbidden.every(([lo, hi]) => !(v > lo && v < hi))
  const first = clamp(value)
  if (free(first)) return first
  let best: number | null = null
  for (const c of [min, max, ...forbidden.flat()]) {
    const v = clamp(c)
    if (!free(v)) continue
    if (best === null || Math.abs(v - value) < Math.abs(best - value)) best = v
  }
  return best ?? first
}

/** Values of `axis` a run spanning `span` (along the other axis) would cross a box at. */
function forbiddenFor(axis: RunAxis, span: readonly [number, number], obstacles: readonly Rect[] = []): Array<[number, number]> {
  const lo = Math.min(span[0], span[1])
  const hi = Math.max(span[0], span[1])
  const out: Array<[number, number]> = []
  for (const r of obstacles) {
    const s0 = axis === 'y' ? r.left : r.top
    const s1 = axis === 'y' ? r.left + r.width : r.top + r.height
    if (s1 < lo || s0 > hi) continue
    const v0 = axis === 'y' ? r.top : r.left
    const v1 = axis === 'y' ? r.top + r.height : r.left + r.width
    out.push([v0 - BOX_CLEARANCE, v1 + BOX_CLEARANCE])
  }
  return out
}

/**
 * Picks the value of an adjustable run: the hint (kept valid), else the planner's preferred value,
 * else the natural one. Returns null when the range is empty (the natural route is kept as is).
 */
function runOf(input: RouteInput, axis: RunAxis, natural: number, min: number, max: number, span: readonly [number, number]): RouteAdjust | null {
  const lim = input.limit?.[axis]
  const lo = Math.max(min, lim?.min ?? Number.NEGATIVE_INFINITY)
  const hi = Math.min(max, lim?.max ?? Number.POSITIVE_INFINITY)
  if (!(lo <= hi)) return null
  const fullSpan: [number, number] = lim?.span ? [Math.min(span[0], span[1], ...lim.span), Math.max(span[0], span[1], ...lim.span)] : [span[0], span[1]]
  const forbidden = forbiddenFor(axis, fullSpan, input.obstacles)
  const hint = input.hint?.[axis]
  const preferred = input.preferred?.[axis]
  const value = hint !== undefined ? resolveRun(hint, lo, hi, forbidden) : preferred !== undefined ? resolveRun(preferred, lo, hi) : natural
  return { axis, value, min: lo, max: hi, forbidden }
}

function areaTop(input: RouteInput): number {
  return input.area ? input.area.top + BOX_CLEARANCE : Number.NEGATIVE_INFINITY
}

function areaBottom(input: RouteInput): number {
  return input.area ? input.area.top + input.area.height - BOX_CLEARANCE : Number.POSITIVE_INFINITY
}

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
 * Routes an arrow from `tail` to `head`:
 * - E to W: H-V-H through the channel between the boxes, straight when level; feedback runs down and under.
 * - E to N (control): H-V; feedback runs up and over, in lane `lane`.
 * - E to S (mechanism): right, down below both boxes, across, up into the bottom slot.
 * - Port to side: straight when aligned, else one short bend inside the first run.
 *
 * Also returns the run of the route the user can drag (`adjust`, null when the shape has none):
 * the channel of an H-V-H arrow, the lane of a feedback loop, the horizontal run of a control or
 * mechanism arrow coming from a boundary port. Without `hint` and `preferred` the points are
 * exactly the automatic route.
 */
export function routeArrowDetailed(input: RouteInput): RoutedArrow {
  const { tail, head, lane = 0 } = input
  const a = tail.point
  const b = head.point
  const td = tail.dir
  const hd = head.dir
  const done = (points: Point[], adjust: RouteAdjust | null = null): RoutedArrow => ({ points, adjust })

  if (td === 'E' && hd === 'W') {
    if (b.x - a.x >= ELBOW) {
      const ys: [number, number] = [a.y, b.y]
      if (a.y === b.y) return done([a, b])
      const mid = tail.port ? a.x + Math.round(Math.min(STUB, (b.x - a.x) / 2)) : r8((a.x + b.x) / 2)
      const natural = Math.max(a.x + 8, Math.min(b.x - 8, mid))
      const run = runOf(input, 'x', natural, a.x + 8, b.x - 8, ys)
      const xm = run?.value ?? natural
      return done(clean([a, { x: xm, y: a.y }, { x: xm, y: b.y }, b]), run)
    }
    const natural = bottomOf(tail, head) + FEEDBACK_CLEARANCE + LANE_GAP * lane
    const run = runOf(input, 'y', natural, bottomOf(tail, head) + HEAD_CLEARANCE, Math.max(natural, areaBottom(input)), [b.x - ELBOW, a.x + ELBOW])
    const yb = run?.value ?? natural
    return done(clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yb }, { x: b.x - ELBOW, y: yb }, { x: b.x - ELBOW, y: b.y }, b]), run)
  }
  if (td === 'E' && hd === 'N') {
    if (b.x >= a.x + ELBOW && b.y >= a.y + ELBOW) return done(clean([a, { x: b.x, y: a.y }, b]))
    const natural = topOf(tail, head) - FEEDBACK_CLEARANCE - LANE_GAP * lane
    const run = runOf(input, 'y', natural, Math.min(natural, areaTop(input)), topOf(tail, head) - HEAD_CLEARANCE, [a.x + ELBOW, b.x])
    const yt = run?.value ?? natural
    return done(clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yt }, { x: b.x, y: yt }, b]), run)
  }
  if (td === 'E' && hd === 'S') {
    const natural = bottomOf(tail, head) + FEEDBACK_CLEARANCE + LANE_GAP * lane
    const run = runOf(input, 'y', natural, bottomOf(tail, head) + HEAD_CLEARANCE, Math.max(natural, areaBottom(input)), [a.x + ELBOW, b.x])
    const yb = run?.value ?? natural
    return done(clean([a, { x: a.x + ELBOW, y: a.y }, { x: a.x + ELBOW, y: yb }, { x: b.x, y: yb }, b]), run)
  }
  if (td === 'S' && hd === 'N') {
    if (a.x === b.x && b.y > a.y) return done([a, b])
    if (b.y - a.y >= 2 * ELBOW) {
      const natural = a.y + Math.round(Math.min(STUB, (b.y - a.y) / 2))
      const run = runOf(input, 'y', natural, a.y + 8, b.y - HEAD_CLEARANCE, [a.x, b.x])
      const ym = run?.value ?? natural
      return done(clean([a, { x: a.x, y: ym }, { x: b.x, y: ym }, b]), run)
    }
  }
  if (td === 'S' && hd === 'W' && b.x >= a.x + ELBOW && b.y >= a.y + ELBOW) return done(clean([a, { x: a.x, y: b.y }, b]))
  if (td === 'N' && hd === 'S') {
    if (a.x === b.x && b.y < a.y) return done([a, b])
    if (a.y - b.y >= 2 * ELBOW) {
      const natural = a.y - Math.round(Math.min(STUB, (a.y - b.y) / 2))
      const run = runOf(input, 'y', natural, b.y + HEAD_CLEARANCE, a.y - 8, [a.x, b.x])
      const ym = run?.value ?? natural
      return done(clean([a, { x: a.x, y: ym }, { x: b.x, y: ym }, b]), run)
    }
  }
  if (td === 'N' && hd === 'W' && b.x >= a.x + ELBOW && b.y <= a.y - ELBOW) return done(clean([a, { x: a.x, y: b.y }, b]))
  if (td === 'E' && hd === 'E' && b.x === a.x) return done([a, b])
  return done(generic(tail, head))
}

/**
 * Where the branches of a straight trunk leave it (the "bus" of a fork or join): a run across the
 * trunk at `value` (y for a vertical trunk, x for a horizontal one). `heads` are the far ends of
 * the branches; the bus stays far enough from each of them for its last run and arrowhead. Null
 * for a trunk that is not one straight run.
 */
export function busOf(
  trunk: readonly Point[],
  heads: readonly RouteEnd[],
  input: { readonly hint?: number; readonly preferred?: number; readonly obstacles?: readonly Rect[] } = {}
): RouteAdjust | null {
  if (trunk.length !== 2) return null
  const p = trunk[0] as Point
  const q = trunk[1] as Point
  const vertical = p.x === q.x
  if (!vertical && p.y !== q.y) return null
  const axis: RunAxis = vertical ? 'y' : 'x'
  const lo = vertical ? Math.min(p.y, q.y) : Math.min(p.x, q.x)
  const hi = vertical ? Math.max(p.y, q.y) : Math.max(p.x, q.x)
  // The trunk's head end carries an arrowhead: the bus stays clear of it.
  const headAtHi = (vertical ? q.y : q.x) === hi
  let min = lo + (headAtHi ? 8 : 12)
  let max = hi - (headAtHi ? 12 : 8)
  const along = vertical ? p.x : p.y
  let s0 = along
  let s1 = along
  for (const h of heads) {
    const v = vertical ? h.point.y : h.point.x
    const w = vertical ? h.point.x : h.point.y
    s0 = Math.min(s0, w)
    s1 = Math.max(s1, w)
    if (h.dir === (vertical ? 'N' : 'W')) max = Math.min(max, v - HEAD_CLEARANCE)
    else if (h.dir === (vertical ? 'S' : 'E')) min = Math.max(min, v + HEAD_CLEARANCE)
  }
  const natural = Math.max(lo + 8, Math.min(hi - 8, lo + 16))
  if (!(min <= max)) return { axis, value: natural, min: natural, max: natural, forbidden: [] }
  const forbidden = forbiddenFor(axis, [s0, s1], input.obstacles)
  const value =
    input.hint !== undefined ? resolveRun(input.hint, min, max, forbidden) : input.preferred !== undefined ? resolveRun(input.preferred, min, max) : natural
  return { axis, value, min, max, forbidden }
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
 * a join, route the other end the same way and reverse the result. `bus` is where branches leave a
 * trunk run sideways (default 16 beyond its start, see `busOf`).
 */
export function routeBranch(trunk: readonly Point[], head: RouteEnd, bus?: number): Point[] {
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
      const yh = Math.max(lo + 8, Math.min(hi - 8, bus ?? lo + 16))
      if (!forward(yh, b.y)) continue
      consider([{ x: s.a.x, y: yh }, { x: b.x, y: yh }, b], Math.abs(b.x - s.a.x) + Math.abs(b.y - yh))
    } else {
      const lo = Math.min(s.a.x, s.b.x)
      const hi = Math.max(s.a.x, s.b.x)
      const xh = Math.max(lo + 8, Math.min(hi - 8, bus ?? lo + 16))
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
