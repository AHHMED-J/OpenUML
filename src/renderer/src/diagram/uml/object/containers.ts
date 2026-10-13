/**
 * Container behaviors shared by the structural diagram families: extending the behavior of
 * views registered by other families (packages accepting instances, classifier / component
 * views hosting ports and parts) without replacing their layout or drawing.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { nodeNotationFor, registerNodeNotation, type ContainerBehavior, type NodeNotation } from '../../render/registry'

/** The registered notation of `viewType` (itself or its nearest registered supertype), if any. */
function currentNotation(viewType: string): NodeNotation | null {
  try {
    return nodeNotationFor({ _type: viewType } as unknown as View)
  } catch {
    return null
  }
}

/**
 * Registers `viewType` with its current notation extended by `extra`: a child is accepted when
 * either the existing behavior or `extra` accepts it, and `extra` supplies the owner when it
 * accepted the child.
 */
export function extendContainer(viewType: string, extra: ContainerBehavior): void {
  const base = currentNotation(viewType)
  if (!base) return
  const previous = base.container
  registerNodeNotation(viewType, {
    ...base,
    container: {
      ...previous,
      accepts: (container, childModel) => extra.accepts(container, childModel) || (previous?.accepts(container, childModel) ?? false),
      ownerFor: (container, childModel) =>
        extra.accepts(container, childModel) ? (extra.ownerFor?.(container, childModel) ?? null) : (previous?.ownerFor?.(container, childModel) ?? null),
      reparent: (ctx) => extra.reparent?.(ctx) === true || previous?.reparent?.(ctx) === true
    }
  })
}

/** Package views visually contain instances (the instance models move into the package). */
export const instanceContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel !== null && isKindOf(childModel, 'UMLInstance')
  },
  ownerFor(container: View, childModel: Elem | null) {
    const owner = container.model
    if (!owner || !childModel || owner === childModel) return null
    return { owner, field: 'ownedElements' }
  }
}
