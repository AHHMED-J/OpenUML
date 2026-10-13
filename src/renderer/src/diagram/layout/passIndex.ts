/**
 * Per-pass indexes of a diagram's views, for notation layouts that look at other views (e.g. the
 * lines entering a symbol). Scanning `diagram.ownedViews` from every view's layout makes a pass
 * quadratic in the number of views; these indexes are built once per layout pass instead (the
 * `LayoutContext` is created per pass, and the model does not change during a pass).
 */
import type { EdgeView, View } from '../../model'
import type { LayoutContext } from './types'

const edgeIndexes = new WeakMap<LayoutContext, Map<string, Map<View, EdgeView[]>>>()

/**
 * Visible top-level edge views of exactly `type`, by the views they connect: an edge is listed
 * under its tail and under its head (once when both are the same view), in diagram list order.
 */
export function edgesAt(ctx: LayoutContext, type: string): ReadonlyMap<View, readonly EdgeView[]> {
  let byType = edgeIndexes.get(ctx)
  if (!byType) edgeIndexes.set(ctx, (byType = new Map()))
  let index = byType.get(type)
  if (index) return index
  index = new Map()
  const add = (end: View | null | undefined, edge: EdgeView): void => {
    if (!end) return
    const list = index?.get(end)
    if (list) list.push(edge)
    else index?.set(end, [edge])
  }
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== type || v.visible === false) continue
    const edge = v as EdgeView
    add(edge.tail, edge)
    if (edge.head !== edge.tail) add(edge.head, edge)
  }
  byType.set(type, index)
  return index
}
