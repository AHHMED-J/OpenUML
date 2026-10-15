/**
 * Pure helpers over the IDEF0 model: derived node numbers, node references, the staircase
 * renumbering plan, ICOM codes of boundary ports, side slots and the node index. Nothing here
 * is stored except `IDEF0Function.boxNumber`; every other value is computed from the model.
 */
import { ModelRuleError } from './errors'
import { isKindOf } from './metamodel'
import type { Elem, NodeView, Point, View } from './types'
import { listField } from './fields'

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

export function isIdef0Function(el: Elem | null | undefined): el is Elem {
  return isKindOf(el, 'IDEF0Function')
}

export function roleOf(arrow: Elem): Idef0Role {
  return (arrow['role'] as Idef0Role | undefined) ?? 'input'
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
  return listField(model, 'ownedElements').find((e) => isKindOf(e, 'IDEF0Diagram') && isContextDiagram(e)) ?? null
}

/** The function views shown by a diagram (views whose model is a function). */
export function functionViewsOf(diagram: Elem): NodeView[] {
  return listField(diagram, 'ownedViews').filter((v) => v._type === 'IDEF0FunctionView' && isIdef0Function(v['model'] as Elem | null)) as NodeView[]
}

/** The function boxes a diagram shows: the top function on A-0, else the children of the detailed function. */
export function functionsOfDiagram(diagram: Elem): Elem[] {
  const scope = scopeOf(diagram)
  if (!scope) return []
  if (isContextDiagram(diagram)) return isKindOf(scope, 'IDEF0Model') && scope['topFunction'] ? [scope['topFunction'] as Elem] : []
  return listField(scope, 'functions')
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

/**
 * Display label of an IDEF0 diagram: its node number and kind before its name
 * (`A-0 Context diagram: Top Function`, `A0 Diagram: Top Function`, `A2 Diagram: Check Stock`).
 * A diagram is named after the function it details, so without the kind the explorer would show
 * the A0 diagram and the A0 function as two identical entries. Display only: the stored name is
 * the plain name.
 */
export function idef0DiagramLabel(diagram: Elem, name: string): string {
  const number = diagramNodeNumber(diagram)
  if (!number) return name
  return `${number} ${isContextDiagram(diagram) ? 'Context diagram' : 'Diagram'}: ${name}`
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

/** The sibling boxes of `fn` (the functions of its owner); the top function has none. */
function siblingBoxes(fn: Elem): Elem[] {
  const parent = fn._parent
  return isIdef0Function(parent) ? listField(parent, 'functions') : []
}

/** Smallest box number (from 1) none of `functions` uses: a new box closes a gap or comes last. */
export function nextFreeBoxNumber(functions: readonly Elem[]): number {
  const used = new Set(functions.map((f) => f['boxNumber'] as number))
  let n = 1
  while (used.has(n)) n++
  return n
}

/**
 * Box number changes that give `fn` the number `boxNumber` (Properties > Box Number): the box
 * holding that number takes the old number of `fn`, so numbers never duplicate nor open a gap.
 * Everything else (node numbers of the sub-tree, ICOM codes, titles, labels) is derived from
 * `boxNumber` and follows. Throws a `ModelRuleError` for the top function or a number outside
 * 1..n (n = the boxes of the diagram, at least the largest number in use).
 */
export function planBoxNumberSwap(fn: Elem, boxNumber: number): BoxNumberChange[] {
  if (!isIdef0Function(fn)) return []
  const siblings = siblingBoxes(fn)
  if (siblings.length === 0) throw new ModelRuleError('The box of the A-0 diagram keeps box number 0')
  const max = Math.max(siblings.length, ...siblings.map((f) => f['boxNumber'] as number))
  if (!Number.isInteger(boxNumber) || boxNumber < 1 || boxNumber > max) {
    throw new ModelRuleError(`Box numbers of this diagram go from 1 to ${max}`)
  }
  const old = fn['boxNumber'] as number
  if (old === boxNumber) return []
  const changes: BoxNumberChange[] = [{ fn, boxNumber }]
  for (const other of siblings) if (other !== fn && other['boxNumber'] === boxNumber) changes.push({ fn: other, boxNumber: old })
  return changes
}

/**
 * Box number changes that close the gaps left among `functions` (after boxes were removed): the
 * boxes keep their relative order (by number, then model order) and are numbered 1..n.
 */
export function planCloseGaps(functions: readonly Elem[]): BoxNumberChange[] {
  const ordered = functions.map((fn, i) => ({ fn, i })).sort((a, b) => (a.fn['boxNumber'] as number) - (b.fn['boxNumber'] as number) || a.i - b.i)
  const changes: BoxNumberChange[] = []
  ordered.forEach(({ fn }, i) => {
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

/** The arrow a branch leaves (fork) or joins, or null for an arrow between boxes and ports. */
export function trunkOf(arrow: Elem): Elem | null {
  const source = arrow['source'] as Elem | null
  const target = arrow['target'] as Elem | null
  return isKindOf(source, 'IDEF0Arrow') ? source : isKindOf(target, 'IDEF0Arrow') ? target : null
}

function boundaryPortOf(arrow: Elem): Elem | null {
  const source = arrow['source'] as Elem | null
  const target = arrow['target'] as Elem | null
  return isKindOf(source, 'IDEF0Port') ? source : isKindOf(target, 'IDEF0Port') ? target : null
}

/** Deepest chain of labels followed (branches of branches, levels of decomposition). */
const LABEL_DEPTH = 64

/**
 * The label drawn on an arrow: its own name, else, for a boundary arrow of a child diagram, the
 * effective label of the parent arrow its port stands for. That parent arrow is often an unlabeled
 * branch whose label is its trunk's, so a boundary arrow seeded from it (or written by an older
 * version, with an empty name) still reads "Shipping rates" on the child diagram. An unlabeled
 * branch draws nothing: it shares its trunk's label.
 */
export function shownArrowName(arrow: Elem, depth = 0): string {
  const own = (arrow['name'] as string | undefined) ?? ''
  if (own || trunkOf(arrow) || depth > LABEL_DEPTH) return own
  const parent = boundaryPortOf(arrow)?.['corresponds'] as Elem | null | undefined
  return parent ? effectiveArrowName(parent, depth + 1) : ''
}

/**
 * The label an arrow carries (IDEF0 label inheritance): `shownArrowName`, else, for an unlabeled
 * branch, the effective label of its trunk. Used to label child boundary arrows, by the validator
 * and in the explorer.
 */
export function effectiveArrowName(arrow: Elem, depth = 0): string {
  const shown = shownArrowName(arrow, depth)
  if (shown || depth > LABEL_DEPTH) return shown
  const trunk = trunkOf(arrow)
  return trunk ? effectiveArrowName(trunk, depth + 1) : ''
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
  const views = listField(diagram, 'ownedViews') as View[]
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
  const arrows = listField(parentScope, 'arrows')
  const find = viewFinder(parentDiagram)
  for (const port of listField(detailed, 'ports')) {
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
// Arrows of a box, by role and position along its sides

/** The ICOM roles in IDEF0 reading order (also the order of the explorer's role folders). */
export const ROLE_ORDER: readonly Idef0Role[] = ['input', 'control', 'output', 'mechanism', 'call']

/** Display name of a role (`Input`, `Control`, ...). */
export const ROLE_TITLE: Readonly<Record<Idef0Role, string>> = {
  input: 'Input',
  control: 'Control',
  output: 'Output',
  mechanism: 'Mechanism',
  call: 'Call'
}

/** Plural display name of a role (`Inputs`, `Controls`, ...). */
export const ROLE_PLURAL: Readonly<Record<Idef0Role, string>> = {
  input: 'Inputs',
  control: 'Controls',
  output: 'Outputs',
  mechanism: 'Mechanisms',
  call: 'Calls'
}

/**
 * The roles an arrow has at a box it touches directly: the role of its target end
 * (input/control/mechanism) and `output` (or `call`) at its source end. A box feeding itself gets
 * both; an arrow that does not touch `fn` gets none.
 */
export function rolesAt(arrow: Elem, fn: Elem): Idef0Role[] {
  const roles: Idef0Role[] = []
  const role = roleOf(arrow)
  if (arrow['target'] === fn && role !== 'call' && role !== 'output') roles.push(role)
  if (arrow['source'] === fn) roles.push(role === 'call' ? 'call' : 'output')
  return roles
}

/** The diagram drawing the arrows of a scope (A-0 for the model, else the function's child diagram). */
function diagramOfArrowScope(scope: Elem | null): Elem | null {
  if (!scope) return null
  if (isKindOf(scope, 'IDEF0Model')) return contextDiagramOf(scope)
  return (scope['childDiagram'] as Elem | null) ?? null
}

/** Coordinate along a box side where the `end` of an arrow view's stored route attaches. */
function endCoordinate(end: 'source' | 'target', side: Idef0Side, view: View | undefined): number {
  const points = (view?.['points'] as readonly Point[] | undefined) ?? []
  const p = end === 'target' ? points[points.length - 1] : points[0]
  if (!p) return Number.POSITIVE_INFINITY
  return side === 'top' || side === 'bottom' ? p.x : p.y
}

/**
 * The arrows touching function box `fn` on its own diagram, grouped by their role at the box in
 * `ROLE_ORDER` and numbered along each side as the ICOM codes are: top to bottom for inputs and
 * outputs, left to right for controls, mechanisms and calls (by the stored attachment points;
 * arrows without a route keep model order). Roles without arrows are left out.
 */
export function boxArrowGroups(fn: Elem, viewOfArrow?: (arrow: Elem) => View | undefined): Array<{ role: Idef0Role; arrows: Elem[] }> {
  const scope = fn._parent
  const arrows = listField(scope, 'arrows').filter((a) => isKindOf(a, 'IDEF0Arrow') && (a['source'] === fn || a['target'] === fn))
  if (arrows.length === 0) return []
  const find = viewOfArrow ?? viewFinder(diagramOfArrowScope(scope))
  const groups: Array<{ role: Idef0Role; arrows: Elem[] }> = []
  for (const role of ROLE_ORDER) {
    const end = role === 'output' || role === 'call' ? 'source' : 'target'
    const side = ROLE_SIDE[role]
    const keyed = arrows
      .filter((a) => rolesAt(a, fn).includes(role))
      .map((a, i) => ({ a, i, c: endCoordinate(end, side, find(a)) }))
    if (keyed.length === 0) continue
    keyed.sort((x, y) => (x.c === y.c ? x.i - y.i : x.c - y.c))
    groups.push({ role, arrows: keyed.map((k) => k.a) })
  }
  return groups
}

/**
 * Label of an arrow in lists: its name, the label a child boundary arrow inherits (`shownArrowName`),
 * or for a call arrow its `calledNode` text or the called box's reference.
 */
export function arrowDisplayName(arrow: Elem): string {
  const name = (arrow['name'] as string | undefined) ?? ''
  if (name) return name
  if (roleOf(arrow) !== 'call') return shownArrowName(arrow)
  const text = (arrow['calledNode'] as string | undefined) ?? ''
  if (text) return text
  const caller = arrow['source'] as Elem | null
  const called = isIdef0Function(caller) ? (caller['calledFunction'] as Elem | null) : null
  return called ? functionReference(called) : ''
}

/** `Role N: name`, or just `Role N` for an unnamed arrow (`Input 1: Customer Order`, `Output 2`). */
export function arrowRoleLabel(role: Idef0Role, position: number, name: string): string {
  const head = `${ROLE_TITLE[role]} ${position}`
  return name ? `${head}: ${name}` : head
}

// ---------------------------------------------------------------------------------------------
// Slots

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
    const children = [...listField(fn, 'functions')].sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
    for (const child of children) visit(child, depth + 1)
  }
  if (top) visit(top, 1)
  return out
}
