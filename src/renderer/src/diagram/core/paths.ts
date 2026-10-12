/**
 * SVG path data builders for edges and generic shapes (spec 03 §3.1, §4.6).
 * All functions return a `d` attribute string; numbers are written with at most 3 decimals.
 */
import { EPSILON, cross, distance, normalize, sub, type Point, type Rect } from './geometry'
import { LineStyle, SPACING } from './style'

/** Formats a number for path data (max 3 decimals, no trailing zeros, no "-0"). */
export function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

function xy(p: Point): string {
  return `${fmt(p.x)} ${fmt(p.y)}`
}

/** Straight segments through every point: `M p0 L p1 L p2 …`. */
export function polylinePath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p)}`).join(' ')
}

/** Closed polygon path. */
export function polygonPath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  return `${polylinePath(points)} Z`
}

/**
 * Rounded polyline (rounded rectilinear style): each bend is replaced by an arc of radius
 * `min(radius, len_in / 2, len_out / 2)`. Right-angle bends use a true circular arc; other bends
 * use a quadratic curve with the bend as control point.
 */
export function roundedPolylinePath(points: readonly Point[], radius: number = SPACING.roundedEdgeRadius): string {
  if (points.length < 3) return polylinePath(points)
  const parts: string[] = [`M${xy(points[0] as Point)}`]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Point
    const p = points[i] as Point
    const next = points[i + 1] as Point
    const lenIn = distance(prev, p)
    const lenOut = distance(p, next)
    const r = Math.min(radius, lenIn / 2, lenOut / 2)
    const uIn = normalize(sub(p, prev))
    const uOut = normalize(sub(next, p))
    const turn = cross(uIn, uOut)
    if (r < EPSILON || Math.abs(turn) < EPSILON) {
      parts.push(`L${xy(p)}`)
      continue
    }
    const start = { x: p.x - uIn.x * r, y: p.y - uIn.y * r }
    const end = { x: p.x + uOut.x * r, y: p.y + uOut.y * r }
    parts.push(`L${xy(start)}`)
    const rightAngle = Math.abs(uIn.x * uOut.x + uIn.y * uOut.y) < 1e-6
    if (rightAngle) {
      // sweep-flag 1 = clockwise on screen (y down), which is a positive cross product.
      parts.push(`A${fmt(r)} ${fmt(r)} 0 0 ${turn > 0 ? 1 : 0} ${xy(end)}`)
    } else {
      parts.push(`Q${xy(p)} ${xy(end)}`)
    }
  }
  parts.push(`L${xy(points[points.length - 1] as Point)}`)
  return parts.join(' ')
}

/**
 * Curve style: a quadratic spline whose interior vertices are control points. The curve starts
 * and ends exactly at the end points and passes through the midpoints between consecutive
 * interior vertices. Two points give a straight line.
 */
export function curvePath(points: readonly Point[]): string {
  const n = points.length
  if (n < 3) return polylinePath(points)
  const parts: string[] = [`M${xy(points[0] as Point)}`]
  for (let i = 1; i < n - 2; i++) {
    const c = points[i] as Point
    const nextC = points[i + 1] as Point
    parts.push(`Q${xy(c)} ${xy({ x: (c.x + nextC.x) / 2, y: (c.y + nextC.y) / 2 })}`)
  }
  parts.push(`Q${xy(points[n - 2] as Point)} ${xy(points[n - 1] as Point)}`)
  return parts.join(' ')
}

/** Path data for an edge polyline drawn in the given line style. */
export function edgePath(points: readonly Point[], lineStyle: LineStyle, cornerRadius?: number): string {
  switch (lineStyle) {
    case LineStyle.RoundedRectilinear:
      return roundedPolylinePath(points, cornerRadius)
    case LineStyle.Curve:
      return curvePath(points)
    default:
      return polylinePath(points)
  }
}

/** Rectangle path with rounded corners (radius clamped to half the smaller side). */
export function roundedRectPath(r: Rect, radius: number): string {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2))
  const x0 = r.left
  const y0 = r.top
  const x1 = r.left + r.width
  const y1 = r.top + r.height
  if (rad < EPSILON) return polygonPath([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }])
  const a = (x: number, y: number): string => `A${fmt(rad)} ${fmt(rad)} 0 0 1 ${fmt(x)} ${fmt(y)}`
  return [
    `M${fmt(x0 + rad)} ${fmt(y0)}`,
    `L${fmt(x1 - rad)} ${fmt(y0)}`,
    a(x1, y0 + rad),
    `L${fmt(x1)} ${fmt(y1 - rad)}`,
    a(x1 - rad, y1),
    `L${fmt(x0 + rad)} ${fmt(y1)}`,
    a(x0, y1 - rad),
    `L${fmt(x0)} ${fmt(y0 + rad)}`,
    a(x0 + rad, y0),
    'Z'
  ].join(' ')
}

/** Ellipse inscribed in `r` as path data (two half arcs). */
export function ellipsePath(r: Rect): string {
  const rx = r.width / 2
  const ry = r.height / 2
  const cy = r.top + ry
  return `M${fmt(r.left)} ${fmt(cy)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(r.left + r.width)} ${fmt(cy)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(r.left)} ${fmt(cy)} Z`
}

/** Vertices of the diamond inscribed in `r` (top, right, bottom, left side midpoints). */
export function diamondPoints(r: Rect): Point[] {
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  return [
    { x: cx, y: r.top },
    { x: r.left + r.width, y: cy },
    { x: cx, y: r.top + r.height },
    { x: r.left, y: cy }
  ]
}
