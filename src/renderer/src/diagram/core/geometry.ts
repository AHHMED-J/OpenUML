/**
 * Basic 2D geometry in diagram units (logical px at zoom 1.0, y axis pointing down).
 *
 * `Rect` uses the same field names as node views (`left`, `top`, `width`, `height`) so view
 * geometry can be passed in without translation.
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Tolerance used for floating point comparisons. */
export const EPSILON = 1e-9

// ---------------------------------------------------------------------------
// Points and vectors
// ---------------------------------------------------------------------------

export function pointsEqual(a: Point, b: Point, eps = EPSILON): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(a: Point, k: number): Point {
  return { x: a.x * k, y: a.y * k }
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

/** z component of the 2D cross product. Positive = clockwise turn on screen (y down). */
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

function length(a: Point): number {
  return Math.hypot(a.x, a.y)
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Unit vector of `a`; returns (1, 0) for the zero vector so callers never divide by zero. */
export function normalize(a: Point): Point {
  const len = length(a)
  return len < EPSILON ? { x: 1, y: 0 } : { x: a.x / len, y: a.y / len }
}

/** Rotates `v` by `angle` radians (positive = clockwise on screen, since y points down). */
export function rotate(v: Point, angle: number): Point {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export function roundPoint(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

/** Linear interpolation between `a` (t = 0) and `b` (t = 1). */
function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// ---------------------------------------------------------------------------
// Rectangles
// ---------------------------------------------------------------------------

export function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height }
}

export function rectRight(r: Rect): number {
  return r.left + r.width
}

export function rectBottom(r: Rect): number {
  return r.top + r.height
}

export function rectCenter(r: Rect): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** Builds a normalized rectangle spanning two corner points (e.g. a drag from `a` to `b`). */
export function rectFromPoints(a: Point, b: Point): Rect {
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  return { left, top, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

/** Builds a rectangle from its edges. */
function rectFromLTRB(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, width: right - left, height: bottom - top }
}

/** Grows (or shrinks, with negative values) a rectangle on every side. */
export function inflateRect(r: Rect, dx: number, dy: number = dx): Rect {
  return { left: r.left - dx, top: r.top - dy, width: r.width + 2 * dx, height: r.height + 2 * dy }
}

/** True when `p` is inside `r` or on its border, with an optional extra tolerance. */
export function rectContainsPoint(r: Rect, p: Point, tolerance = 0): boolean {
  return (
    p.x >= r.left - tolerance &&
    p.x <= rectRight(r) + tolerance &&
    p.y >= r.top - tolerance &&
    p.y <= rectBottom(r) + tolerance
  )
}

/** True when `inner` lies completely inside `outer` (borders may touch). */
export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  )
}

/** True when the rectangles overlap or touch. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left <= rectRight(b) && b.left <= rectRight(a) && a.top <= rectBottom(b) && b.top <= rectBottom(a)
  )
}

/** Smallest rectangle containing all given rectangles; `null` for an empty list. */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, rectRight(r))
    bottom = Math.max(bottom, rectBottom(r))
  }
  return rectFromLTRB(left, top, right, bottom)
}

/** Bounding box of a point list; `null` for an empty list. */
export function boundsOfPoints(points: readonly Point[]): Rect | null {
  if (points.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const p of points) {
    left = Math.min(left, p.x)
    top = Math.min(top, p.y)
    right = Math.max(right, p.x)
    bottom = Math.max(bottom, p.y)
  }
  return rectFromLTRB(left, top, right, bottom)
}

// ---------------------------------------------------------------------------
// Segments and lines
// ---------------------------------------------------------------------------

/** Closest point to `p` on segment `a`–`b`. */
export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  if (len2 < EPSILON) return { x: a.x, y: a.y }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  return lerp(a, b, t)
}

/** Euclidean distance from `p` to segment `a`–`b`. */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  return distance(p, closestPointOnSegment(p, a, b))
}

/** Distance from `p` to the nearest segment of a polyline; `Infinity` for fewer than 1 point. */
export function distancePointToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 0) return Infinity
  if (points.length === 1) return distance(p, points[0] as Point)
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distancePointToSegment(p, points[i] as Point, points[i + 1] as Point))
  }
  return best
}

/** Perpendicular distance from `p` to the infinite line through `a` and `b`. */
export function distancePointToLine(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a)
  const len = length(ab)
  if (len < EPSILON) return distance(p, a)
  return Math.abs(cross(ab, sub(p, a))) / len
}

/**
 * Intersection of segments `a1`–`a2` and `b1`–`b2`, or `null` when they do not cross
 * (parallel/collinear segments return `null`).
 */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = cross(r, s)
  if (Math.abs(denom) < EPSILON) return null
  const qp = sub(b1, a1)
  const t = cross(qp, s) / denom
  const u = cross(qp, r) / denom
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null
  return lerp(a1, a2, t)
}

/** True when segment `a`–`b` touches or crosses rectangle `r`. */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  if (rectContainsPoint(r, a) || rectContainsPoint(r, b)) return true
  const tl = { x: r.left, y: r.top }
  const tr = { x: rectRight(r), y: r.top }
  const br = { x: rectRight(r), y: rectBottom(r) }
  const bl = { x: r.left, y: rectBottom(r) }
  return (
    segmentIntersection(a, b, tl, tr) !== null ||
    segmentIntersection(a, b, tr, br) !== null ||
    segmentIntersection(a, b, br, bl) !== null ||
    segmentIntersection(a, b, bl, tl) !== null
  )
}

// ---------------------------------------------------------------------------
// Ray-from-center intersections with node outlines
// ---------------------------------------------------------------------------

/**
 * Point where the ray from the center of `r` toward `p` leaves the rectangle's border.
 * Returns the center itself when `p` is inside the rectangle or equals the center.
 */
export function rectBorderPointToward(r: Rect, p: Point, center: Point = rectCenter(r)): Point {
  const d = sub(p, center)
  if (rectContainsPoint(r, p) || (Math.abs(d.x) < EPSILON && Math.abs(d.y) < EPSILON)) {
    return { x: center.x, y: center.y }
  }
  // Smallest positive t at which center + t·d reaches a side.
  let t = Infinity
  if (d.x > EPSILON) t = Math.min(t, (rectRight(r) - center.x) / d.x)
  else if (d.x < -EPSILON) t = Math.min(t, (r.left - center.x) / d.x)
  if (d.y > EPSILON) t = Math.min(t, (rectBottom(r) - center.y) / d.y)
  else if (d.y < -EPSILON) t = Math.min(t, (r.top - center.y) / d.y)
  return { x: center.x + d.x * t, y: center.y + d.y * t }
}

/**
 * Point where the ray from the center of the ellipse inscribed in `r` toward `p` crosses the
 * ellipse. Returns the center when `p` is inside the ellipse.
 */
export function ellipseBorderPointToward(r: Rect, p: Point): Point {
  const c = rectCenter(r)
  const rx = r.width / 2
  const ry = r.height / 2
  const d = sub(p, c)
  if (rx < EPSILON || ry < EPSILON) return rectBorderPointToward(r, p)
  const k = (d.x * d.x) / (rx * rx) + (d.y * d.y) / (ry * ry)
  if (k <= 1) return c
  const t = 1 / Math.sqrt(k)
  return { x: c.x + d.x * t, y: c.y + d.y * t }
}

/**
 * Point where the ray from the center of the diamond inscribed in `r` (vertices on the side
 * midpoints) toward `p` crosses the diamond. Returns the center when `p` is inside.
 */
export function diamondBorderPointToward(r: Rect, p: Point): Point {
  const c = rectCenter(r)
  const hw = r.width / 2
  const hh = r.height / 2
  const d = sub(p, c)
  if (hw < EPSILON || hh < EPSILON) return rectBorderPointToward(r, p)
  const k = Math.abs(d.x) / hw + Math.abs(d.y) / hh
  if (k <= 1) return c
  return { x: c.x + d.x / k, y: c.y + d.y / k }
}

/** True when `p` is inside (or on) the ellipse inscribed in `r`. */
export function ellipseContainsPoint(r: Rect, p: Point, tolerance = 0): boolean {
  const c = rectCenter(r)
  const rx = r.width / 2 + tolerance
  const ry = r.height / 2 + tolerance
  if (rx <= 0 || ry <= 0) return false
  const dx = p.x - c.x
  const dy = p.y - c.y
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1
}

/** True when `p` is inside (or on) the diamond inscribed in `r`. */
export function diamondContainsPoint(r: Rect, p: Point, tolerance = 0): boolean {
  const c = rectCenter(r)
  const hw = r.width / 2 + tolerance
  const hh = r.height / 2 + tolerance
  if (hw <= 0 || hh <= 0) return false
  return Math.abs(p.x - c.x) / hw + Math.abs(p.y - c.y) / hh <= 1
}

// ---------------------------------------------------------------------------
// Angles
// ---------------------------------------------------------------------------

/** Normalizes an angle to the range (−π, π]. */
export function normalizeAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  else if (r > Math.PI) r -= 2 * Math.PI
  return r
}
