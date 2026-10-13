/**
 * Edge end decorations (arrowheads, diamonds, crosses, dots) as renderer-independent shapes
 * (spec 03 §3.5).
 *
 * Every end is built in a local frame: `tip` T is the edge end point, `u` the unit vector from T
 * toward the adjacent vertex (back along the line), `a = π/8`. The edge line is stroked all the
 * way to T first; decorations are drawn over it. Shapes filled with `'background'` (white)
 * hide the line underneath them.
 */
import { add, normalize, rotate, scale, sub, type Point } from './geometry'
import { fmt, polygonPath, polylinePath } from './paths'

export type EndStyle =
  | 'flat'
  /** Open arrow: two strokes. */
  | 'stickArrow'
  /** Small filled arrow (11 long). */
  | 'solidArrow'
  /** Large hollow triangle (22 long, generalization/realization). */
  | 'triangle'
  /** Large triangle filled with the line color. */
  | 'filledTriangle'
  /** Hollow diamond (shared aggregation). */
  | 'diamond'
  /** Filled diamond (composition). */
  | 'filledDiamond'
  /** Hollow diamond plus a stick arrow beyond it (navigable shared end). */
  | 'arrowDiamond'
  /** Filled diamond plus a stick arrow beyond it (navigable composite end). */
  | 'arrowFilledDiamond'
  /** "X" marking a non-navigable end. */
  | 'cross'
  /** Circle with a plus (containment / nesting). */
  | 'circlePlus'

/**
 * An end decoration: a base style plus an optional "owned end" dot. With `dot`, a filled circle
 * is drawn at the tip and the base symbol is shifted further along the line.
 */
export interface EndSpec {
  style: EndStyle
  dot?: boolean
}

/** How a shape is filled: with the line color, the edge background (white), or not at all. */
type EndFill = 'line' | 'background' | 'none'

/** A primitive of an end decoration. Every shape is also stroked with the line color. */
export type EndShape =
  | { type: 'polyline'; points: Point[] }
  | { type: 'polygon'; points: Point[]; fill: EndFill }
  | { type: 'circle'; center: Point; radius: number; fill: EndFill }

/** Geometry constants of end decorations. */
export const END_GEOMETRY = {
  /** Half-angle of arrowheads and diamonds. */
  angle: Math.PI / 8,
  /** Arm length of stick/solid arrows and diamond side vertices. */
  arrowLength: 11,
  /** Arm length of the large triangle. */
  triangleLength: 22,
  /** Total diamond length. */
  diamondLength: 22,
  /** Cross center distance from the tip, and arm length. */
  crossOffset: 7,
  crossArm: 5,
  /** Owned-end dot radius and center offset from the tip; symbols shift by `dotShift`. */
  dotRadius: 3,
  dotOffset: 3,
  dotShift: 6,
  /** Containment circle radius (not given by the spec; OpenUML choice). */
  circlePlusRadius: 6
} as const

/** Persisted `headEndStyle`/`tailEndStyle` codes of free-line edges (spec 01 §5.3). */
const END_STYLE_CODES: Readonly<Record<number, EndStyle>> = {
  0: 'flat',
  1: 'stickArrow',
  2: 'solidArrow',
  3: 'triangle',
  4: 'filledTriangle',
  5: 'diamond',
  6: 'filledDiamond'
}

/** End style for a persisted code; unknown codes are drawn flat. */
export function endStyleFromCode(code: number): EndStyle {
  return END_STYLE_CODES[code] ?? 'flat'
}

function stickArrow(t: Point, u: Point, len: number, a: number): EndShape {
  return {
    type: 'polyline',
    points: [add(t, scale(rotate(u, -a), len)), t, add(t, scale(rotate(u, a), len))]
  }
}

function triangle(t: Point, u: Point, len: number, a: number, fill: EndFill): EndShape {
  return {
    type: 'polygon',
    points: [t, add(t, scale(rotate(u, -a), len)), add(t, scale(rotate(u, a), len))],
    fill
  }
}

function diamond(t: Point, u: Point, fill: EndFill): EndShape {
  const g = END_GEOMETRY
  return {
    type: 'polygon',
    points: [
      t,
      add(t, scale(rotate(u, -g.angle), g.arrowLength)),
      add(t, scale(u, g.diamondLength)),
      add(t, scale(rotate(u, g.angle), g.arrowLength))
    ],
    fill
  }
}

/**
 * Shapes for one edge end.
 * @param tip the edge end point
 * @param adjacent the neighbouring vertex (defines the line direction at this end)
 */
export function endShapes(spec: EndSpec | EndStyle, tip: Point, adjacent: Point): EndShape[] {
  const { style, dot } = typeof spec === 'string' ? { style: spec, dot: false } : spec
  const g = END_GEOMETRY
  const u = normalize(sub(adjacent, tip))
  const shapes: EndShape[] = []
  let t = tip
  if (dot) {
    shapes.push({ type: 'circle', center: add(tip, scale(u, g.dotOffset)), radius: g.dotRadius, fill: 'line' })
    t = add(tip, scale(u, g.dotShift))
  }
  const a = g.angle
  switch (style) {
    case 'flat':
      break
    case 'stickArrow':
      shapes.push(stickArrow(t, u, g.arrowLength, a))
      break
    case 'solidArrow':
      shapes.push(triangle(t, u, g.arrowLength, a, 'line'))
      break
    case 'triangle':
      shapes.push(triangle(t, u, g.triangleLength, a, 'background'))
      break
    case 'filledTriangle':
      shapes.push(triangle(t, u, g.triangleLength, a, 'line'))
      break
    case 'diamond':
      shapes.push(diamond(t, u, 'background'))
      break
    case 'filledDiamond':
      shapes.push(diamond(t, u, 'line'))
      break
    case 'arrowDiamond':
    case 'arrowFilledDiamond': {
      shapes.push(diamond(t, u, style === 'arrowDiamond' ? 'background' : 'line'))
      // The arrow's tip sits on the diamond's far vertex; its arms reach further out.
      shapes.push(stickArrow(add(t, scale(u, g.diamondLength)), u, g.arrowLength, a))
      break
    }
    case 'cross': {
      const c = add(t, scale(u, g.crossOffset))
      const q = Math.PI / 4
      shapes.push({ type: 'polyline', points: [add(c, scale(rotate(u, q), g.crossArm)), add(c, scale(rotate(u, q + Math.PI), g.crossArm))] })
      shapes.push({ type: 'polyline', points: [add(c, scale(rotate(u, -q), g.crossArm)), add(c, scale(rotate(u, -q + Math.PI), g.crossArm))] })
      break
    }
    case 'circlePlus': {
      const r = g.circlePlusRadius
      const c = add(t, scale(u, r))
      const n = { x: -u.y, y: u.x }
      shapes.push({ type: 'circle', center: c, radius: r, fill: 'background' })
      shapes.push({ type: 'polyline', points: [t, add(t, scale(u, 2 * r))] })
      shapes.push({ type: 'polyline', points: [add(c, scale(n, r)), add(c, scale(n, -r))] })
      break
    }
  }
  return shapes
}

/** Distance from the tip to the farthest point of the decoration along the line. */
export function endDecorationLength(spec: EndSpec | EndStyle): number {
  const { style, dot } = typeof spec === 'string' ? { style: spec, dot: false } : spec
  const g = END_GEOMETRY
  const base: Record<EndStyle, number> = {
    flat: 0,
    stickArrow: g.arrowLength * Math.cos(g.angle),
    solidArrow: g.arrowLength * Math.cos(g.angle),
    triangle: g.triangleLength * Math.cos(g.angle),
    filledTriangle: g.triangleLength * Math.cos(g.angle),
    diamond: g.diamondLength,
    filledDiamond: g.diamondLength,
    arrowDiamond: g.diamondLength + g.arrowLength * Math.cos(g.angle),
    arrowFilledDiamond: g.diamondLength + g.arrowLength * Math.cos(g.angle),
    cross: g.crossOffset + g.crossArm * Math.cos(Math.PI / 4),
    circlePlus: 2 * g.circlePlusRadius
  }
  if (!dot) return base[style]
  return style === 'flat' ? g.dotOffset + g.dotRadius : g.dotShift + base[style]
}

/** SVG path data for one end shape (circles are written as two arcs). */
export function endShapePath(shape: EndShape): string {
  switch (shape.type) {
    case 'polyline':
      return polylinePath(shape.points)
    case 'polygon':
      return polygonPath(shape.points)
    case 'circle': {
      const { center: c, radius: r } = shape
      return `M${fmt(c.x - r)} ${fmt(c.y)} A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(c.x + r)} ${fmt(c.y)} A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(c.x - r)} ${fmt(c.y)} Z`
    }
  }
}

/**
 * Shapes for both ends of a polyline. The tail decoration uses points[0]/points[1], the head
 * decoration points[n−1]/points[n−2]. Edges with fewer than 2 points get no decorations.
 */
export function edgeEndShapes(
  points: readonly Point[],
  tail: EndSpec | EndStyle,
  head: EndSpec | EndStyle
): { tail: EndShape[]; head: EndShape[] } {
  const n = points.length
  if (n < 2) return { tail: [], head: [] }
  return {
    tail: endShapes(tail, points[0] as Point, points[1] as Point),
    head: endShapes(head, points[n - 1] as Point, points[n - 2] as Point)
  }
}
