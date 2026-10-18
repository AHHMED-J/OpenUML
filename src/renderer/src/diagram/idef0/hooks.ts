/** Registration of the IDEF0 editor hooks: auto-renumbering, rename sync, title blocks, gestures and deletion. */
import { registerTransactionHook, type OperationBuilder } from '../../commands'
import { functionsOfDiagram, isContextDiagram, isIdef0Function, planRenumber, type Diagram, type Elem } from '../../model'
import { registerDiagramHooks, type DiagramEnv, type SegmentDrag } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import { registerRenameHook } from '../editor/quickEditApply'
import { addMissingPorts } from './assignment'
import { deleteIdef0Views } from './deletion'
import { arrowRunAt, createIdef0Edge, freeEnds, moveArrowRun, pickEnd, pickReconnect, reconnectIdef0 } from './gestures'
import { syncLinkedNames } from './propagation'
import { normalizeSheet } from './sheet'
import { propagateTitleBlock } from './titleBlock'

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
 * them follow the staircase. A resized sheet takes its output and mechanism ports along. Every
 * parent arrow has its pending port on the child diagram: the diagram's own (from its parent box)
 * and those of the decomposed boxes drawn on it, so an arrow added to a box shows up below it.
 */
function normalizeIdef0(b: OperationBuilder, diagram: Diagram): void {
  if (diagram['autoNumber'] === true) {
    for (const change of planRenumber(diagram)) b.set(change.fn, 'boxNumber', change.boxNumber)
  }
  syncTitles(b, diagram)
  normalizeSheet(b, diagram)
  if (!isContextDiagram(diagram) && isIdef0Function(diagram._parent)) addMissingPorts(b, diagram._parent)
  for (const fn of functionsOfDiagram(diagram)) addMissingPorts(b, fn)
}

function syncTitles(b: OperationBuilder, diagram: Elem): void {
  const own = titleOf(diagram)
  if (own !== null && diagram['name'] !== own) b.set(diagram, 'name', own)
  for (const fn of functionsOfDiagram(diagram)) {
    const child = fn['childDiagram'] as Elem | null
    if (child && child['name'] !== fn['name']) b.set(child, 'name', fn['name'])
  }
}

/** Segments of IDEF0 arrows drag their route run (fork bus, channel, feedback lane); other segments stay put. */
function arrowSegmentDrag(env: DiagramEnv, layout: DiagramLayout, edgeId: string, index: number): SegmentDrag | null | undefined {
  if (layout.edges.get(edgeId)?.viewType !== 'IDEF0ArrowView') return undefined
  const run = arrowRunAt(layout, edgeId, index)
  if (!run) return null
  return { axis: run.axis, value: run.value, commit: (value) => void moveArrowRun(env, layout, edgeId, index, value) }
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
    freeEnds,
    segmentDrag: arrowSegmentDrag,
    liveReconnect: true,
    pickReconnect
  })
  // Author, date and status edits flow down to the child diagrams that still follow (any UI path).
  registerTransactionHook(propagateTitleBlock)
  // Renaming an arrow renames its counterparts on the other levels.
  registerRenameHook((b, _repo, el) => syncLinkedNames(b, el))
  // Renaming a box renames the diagram that details it (and the A-0 title with the top function).
  // A diagram is always titled with its box, so renaming the diagram (Model Explorer, Properties)
  // renames that box instead; otherwise the new name would be reverted by the next edit.
  registerRenameHook((b, _repo, el) => {
    if (el._type === 'IDEF0Diagram') {
      const fn = detailedFunction(el)
      if (!fn) return
      if (fn['name'] !== el['name']) b.set(fn, 'name', el['name'])
      renameTitles(b, fn)
    } else if (isIdef0Function(el)) renameTitles(b, el)
  })
}

/** The function a diagram is titled with: the top function for A-0, else the box it details. */
function detailedFunction(diagram: Elem): Elem | null {
  const scope = diagram._parent
  if (!scope) return null
  if (isContextDiagram(diagram)) return (scope['topFunction'] as Elem | null) ?? null
  return isIdef0Function(scope) ? scope : null
}

/** Gives the name of `fn` to the diagram detailing it and, for the top function, to the A-0 diagram. */
function renameTitles(b: OperationBuilder, fn: Elem): void {
  const name = fn['name']
  const child = fn['childDiagram'] as Elem | null
  if (child && child['name'] !== name) b.set(child, 'name', name)
  if (fn._parent && fn._parent._type === 'IDEF0Model') {
    for (const sibling of (fn._parent['ownedElements'] as Elem[]) ?? []) {
      if (sibling._type === 'IDEF0Diagram' && isContextDiagram(sibling) && sibling['name'] !== name) b.set(sibling, 'name', name)
    }
  }
}
