/**
 * Diagram layout pass (spec 03 §1.2, OpenUML two-pass variant): measure and arrange all nodes,
 * then route all edges (edges attached to other edges after their hosts), then compute the paint
 * order (stable sort by z-index) and the content bounds.
 *
 * Layout is a pure function of the model. Passing the previous layout enables structural
 * sharing: view layouts whose content did not change are reused (same object), so memoized
 * renderers skip them.
 */
import { isKindOf, type Diagram, type EdgeView, type NodeView, type Repository, type View } from '../../model'
import { unionRects, type Rect, type TextMeasurer } from '../core'
import { edgeNotationFor, nodeNotationFor } from '../render/registry'
import { edgeLayoutBounds } from './edges'
import type { DiagramLayout, EdgeLayout, LayoutContext, NodeLayout } from './types'

/** `prev` when it holds the same data as `next` (so memoized renderers skip the view), else `next`. */
function share<T extends object>(next: T, prev: T | undefined): T {
  return prev !== undefined && sameLayoutData(next, prev) ? prev : next
}

/**
 * Deep equality of plain layout data as JSON would see it: `undefined`-valued properties count
 * as absent and key order is ignored. Stops at the first difference and allocates nothing (this
 * runs for every view on every layout pass, so it must stay cheaper than serializing).
 */
export function sameLayoutData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // NaN serializes like itself (as null).
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!sameLayoutData(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  let count = 0
  for (const key in x) {
    const v = x[key]
    if (v === undefined) continue
    count++
    if (!sameLayoutData(v, y[key])) return false
  }
  for (const key in y) if (y[key] !== undefined) count--
  return count === 0
}

function isEdgeEnd(view: View | null | undefined): boolean {
  return isKindOf(view, 'EdgeView')
}

export interface LayoutOptions {
  readonly previous?: DiagramLayout | null
  /** Called when a notation throws; the view is then skipped. Default: console.error. */
  readonly onError?: (view: View, error: unknown) => void
}

export function computeDiagramLayout(
  diagram: Diagram,
  repository: Repository,
  measurer: TextMeasurer,
  options: LayoutOptions = {}
): DiagramLayout {
  const prev = options.previous?.diagramId === diagram._id ? options.previous : null
  const onError = options.onError ?? ((view: View, error: unknown) => console.error(`Layout of ${view._type} ${view._id} failed`, error))
  const nodes = new Map<string, NodeLayout>()
  const edges = new Map<string, EdgeLayout>()
  const ctx: LayoutContext = {
    measurer,
    repository,
    diagram,
    nodeLayout: (id) => nodes.get(id),
    edgeLayout: (id) => edges.get(id)
  }

  const views = (diagram.ownedViews ?? []).filter((v): v is View => isKindOf(v, 'View'))

  // Phase 1: nodes.
  for (const view of views) {
    if (!isKindOf(view, 'NodeView') || view.visible === false) continue
    try {
      const layout = nodeNotationFor(view).layout(view as NodeView, ctx)
      nodes.set(view._id, share(layout, prev?.nodes.get(view._id)))
    } catch (err) {
      onError(view, err)
    }
  }

  // Phase 2: edges; edges attached to other edges wait for their hosts.
  let pending = views.filter((v): v is EdgeView => isKindOf(v, 'EdgeView') && v.visible !== false)
  for (let pass = 0; pending.length > 0 && pass < 4; pass++) {
    const later: EdgeView[] = []
    for (const edge of pending) {
      const waits = [edge.tail, edge.head].some((end) => isEdgeEnd(end) && end && !edges.has(end._id) && pending.includes(end as EdgeView))
      if (waits && pass < 3) {
        later.push(edge)
        continue
      }
      try {
        const layout = edgeNotationFor(edge).layout(edge, ctx)
        edges.set(edge._id, share(layout, prev?.edges.get(edge._id)))
      } catch (err) {
        onError(edge, err)
      }
    }
    pending = later
  }

  // Paint order: stable by z-index, then list order.
  const order = views
    .map((v, i) => ({ id: v._id, z: nodes.get(v._id)?.zIndex ?? edges.get(v._id)?.zIndex, i }))
    .filter((e): e is { id: string; z: number; i: number } => e.z !== undefined)
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((e) => e.id)

  const boxes: Rect[] = []
  for (const n of nodes.values()) {
    boxes.push(n.box)
    if (n.extraBounds) boxes.push(...n.extraBounds)
  }
  for (const e of edges.values()) boxes.push(...edgeLayoutBounds(e))
  const bounds = unionRects(boxes)

  if (prev && sameOrder(prev.order, order) && sameMaps(prev, nodes, edges)) return prev
  return { diagramId: diagram._id, nodes, edges, order, bounds }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function sameMaps(prev: DiagramLayout, nodes: Map<string, NodeLayout>, edges: Map<string, EdgeLayout>): boolean {
  if (prev.nodes.size !== nodes.size || prev.edges.size !== edges.size) return false
  for (const [id, l] of nodes) if (prev.nodes.get(id) !== l) return false
  for (const [id, l] of edges) if (prev.edges.get(id) !== l) return false
  return true
}

/** Layout of a top-level view by ID. */
export function viewLayout(layout: DiagramLayout, id: string): NodeLayout | EdgeLayout | undefined {
  return layout.nodes.get(id) ?? layout.edges.get(id)
}
