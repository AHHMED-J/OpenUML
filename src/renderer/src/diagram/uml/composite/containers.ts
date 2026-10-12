/**
 * Hosts of ports and parts (spec 25 §3, §7): classifier, component, collaboration and part
 * views accept a new port / part (the attribute is created in the host classifier, or in the
 * type of a part) but never re-host an existing one.
 */
import { isKindOf, structureHostOf, type Elem, type View } from '../../../model'
import { hasNodeNotation, type ContainerBehavior, type ReparentContext } from '../../render/registry'
import { extendContainer } from '../object/containers'

/** A model being created is a bare probe (empty id); existing elements are real. */
function isProbe(el: Elem): boolean {
  return el._id === ''
}

export const structureHostContainer: ContainerBehavior = {
  accepts(container: View, childModel: Elem | null): boolean {
    if (!childModel) return false
    const isPort = isKindOf(childModel, 'UMLPort')
    const isPart = !isPort && childModel._type === 'UMLAttribute'
    if (!isPort && !isPart) return false
    const host = structureHostOf(container)
    // An untyped part still accepts a new port so that creation can report the missing type.
    if (isProbe(childModel)) return host !== null || isKindOf(container.model, 'UMLAttribute')
    return host !== null && childModel._parent === host
  },
  ownerFor(container: View, childModel: Elem | null) {
    const host = structureHostOf(container)
    if (!host || !childModel) return null
    return { owner: host, field: 'attributes' }
  },
  /** Ports and parts stay with their host: a drop elsewhere restores the previous container. */
  reparent({ builder, child, container, previous }: ReparentContext): boolean {
    if (!previous || container === previous) return false
    const model = child.model
    if (!model || !(isKindOf(model, 'UMLPort') || model._type === 'UMLAttribute') || model._parent !== structureHostOf(previous)) return false
    builder.set(child, 'containerView', previous)
    builder.addRef(previous, 'containedViews', child)
    if (container) builder.removeRef(container, 'containedViews', child)
    return true
  }
}

/** View types that host ports and parts (when registered). */
const HOST_VIEWS = ['UMLClassifierView', 'UMLClassView', 'UMLComponentView', 'UMLSubsystemView', 'UMLNodeView', 'UMLCollaborationView', 'UMLPartView']

export function registerStructureHosts(): void {
  for (const type of HOST_VIEWS) if (hasNodeNotation(type)) extendContainer(type, structureHostContainer)
}
