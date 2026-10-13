/** Registration of the IDEF0 editor hooks: auto-renumbering, rename sync, gestures and deletion. */
import type { OperationBuilder } from '../../commands'
import { functionsOfDiagram, isContextDiagram, isIdef0Function, planRenumber, type Diagram, type Elem } from '../../model'
import { registerDiagramHooks } from '../editor/actions'
import { registerRenameHook } from '../editor/quickEditApply'
import { deleteIdef0Views } from './deletion'
import { createIdef0Edge, freeEnds, pickEnd, reconnectIdef0 } from './gestures'
import { syncLinkedNames } from './propagation'

/** A diagram is titled with the name of the box it details. */
function titleOf(diagram: Elem): string | null {
  const scope = diagram._parent
  if (!scope) return null
  if (isContextDiagram(diagram)) return ((scope['topFunction'] as Elem | null)?.['name'] as string | undefined) ?? null
  return (scope['name'] as string | undefined) ?? null
}

/**
 * Runs inside every geometry operation of an IDEF0 diagram: diagram titles follow the names of the
 * boxes they detail, in the same undo step as the edit that caused them. Box numbers stay where
 * they are (moving a box never renumbers) unless the diagram opted into `autoNumber`, which makes
 * them follow the staircase.
 */
function normalizeIdef0(b: OperationBuilder, diagram: Diagram): void {
  if (diagram['autoNumber'] === true) {
    for (const change of planRenumber(diagram)) b.set(change.fn, 'boxNumber', change.boxNumber)
  }
  syncTitles(b, diagram)
}

function syncTitles(b: OperationBuilder, diagram: Elem): void {
  const own = titleOf(diagram)
  if (own !== null && diagram['name'] !== own) b.set(diagram, 'name', own)
  for (const fn of functionsOfDiagram(diagram)) {
    const child = fn['childDiagram'] as Elem | null
    if (child && child['name'] !== fn['name']) b.set(child, 'name', fn['name'])
  }
}

let registered = false

export function registerIdef0Hooks(): void {
  if (registered) return
  registered = true
  registerDiagramHooks('IDEF0Diagram', {
    normalize: normalizeIdef0,
    deleteViews: deleteIdef0Views,
    reconnect: reconnectIdef0,
    createEdge: createIdef0Edge,
    pickEnd,
    freeEnds
  })
  // Renaming an arrow renames its counterparts on the other levels.
  registerRenameHook((b, _repo, el) => syncLinkedNames(b, el))
  // Renaming a box renames the diagram that details it (and the A-0 title with the top function).
  registerRenameHook((b, _repo, el) => {
    if (!isIdef0Function(el)) return
    const child = el['childDiagram'] as Elem | null
    if (child) b.set(child, 'name', el['name'])
    if (isIdef0Function(el) && el._parent && el._parent._type === 'IDEF0Model') {
      for (const sibling of (el._parent['ownedElements'] as Elem[]) ?? []) {
        if (sibling._type === 'IDEF0Diagram' && sibling['diagramKind'] === 'context') b.set(sibling, 'name', el['name'])
      }
    }
  })
}
