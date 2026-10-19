/**
 * Pending arrows: boundary ports of a child diagram that stand for an arrow of the parent box and
 * are connected to nothing yet (see `assignment.ts`). Pure model reads, used by the layout, the
 * validator and the editor.
 */
import { isContextDiagram, isIdef0Function, isKindOf, listField, roleOf, type Elem } from '../../model'

function isPort(el: unknown): el is Elem {
  return !!el && isKindOf(el as Elem, 'IDEF0Port')
}

/** Whether `port` is a boundary port of a child diagram standing for a parent arrow. */
export function isLinkedPort(port: Elem | null | undefined): port is Elem {
  return isPort(port) && !!port['corresponds'] && isIdef0Function(port._parent) && roleOf(port) !== 'call'
}

/**
 * Whether the parent arrow a linked `port` stands for is tunneled where it meets the box the port
 * details: the flow is not shown below, so the port stands for nothing there.
 */
export function hiddenByTunnel(port: Elem): boolean {
  const arrow = port['corresponds'] as Elem | null
  const fn = port._parent
  if (!arrow) return false
  return (arrow['target'] === fn && arrow['tunnelTarget'] === true) || (arrow['source'] === fn && arrow['tunnelSource'] === true)
}

/** Whether `port` is a pending arrow: linked to a parent arrow shown below and connected to nothing on its diagram. */
export function isPendingPort(port: Elem | null | undefined): boolean {
  if (!isLinkedPort(port) || hiddenByTunnel(port)) return false
  return !listField(port._parent, 'arrows').some((a) => a['source'] === port || a['target'] === port)
}

/** The pending arrows of a child diagram, in model order. */
export function pendingPorts(diagram: Elem | null | undefined): Elem[] {
  const scope = diagram?._parent
  if (!diagram || !isIdef0Function(scope) || isContextDiagram(diagram)) return []
  return listField(scope, 'ports').filter(isPendingPort)
}
