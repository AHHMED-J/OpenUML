/** Text of IDEF0 views: box numbers, detail references, call-arrow labels, title block strings. */
import {
  diagramNodeNumber,
  isContextDiagram,
  isIdef0Function,
  modelOf,
  nodeNumber,
  nodeReference,
  roleOf,
  type Elem
} from '../../model'

export const STATUS_STAGES = ['working', 'draft', 'recommended', 'publication'] as const

export function statusLabel(status: string): string {
  return status.toUpperCase()
}

/** Box number drawn in the lower-right corner. */
export function boxNumberText(fn: Elem): string {
  return String(fn['boxNumber'] as number)
}

/** Detail reference expression below the lower-right corner: the node number of the child diagram. */
export function dreText(fn: Elem): string {
  const child = fn['childDiagram'] as Elem | null
  return child ? diagramNodeNumber(child) : ''
}

/** Node reference of a function, e.g. `OM/A21`. */
function referenceOf(fn: Elem): string {
  return nodeReference(modelOf(fn), nodeNumber(fn))
}

/**
 * Label text of a call arrow: the explicit `calledNode` text when present, else the node reference
 * of the called box (`calledFunction` of the calling function).
 */
export function callLabelText(arrow: Elem): string {
  const text = arrow['calledNode'] as string
  if (text) return text
  const caller = arrow['source'] as Elem | null
  const called = isIdef0Function(caller) ? (caller['calledFunction'] as Elem | null) : null
  return called ? referenceOf(called) : ''
}

/** Label text of any arrow (call arrows show their reference). */
export function arrowText(arrow: Elem): string {
  return roleOf(arrow) === 'call' ? callLabelText(arrow) : ((arrow['name'] as string | undefined) ?? '')
}

export interface ParsedCall {
  /** The trimmed references typed by the user (`A31`, `OM/A31`). */
  readonly references: readonly string[]
  readonly text: string
}

/** Syntax of the call-arrow label: one or more references separated by commas. */
export const CALL_EDIT_HINT = 'A31, OM/A31'

export function parseCall(text: string): ParsedCall | null {
  const references = text
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r !== '')
  if (references.length === 0) return { references: [], text: '' }
  if (!references.every((r) => /^\S+$/.test(r))) return null
  return { references, text: references.join(', ') }
}

/** Resolves a typed reference (`A31` or `OM/A31`) against the functions of `model`. */
export function resolveReference(model: Elem | null, reference: string): Elem | null {
  if (!model) return null
  const slash = reference.indexOf('/')
  const prefix = slash >= 0 ? reference.slice(0, slash) : ''
  const number = slash >= 0 ? reference.slice(slash + 1) : reference
  if (prefix && prefix !== ((model['abbreviation'] as string | undefined) ?? '')) return null
  const stack: Elem[] = model['topFunction'] ? [model['topFunction'] as Elem] : []
  while (stack.length > 0) {
    const fn = stack.pop() as Elem
    if (nodeNumber(fn) === number) return fn
    for (const child of (fn['functions'] as Elem[]) ?? []) stack.push(child)
  }
  return null
}

/** Title cell: the detailed function's name, or the model name on A-0. */
export function titleText(diagram: Elem): string {
  const scope = diagram._parent
  if (!scope) return ''
  if (isContextDiagram(diagram)) return ((scope['topFunction'] as Elem | null)?.['name'] as string | undefined) ?? (scope['name'] as string)
  return (scope['name'] as string | undefined) ?? ''
}
