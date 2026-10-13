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
  rubberBandSelectsEdge,
  rubberBandSelectsRect,
  type HandlePosition,
  type Point,
  type Rect,
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
        const h = handleAt(node.box, p, node.sizable, zoom, SELECTION.handleSize)
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
    const hit = hitTestEdge(edge.points, p, tol)
    if (hit) {
      if (selected.has(id) && hit.kind === 'segment') return { kind: 'edge-segment', viewId: id, index: hit.index, orientation: hit.orientation }
      return { kind: 'edge', viewId: id }
    }
  }
  return null
}

/** Views fully enclosed by a rubber band (spec 02 §7.2). */
export function viewsInBand(layout: DiagramLayout, band: Rect): string[] {
  const ids: string[] = []
  for (const id of layout.order) {
    const node = layout.nodes.get(id)
    if (node) {
      if (rubberBandSelectsRect(band, node.box, 'contain')) ids.push(id)
      continue
    }
    const edge = layout.edges.get(id)
    if (edge && rubberBandSelectsEdge(band, edge.points, 'contain')) ids.push(id)
  }
  return ids
}
