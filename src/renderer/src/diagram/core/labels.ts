/**
 * Polar placement of labels attached to edges and nodes (spec 03 §3.4).
 *
 * An edge label is placed from an anchor A on the edge (head, middle or tail) and a reference
 * point R that gives the local edge direction:
 *
 *   phi    = atan2(R.y − A.y, R.x − A.x)
 *   theta  = phi − alpha            (positive alpha = counter-clockwise on screen)
 *   center = A + floor(distance · (cos theta, sin theta))
 *   box    = floor(center − size / 2), size
 *
 * Dragging a label inverts this to new `(alpha, distance)` so the label keeps its position
 * relative to the edge when the edge moves.
 */
import { normalizeAngle, type Point, type Rect, type Size } from './geometry'
import { EdgePosition } from './style'

export interface EdgeAnchor {
  /** Anchor point on the edge. */
  anchor: Point
  /** Direction reference: phi = angle from `anchor` toward `reference`. */
  reference: Point
}

/** Polar label parameters as stored on parasitic views. */
export interface PolarParams {
  alpha: number
  distance: number
}

/**
 * Anchor and reference points for an edge label.
 * - tail: A = points[0], R = points[1]
 * - head: A = points[n−1], R = points[n−2]
 * - middle: m = floor(n/2); even n → A = floor(midpoint(points[m−1], points[m])), R = points[m];
 *   odd n → A = points[m], R = points[m+1]
 * With a single point R = A (phi = 0). Throws for an empty point list.
 */
export function edgeAnchor(points: readonly Point[], position: EdgePosition): EdgeAnchor {
  const n = points.length
  if (n === 0) throw new Error('edgeAnchor: edge has no points')
  const at = (i: number): Point => points[Math.max(0, Math.min(n - 1, i))] as Point
  if (n === 1) return { anchor: at(0), reference: at(0) }
  switch (position) {
    case EdgePosition.Tail:
      return { anchor: at(0), reference: at(1) }
    case EdgePosition.Head:
      return { anchor: at(n - 1), reference: at(n - 2) }
    default: {
      const m = Math.floor(n / 2)
      if (n % 2 === 0) {
        const a = at(m - 1)
        const b = at(m)
        return { anchor: { x: Math.floor((a.x + b.x) / 2), y: Math.floor((a.y + b.y) / 2) }, reference: b }
      }
      return { anchor: at(m), reference: at(m + 1) }
    }
  }
}

function directionAngle(a: EdgeAnchor): number {
  const dx = a.reference.x - a.anchor.x
  const dy = a.reference.y - a.anchor.y
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx)
}

/** Label center for polar parameters relative to an anchor. */
export function polarLabelCenter(a: EdgeAnchor, params: PolarParams): Point {
  const theta = directionAngle(a) - params.alpha
  return {
    x: a.anchor.x + Math.floor(params.distance * Math.cos(theta)),
    y: a.anchor.y + Math.floor(params.distance * Math.sin(theta))
  }
}

/** Label box (floored) of the given size centered on `center`. */
export function labelBoxAt(center: Point, size: Size): Rect {
  return {
    left: Math.floor(center.x - size.width / 2),
    top: Math.floor(center.y - size.height / 2),
    width: size.width,
    height: size.height
  }
}

/** Polar parameters that place a label's center at `center` relative to an anchor. */
export function polarParamsFor(a: EdgeAnchor, center: Point): PolarParams {
  const dx = center.x - a.anchor.x
  const dy = center.y - a.anchor.y
  const distance = Math.hypot(dx, dy)
  if (distance === 0) return { alpha: 0, distance: 0 }
  const theta = Math.atan2(dy, dx)
  return { alpha: normalizeAngle(directionAngle(a) - theta), distance }
}

/** Box of an edge label from its stored parameters. */
export function placeEdgeLabel(
  points: readonly Point[],
  position: EdgePosition,
  params: PolarParams,
  size: Size
): Rect {
  return labelBoxAt(polarLabelCenter(edgeAnchor(points, position), params), size)
}

/** New `(alpha, distance)` for an edge label whose box was dragged to `box`. */
export function edgeLabelParamsFromBox(points: readonly Point[], position: EdgePosition, box: Rect): PolarParams {
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  return polarParamsFor(edgeAnchor(points, position), center)
}

/** Anchor for a label floating on a node: the node center, reference direction +x. */
export function nodeAnchor(node: Rect): EdgeAnchor {
  const c = { x: node.left + node.width / 2, y: node.top + node.height / 2 }
  return { anchor: c, reference: { x: c.x + 1, y: c.y } }
}

/** Box of a node-attached floating label (pins, ports). */
export function placeNodeLabel(node: Rect, params: PolarParams, size: Size): Rect {
  return labelBoxAt(polarLabelCenter(nodeAnchor(node), params), size)
}

/** New `(alpha, distance)` for a node-attached label dragged to `box`. */
export function nodeLabelParamsFromBox(node: Rect, box: Rect): PolarParams {
  return polarParamsFor(nodeAnchor(node), { x: box.left + box.width / 2, y: box.top + box.height / 2 })
}

// ---------------------------------------------------------------------------
// Defaults (spec 03 §3.4)
// ---------------------------------------------------------------------------

export interface EdgeLabelDefaults extends PolarParams {
  edgePosition: EdgePosition
}

const P = Math.PI

/** Default anchor, angle and distance of every standard edge label. */
export const EDGE_LABEL_DEFAULTS = {
  name: { edgePosition: EdgePosition.Middle, alpha: P / 2, distance: 15 },
  stereotype: { edgePosition: EdgePosition.Middle, alpha: P / 2, distance: 30 },
  property: { edgePosition: EdgePosition.Middle, alpha: -P / 2, distance: 15 },
  tailRoleName: { edgePosition: EdgePosition.Tail, alpha: P / 6, distance: 30 },
  tailProperty: { edgePosition: EdgePosition.Tail, alpha: P / 4, distance: 40 },
  tailMultiplicity: { edgePosition: EdgePosition.Tail, alpha: -P / 6, distance: 25 },
  headRoleName: { edgePosition: EdgePosition.Head, alpha: -P / 6, distance: 30 },
  headProperty: { edgePosition: EdgePosition.Head, alpha: -P / 4, distance: 40 },
  headMultiplicity: { edgePosition: EdgePosition.Head, alpha: P / 6, distance: 25 },
  messageName: { edgePosition: EdgePosition.Middle, alpha: P / 2, distance: 10 },
  messageStereotype: { edgePosition: EdgePosition.Middle, alpha: P / 2, distance: 25 },
  messageProperty: { edgePosition: EdgePosition.Middle, alpha: -P / 2, distance: 10 }
} as const satisfies Record<string, EdgeLabelDefaults>

export type EdgeLabelKind = keyof typeof EDGE_LABEL_DEFAULTS

/** Default angle and distance of node-attached floating labels. */
export const NODE_LABEL_DEFAULTS = {
  name: { alpha: (3 * P) / 4, distance: 20 },
  stereotype: { alpha: (3 * P) / 4, distance: 35 },
  property: { alpha: (-3 * P) / 4, distance: 20 }
} as const satisfies Record<string, PolarParams>

export type NodeLabelKind = keyof typeof NODE_LABEL_DEFAULTS
