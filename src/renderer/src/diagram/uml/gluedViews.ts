/**
 * Helpers for node views glued to the border of another node view: activity pins, ports and
 * connection point references.
 */
import { isKindOf, type NodeView, type View } from '../../model'
import type { LayoutContext, NodeLayout } from '../layout/types'
import { nodeNotationFor } from '../render/registry'

/**
 * The view a glued view sits on: its container view when that shows the model's owner (or the
 * model has none), else the first visible node view of the owner in the diagram.
 */
export function ownerHostView(view: NodeView, ctx: LayoutContext): View | null {
  const owner = view.model?._parent
  const container = view.containerView ?? null
  if (container && (!owner || container.model === owner)) return container
  if (!owner) return null
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v !== view && v.model === owner && isKindOf(v, 'NodeView') && v.visible !== false) return v as View
  }
  return null
}

/**
 * Layout of a host view: the one already computed in this pass, else computed on demand.
 * Null when the host is not a node view or its notation cannot lay it out (the glued view then
 * keeps its stored position).
 */
export function hostNodeLayout(host: View, ctx: LayoutContext): NodeLayout | null {
  const laid = ctx.nodeLayout(host._id)
  if (laid) return laid
  if (!isKindOf(host, 'NodeView')) return null
  try {
    return nodeNotationFor(host).layout(host as NodeView, ctx)
  } catch {
    return null
  }
}
