/**
 * Pure helpers over the IDEF0 model: derived node numbers, node references, the staircase
 * renumbering plan, ICOM codes of boundary ports, side slots and the node index. Nothing here
 * is stored except `IDEF0Function.boxNumber`; every other value is computed from the model.
 */
import { isKindOf } from './metamodel'
import type { Elem, NodeView, Point, View } from './types'

export type Idef0Role = 'input' | 'control' | 'output' | 'mechanism' | 'call'
export type Idef0Side = 'left' | 'top' | 'right' | 'bottom'

/** Side of a function box an arrow of `role` attaches to (the role as seen by the function end). */
export const ROLE_SIDE: Readonly<Record<Idef0Role, Idef0Side>> = {
  input: 'left',
  control: 'top',
  output: 'right',
  mechanism: 'bottom',
  call: 'bottom'
}

/** ICOM code letter of a role. */
export const ICOM_LETTER: Readonly<Record<string, string>> = { input: 'I', control: 'C', output: 'O', mechanism: 'M' }

/** Largest box number that keeps concatenated node numbers unambiguous. */
export const MAX_UNAMBIGUOUS_BOX_NUMBER = 9

export function isIdef0Function(el: Elem | null | undefined): el is Elem {
  return isKindOf(el, 'IDEF0Function')
}

export function roleOf(arrow: Elem): Idef0Role {
  return (arrow['role'] as Idef0Role | undefined) ?? 'input'
}

function list(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

// ---------------------------------------------------------------------------------------------
// Scopes and diagrams

/** The scope (IDEF0Model or IDEF0Function) a diagram details; it owns the diagram's arrows and ports. */
export function scopeOf(diagram: Elem): Elem | null {
  return diagram._parent
}

export function isContextDiagram(diagram: Elem): boolean {
  return diagram['diagramKind'] === 'context'
}

/** The IDEF0Model a model element or diagram lives in. */
export function modelOf(el: Elem | null | undefined): Elem | null {
  for (let p: Elem | null | undefined = el; p; p = p._parent) if (isKindOf(p, 'IDEF0Model')) return p
  return null
}

/** The A-0 context diagram of a model (null while missing). */
export function contextDiagramOf(model: Elem): Elem | null {
  return list(model, 'ownedElements').find((e) => isKindOf(e, 'IDEF0Diagram') && isContextDiagram(e)) ?? null
}

/** The function views shown by a diagram (views whose model is a function). */
export function functionViewsOf(diagram: Elem): NodeView[] {
  return list(diagram, 'ownedViews').filter((v) => v._type === 'IDEF0FunctionView' && isIdef0Function(v['model'] as Elem | null)) as NodeView[]
}

/** The function boxes a diagram shows: the top function on A-0, else the children of the detailed function. */
export function functionsOfDiagram(diagram: Elem): Elem[] {
  const scope = scopeOf(diagram)
  if (!scope) return []
  if (isContextDiagram(diagram)) return isKindOf(scope, 'IDEF0Model') && scope['topFunction'] ? [scope['topFunction'] as Elem] : []
  return list(scope, 'functions')
}

/** The diagram that contains the box of the function a diagram details, or null on A-0. */
export function parentDiagramOf(diagram: Elem): Elem | null {
  if (isContextDiagram(diagram)) return null
  const detailed = scopeOf(diagram)
  if (!isIdef0Function(detailed)) return null
  const owner = detailed._parent
  if (owner && isKindOf(owner, 'IDEF0Model')) return contextDiagramOf(owner)
  return (owner?.['childDiagram'] as Elem | null) ?? null
}

// ---------------------------------------------------------------------------------------------
// Node numbers

/**
 * Node number of a function: the top function is `A0`; its children `A1..`; deeper boxes append
 * their box number to the node number of their parent (`A2` -> `A21`).
 */
export function nodeNumber(fn: Elem): string {
  const parent = fn._parent
  if (!isIdef0Function(parent)) return 'A0'
  const own = String(fn['boxNumber'] as number)
  return isKindOf(parent._parent, 'IDEF0Model') ? `A${own}` : `${nodeNumber(parent)}${own}`
}

/** Node number of a diagram: `A-0` for the context diagram, else the number of the function it details. */
export function diagramNodeNumber(diagram: Elem): string {
  if (isContextDiagram(diagram)) return 'A-0'
  const detailed = scopeOf(diagram)
  return isIdef0Function(detailed) ? nodeNumber(detailed) : ''
}

/** `abbreviation/nodeNumber`, just the number when the model has no abbreviation. */
export function nodeReference(model: Elem | null, number: string): string {
  const abbreviation = (model?.['abbreviation'] as string | undefined) ?? ''
  return abbreviation ? `${abbreviation}/${number}` : number
}

/** Node reference of a function (`OM/A21`). */
export function functionReference(fn: Elem): string {
  return nodeReference(modelOf(fn), nodeNumber(fn))
}

// ---------------------------------------------------------------------------------------------
// Staircase renumbering

export interface BoxNumberChange {
  readonly fn: Elem
  readonly boxNumber: number
}

/** Step of the staircase layout (spec 11 §1.11), used to recognize the diagonal band. */
const STAIR_DX = 280
const STAIR_DY = 150

/**
 * Orders the function views of a diagram on the staircase (key = left + top, tie top). Views that
 * deviate from the diagonal by more than one box width are numbered after the diagonal ones, in
 * their relative key order. Returns every view in numbering order.
 */
export function staircaseOrder(views: readonly NodeView[]): NodeView[] {
  const key = (v: NodeView): number => v.left + v.top
  const sorted = [...views].sort((a, b) => key(a) - key(b) || a.top - b.top)
  const first = sorted[0]
  if (!first) return []
  const onBand = (v: NodeView): boolean => {
    const dx = v.left - first.left
    const dy = v.top - first.top
    return Math.abs(dx - (dy * STAIR_DX) / STAIR_DY) <= Math.max(first.width, v.width, 168)
  }
  return [...sorted.filter(onBand), ...sorted.filter((v) => !onBand(v))]
}

/** Box number changes that make the numbers 1..n follow the staircase order (empty when already right). */
export function planRenumber(diagram: Elem): BoxNumberChange[] {
  if (isContextDiagram(diagram)) return []
  const changes: BoxNumberChange[] = []
  const views = functionViewsOf(diagram).filter((v) => (v['model'] as Elem)._parent === scopeOf(diagram))
  staircaseOrder(views).forEach((view, i) => {
    const fn = view['model'] as Elem
    if (fn['boxNumber'] !== i + 1) changes.push({ fn, boxNumber: i + 1 })
  })
  return changes
}

// ---------------------------------------------------------------------------------------------
// Attached arrows and ICOM codes

/** Root trunk of an arrow: follows fork/join references to the arrow that has no arrow end. */
export function rootArrow(arrow: Elem): Elem {
  let current = arrow
  for (let guard = 0; guard < 64; guard++) {
    const source = current['source'] as Elem | null
    const target = current['target'] as Elem | null
    const next = isKindOf(source, 'IDEF0Arrow') ? source : isKindOf(target, 'IDEF0Arrow') ? target : null
    if (!next) return current
    current = next
  }
  return current
}

/**
 * Side of a function box an arrow leaves from: the right side (output), or the bottom for a call
 * arrow. The arrow's `role` describes its target end, so a source end is always an output.
 */
export function sourceSide(arrow: Elem): Idef0Side {
  return roleOf(arrow) === 'call' ? 'bottom' : 'right'
}

/** Side of a function box an arrow enters at, by its role (input left, control top, mechanism bottom). */
export function targetSide(arrow: Elem): Idef0Side {
  return ROLE_SIDE[roleOf(arrow)]
}

/** The side of `fn` an arrow attaches at, or null when it does not touch `fn` directly. */
export function attachmentSide(arrow: Elem, fn: Elem): Idef0Side | null {
  if (arrow['source'] === fn) return sourceSide(arrow)
  if (arrow['target'] === fn) return targetSide(arrow)
  return null
}

function attachmentCoordinate(arrow: Elem, fn: Elem, side: Idef0Side, viewOfArrow: (arrow: Elem) => View | undefined): number {
  const view = viewOfArrow(arrow)
  const points = (view?.['points'] as readonly Point[] | undefined) ?? []
  if (points.length === 0) return Number.POSITIVE_INFINITY
  const end = arrow['target'] === fn ? points[points.length - 1] : points[0]
  if (!end) return Number.POSITIVE_INFINITY
  return side === 'top' || side === 'bottom' ? end.x : end.y
}

/**
 * Arrows attached to `fn` on the side of `role`, ordered along that side (left to right for
 * control and mechanism, top to bottom for input and output) by the stored attachment points.
 */
export function attachedArrows(fn: Elem, role: Idef0Role, arrows: readonly Elem[], viewOfArrow: (arrow: Elem) => View | undefined): Elem[] {
  const side = ROLE_SIDE[role]
  const matches = arrows.filter((a) => attachmentSide(a, fn) === side && (roleOf(a) === 'call') === (role === 'call'))
  const keyed = matches.map((a, i) => ({ a, i, c: attachmentCoordinate(a, fn, side, viewOfArrow) }))
  keyed.sort((x, y) => (x.c === y.c ? x.i - y.i : x.c - y.c))
  return keyed.map((k) => k.a)
}

/** First view of a model element found in `diagram.ownedViews`. */
export function viewFinder(diagram: Elem | null): (model: Elem) => View | undefined {
  const views = list(diagram, 'ownedViews') as View[]
  return (model) => views.find((v) => v['model'] === model)
}

/**
 * ICOM codes of the boundary ports of a decomposition diagram (`I1`, `C3`, `O2`, `M1`): the role
 * letter at the parent box plus the 1-based position of the corresponding parent arrow along that
 * side of the parent box. Ports without a corresponding arrow, and the whole A-0 diagram, get none.
 */
export function icomCodes(diagram: Elem): Map<string, string> {
  const codes = new Map<string, string>()
  if (isContextDiagram(diagram)) return codes
  const detailed = scopeOf(diagram)
  const parentDiagram = parentDiagramOf(diagram)
  if (!isIdef0Function(detailed) || !parentDiagram) return codes
  const parentScope = scopeOf(parentDiagram)
  const arrows = list(parentScope, 'arrows')
  const find = viewFinder(parentDiagram)
  for (const port of list(detailed, 'ports')) {
    const corresponds = port['corresponds'] as Elem | null
    const letter = ICOM_LETTER[port['role'] as string]
    if (!corresponds || !letter) continue
    const ordered = attachedArrows(detailed, port['role'] as Idef0Role, arrows, find)
    let index = ordered.indexOf(corresponds)
    if (index < 0) {
      const root = rootArrow(corresponds)
      index = ordered.findIndex((a) => rootArrow(a) === root)
    }
    if (index >= 0) codes.set(port._id, `${letter}${index + 1}`)
  }
  return codes
}

// ---------------------------------------------------------------------------------------------
// Slots

/** Rounds to the 8-unit grid. */
export function round8(value: number): number {
  return Math.round(value / 8) * 8
}

/**
 * Offsets from the start of a side of length `length` for `count` evenly spread attachments:
 * `round((i + 1) * length / (count + 1))`, kept at least 12 away from either corner. A single
 * attachment is exactly centered, so straight arrows between aligned boxes stay straight.
 */
export function slotOffsets(length: number, count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const raw = Math.round(((i + 1) * length) / (count + 1))
    out.push(Math.max(12, Math.min(length - 12, raw)))
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Node index

export interface NodeIndexEntry {
  readonly nodeNumber: string
  readonly name: string
  readonly depth: number
  /** The function this entry stands for (null for the A-0 entry). */
  readonly functionId: string | null
  /** The diagram to open for the entry (null when the box has no child diagram). */
  readonly diagramId: string | null
}

/** Outline of all node numbers with box names, indented by hierarchy: `A-0`, `A0`, `A1`, `A11`, ... */
export function buildNodeIndex(model: Elem): NodeIndexEntry[] {
  const out: NodeIndexEntry[] = []
  const top = model['topFunction'] as Elem | null
  const context = contextDiagramOf(model)
  out.push({ nodeNumber: 'A-0', name: (top?.['name'] as string | undefined) ?? '', depth: 0, functionId: null, diagramId: context?._id ?? null })
  const visit = (fn: Elem, depth: number): void => {
    out.push({
      nodeNumber: nodeNumber(fn),
      name: (fn['name'] as string | undefined) ?? '',
      depth,
      functionId: fn._id,
      diagramId: ((fn['childDiagram'] as Elem | null)?._id ?? null)
    })
    const children = [...list(fn, 'functions')].sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
    for (const child of children) visit(child, depth + 1)
  }
  if (top) visit(top, 1)
  return out
}
