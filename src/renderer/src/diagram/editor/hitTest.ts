/**
 * Diagram-level hit testing on a computed layout (spec 03 §1.5): handles of selected views first,
 * then views from the top of the paint order down (edge labels before their edge line).
 */
import {
  HIT_TOLERANCE,
  SELECTION,
  handleAt,
  hitTestEdge,
  rectContainsPoint,
  rectsIntersect,
  rubberBandSelectsEdge,
  rubberBandSelectsRect,
  type HandlePosition,
  type Point,
  type Rect,
  type RubberBandMode,
  type SegmentOrientation
} from '../core'
import type { DiagramLayout, EditRegion, EdgeLabelLayout, NodeDivider } from '../layout/types'

export type DiagramHit =
  | { readonly kind: 'handle'; readonly viewId: string; readonly handle: HandlePosition }
  | { readonly kind: 'divider'; readonly viewId: string; readonly index: number }
  | { readonly kind: 'edge-vertex'; readonly viewId: string; readonly index: number; readonly isEnd: boolean }
  | { readonly kind: 'edge-segment'; readonly viewId: string; readonly index: number; readonly orientation: SegmentOrientation }
  | { readonly kind: 'edge-label'; readonly viewId: string; readonly label: EdgeLabelLayout }
  | { readonly kind: 'edge'; readonly viewId: string }
  | { readonly kind: 'node'; readonly viewId: string; readonly region: EditRegion | null }

/** Edge hit tolerance in diagram units: 5 units, but at least ~4 screen px when zoomed out. */
function edgeTolerance(zoom: number): number {
  return Math.max(HIT_TOLERANCE, 4 / zoom)
}

function regionAt(regions: readonly EditRegion[], p: Point): EditRegion | null {
  let best: EditRegion | null = null
  for (const r of regions) {
    if (!rectContainsPoint(r.box, p)) continue
    if (!best || r.box.width * r.box.height < best.box.width * best.box.height) best = r
  }
  return best
}

/** The resize direction of a point within `tol` of a box's outline (corners first), or null. */
function outlineHandle(box: Rect, p: Point, tol: number): HandlePosition | null {
  const right = box.left + box.width
  const bottom = box.top + box.height
  if (p.x < box.left - tol || p.x > right + tol || p.y < box.top - tol || p.y > bottom + tol) return null
  const n = Math.abs(p.y - box.top) <= tol
  const s = Math.abs(p.y - bottom) <= tol
  const w = Math.abs(p.x - box.left) <= tol
  const e = Math.abs(p.x - right) <= tol
  const v = n ? 'n' : s ? 's' : ''
  const hz = w ? 'w' : e ? 'e' : ''
  return v || hz ? ((v + hz) as HandlePosition) : null
}

export interface HitOptions {
  readonly selected: ReadonlySet<string>
  readonly zoom: number
  /** Skip these views (e.g. the views being dragged). */
  readonly exclude?: ReadonlySet<string>
  /** Only consider nodes (for drop targets and edge ends). */
  readonly nodesOnly?: boolean
}

export function hitTestDiagram(layout: DiagramLayout, p: Point, options: HitOptions): DiagramHit | null {
  const { selected, zoom } = options
  const tol = edgeTolerance(zoom)
  if (!options.nodesOnly) {
    // 1. Handles of selected nodes and vertices of selected edges (they are drawn on top).
    for (const id of selected) {
      const node = layout.nodes.get(id)
      if (node && node.sizable !== 'none') {
        const h = handleAt(node.box, p, node.sizable, zoom, SELECTION.handleSize) ?? (node.resizeOutline && node.sizable === 'free' ? outlineHandle(node.box, p, tol) : null)
        if (h) return { kind: 'handle', viewId: id, handle: h }
      }
      const dividers = node?.dividers ?? []
      for (let i = 0; i < dividers.length; i++) {
        const d = dividers[i] as NodeDivider
        if (Math.abs(p.y - d.y) <= tol && p.x >= d.left && p.x <= d.left + d.width) return { kind: 'divider', viewId: id, index: i }
      }
      const edge = layout.edges.get(id)
      if (edge) {
        const hit = hitTestEdge(edge.points, p, Math.max(tol, SELECTION.handleSize / 2 / zoom))
        if (hit?.kind === 'vertex') return { kind: 'edge-vertex', viewId: id, index: hit.index, isEnd: hit.isEnd }
      }
    }
  }
  // 2. Views, topmost first.
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const id = layout.order[i] as string
    if (options.exclude?.has(id)) continue
    const node = layout.nodes.get(id)
    if (node) {
      const inside =
        (rectContainsPoint(node.box, p) && (!node.hitAreas || node.hitAreas.some((r) => rectContainsPoint(r, p)))) ||
        (node.outerHitAreas?.some((r) => rectContainsPoint(r, p)) ?? false)
      if (inside) return { kind: 'node', viewId: id, region: regionAt(node.regions, p) }
      continue
    }
    if (options.nodesOnly) continue
    const edge = layout.edges.get(id)
    if (!edge) continue
    for (const label of edge.labels) {
      if (rectContainsPoint(label.box, p)) return { kind: 'edge-label', viewId: id, label }
    }
    // The empty label slots hinted on a selected edge belong to it.
    if (selected.has(id) && edge.slots?.some((s) => rectContainsPoint(s.box, p))) return { kind: 'edge', viewId: id }
    const hit = hitTestEdge(edge.points, p, tol)
    if (hit) {
      if (selected.has(id) && hit.kind === 'segment') return { kind: 'edge-segment', viewId: id, index: hit.index, orientation: hit.orientation }
      return { kind: 'edge', viewId: id }
    }
  }
  return null
}

/**
 * Views a rubber band selects (spec 02 §7.2). A `contain` ("window") band takes nodes whose box
 * and edges whose whole routed polyline lie inside it (an edge's labels go with the edge). An
 * `intersect` ("crossing") band also takes nodes whose box (or a label beside it) it touches and
 * edges whose polyline or labels it touches, but never a frame or container it lies wholly inside.
 */
export function viewsInBand(layout: DiagramLayout, band: Rect, mode: RubberBandMode = 'contain'): string[] {
  const ids: string[] = []
  for (const id of layout.order) {
    const node = layout.nodes.get(id)
    if (node) {
      if (rubberBandSelectsRect(band, node.box, mode) || (mode === 'intersect' && (node.outerHitAreas?.some((r) => rectsIntersect(band, r)) ?? false))) ids.push(id)
      continue
    }
    const edge = layout.edges.get(id)
    if (edge && rubberBandSelectsEdge(band, edge.points, mode, edge.labels.map((l) => l.box))) ids.push(id)
  }
  return ids
}

/**
 * The selection after a rubber band: the views it selects in `mode` (`viewsInBand`), added to
 * `current` when the band is additive (Shift / Cmd / Ctrl held).
 */
export function bandSelection(layout: DiagramLayout, band: Rect, current: readonly string[], additive: boolean, mode: RubberBandMode = 'contain'): string[] {
  const ids = viewsInBand(layout, band, mode)
  return additive ? [...new Set([...current, ...ids])] : ids
}
