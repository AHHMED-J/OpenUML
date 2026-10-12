/** Navigation between IDEF0 diagrams: parent, child and call-arrow targets (spec 11 §3.5). */
import {
  diagramOfScope,
  functionViewsOf,
  isIdef0Function,
  parentDiagramOf,
  roleOf,
  type Elem,
  type View
} from '../../model'

export interface DiagramTarget {
  readonly diagram: Elem
  /** The view to select after opening (the box of the detailed function, or the called box). */
  readonly view: View | null
}

/** The diagram holding the box this diagram details, with that box's view; null on A-0. */
export function parentTarget(diagram: Elem): DiagramTarget | null {
  const parent = parentDiagramOf(diagram)
  if (!parent) return null
  const detailed = diagram._parent
  return { diagram: parent, view: functionViewsOf(parent).find((v) => v.model === detailed) ?? null }
}

/** The child diagram of a function, or null while it is not decomposed. */
export function childTarget(fn: Elem | null | undefined): Elem | null {
  return isIdef0Function(fn) ? ((fn['childDiagram'] as Elem | null) ?? null) : null
}

/** Double-click target of a function view: its child diagram. */
export function openTargetOf(view: View): Elem | null {
  return childTarget(view.model)
}

/** The diagram containing the box a call arrow refers to, with that box's view. */
export function callTarget(arrow: Elem): DiagramTarget | null {
  if (roleOf(arrow) !== 'call') return null
  const caller = arrow['source'] as Elem | null
  const called = isIdef0Function(caller) ? (caller['calledFunction'] as Elem | null) : null
  const diagram = called ? diagramOfScope(called._parent) : null
  if (!called || !diagram) return null
  return { diagram, view: functionViewsOf(diagram).find((v) => v.model === called) ?? null }
}
