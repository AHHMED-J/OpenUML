/**
 * IDEF0 factories: the model with its A-0 context diagram, decomposition diagrams (child boxes
 * seeded with the parent box's arrows), function boxes, model notes, arrows (ICOM roles, boundary
 * ports, fork/join branches, call arrows) and the connection rules. Called from `factories.ts`.
 */
import { isKindOf } from './metamodel'
import type { CreationPlan, DiagramPlan, EdgeRequest, Insertion, NodeRequest, RefAddition } from './factories'
import {
  attachedArrows,
  contextDiagramOf,
  isContextDiagram,
  isIdef0Function,
  ROLE_SIDE,
  roleOf,
  slotOffsets,
  viewFinder,
  type Idef0Role,
  type Idef0Side
} from './idef0-numbering'
import type { Diagram, Elem, NodeView, Point, View } from './types'
import { addSubView, boundsOf, createElement, defaultName, nextName } from './view-builders'
import { DEFAULT_FONT, fontWith } from './values'

export type Idef0NodeKind = 'IDEF0Function' | 'IDEF0ModelNote'
export type Idef0EdgeKind = 'IDEF0Arrow' | 'IDEF0Call'

/** Sheet geometry in diagram units (spec 11 §1.11). */
export const IDEF0_SHEET = { left: 8, top: 8, width: 1008, height: 752 } as const
/** Drawing (message) area: the rectangle the boundary ports sit on. */
export const IDEF0_AREA = { left: 24, top: 64, right: 1000, bottom: 696 } as const
export const IDEF0_BOX = { width: 168, height: 88, minWidth: 120, minHeight: 64 } as const
export const IDEF0_CONTEXT_BOX = { width: 240, height: 120 } as const
export const IDEF0_PORT_SIZE = 8
const FIRST_BOX = { left: 120, top: 110 } as const
const LABEL_FONT = fontWith(DEFAULT_FONT, { size: 12 })

export const IDEF0_NODE_KINDS = {
  IDEF0Function: { modelType: 'IDEF0Function', viewType: 'IDEF0FunctionView', field: 'functions', size: [IDEF0_BOX.width, IDEF0_BOX.height] },
  IDEF0ModelNote: { modelType: 'IDEF0ModelNote', viewType: 'IDEF0NoteView', field: 'ownedElements', size: [16, 16] }
} as const

export const IDEF0_EDGE_KINDS = {
  IDEF0Arrow: { modelType: 'IDEF0Arrow', viewType: 'IDEF0ArrowView', ownedBy: { field: 'arrows' } },
  IDEF0Call: { modelType: 'IDEF0Arrow', viewType: 'IDEF0ArrowView', ownedBy: { field: 'arrows' } }
} as const

export function isIdef0NodeKind(kind: string): kind is Idef0NodeKind {
  return kind === 'IDEF0Function' || kind === 'IDEF0ModelNote'
}

export function isIdef0EdgeKind(kind: string): kind is Idef0EdgeKind {
  return kind === 'IDEF0Arrow' || kind === 'IDEF0Call'
}

function list(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

function ownedElementsOf(el: Elem): Elem[] {
  return list(el, 'ownedElements')
}

// ---------------------------------------------------------------------------------------------
// Views

function frameView(diagram: Diagram): NodeView {
  const frame = createElement<NodeView>('IDEF0FrameView', { model: diagram, ...IDEF0_SHEET })
  frame._parent = diagram
  return frame
}

/** Bounds of a boundary port view centered on the area edge of `role` at coordinate `along`. */
export function portBounds(role: Idef0Role, along: number): { left: number; top: number; width: number; height: number } {
  const half = IDEF0_PORT_SIZE / 2
  const size = { width: IDEF0_PORT_SIZE, height: IDEF0_PORT_SIZE }
  switch (ROLE_SIDE[role]) {
    case 'left':
      return { left: IDEF0_AREA.left - half, top: along - half, ...size }
    case 'right':
      return { left: IDEF0_AREA.right - half, top: along - half, ...size }
    case 'top':
      return { left: along - half, top: IDEF0_AREA.top - half, ...size }
    default:
      return { left: along - half, top: IDEF0_AREA.bottom - half, ...size }
  }
}

function arrowLabel(edge: View): View {
  const label = createElement<View>('EdgeLabelView', {
    parentStyle: false,
    font: LABEL_FONT,
    left: 0,
    top: 0,
    height: LABEL_FONT.size,
    alpha: Math.PI / 2,
    distance: 12,
    hostEdge: edge,
    edgePosition: 1
  })
  addSubView(edge, label)
  edge['nameLabel'] = label
  return label
}

function arrowView(model: Elem, tail: View | null, head: View | null): View {
  const view = createElement<View>('IDEF0ArrowView', { model, tail, head, points: [] })
  arrowLabel(view)
  return view
}

// ---------------------------------------------------------------------------------------------
// Diagrams

/**
 * Plans an IDEF0 diagram. On a project or package: a new IDEF0 model with its top function and the
 * A-0 context diagram (one box). On a function without a child diagram: its decomposition (3 boxes).
 */
export function planIdef0Diagram(owner: Elem, name?: string): DiagramPlan {
  if (isIdef0Function(owner)) {
    if (owner['childDiagram']) throw new Error('The function already has a child diagram')
    return planDecompose(owner, 3, name)
  }
  if (isKindOf(owner, 'IDEF0Model')) throw new Error('The model already has an A-0 context diagram')
  const model = createElement('IDEF0Model', { name: nextName(ownedElementsOf(owner), 'IDEF0 Model ') })
  const top = createElement('IDEF0Function', { name: 'Top Function', boxNumber: 0, _parent: model })
  const diagram = createElement<Diagram>('IDEF0Diagram', { name: name ?? (top['name'] as string), diagramKind: 'context', _parent: model })
  model['topFunction'] = top
  ownedElementsOf(model).push(top, diagram)
  diagram.ownedViews.push(frameView(diagram))
  const box = createElement<NodeView>('IDEF0FunctionView', {
    model: top,
    left: 392,
    top: 290,
    width: IDEF0_CONTEXT_BOX.width,
    height: IDEF0_CONTEXT_BOX.height
  })
  box._parent = diagram
  diagram.ownedViews.push(box)
  return { diagram, model, view: null, insertions: [{ owner, field: 'ownedElements', element: model }], refAdditions: [] }
}

/** The diagram showing the arrows of a scope: A-0 for the model, the child diagram for a function. */
export function diagramOfScope(scope: Elem | null): Elem | null {
  if (!scope) return null
  if (isKindOf(scope, 'IDEF0Model')) return contextDiagramOf(scope)
  return (scope['childDiagram'] as Elem | null) ?? null
}

/** Origin and size of the i-th of n boxes on the staircase (spec 11 §1.11, compressed to fit the sheet for n > 3). */
export function staircaseBox(index: number, count: number): { left: number; top: number; width: number; height: number } {
  const small = count >= 5
  const width = small ? 144 : IDEF0_BOX.width
  const height = small ? 72 : IDEF0_BOX.height
  const steps = Math.max(1, count - 1)
  const dx = Math.min(280, Math.floor(((IDEF0_AREA.right - 40 - width - FIRST_BOX.left) / steps) / 8) * 8)
  const dy = Math.min(150, Math.floor(((IDEF0_AREA.bottom - 60 - height - FIRST_BOX.top) / steps) / 8) * 8)
  return { left: FIRST_BOX.left + index * dx, top: FIRST_BOX.top + index * dy, width, height }
}

interface BoxSlot {
  fn: Elem
  view: NodeView
}

/**
 * Plans the decomposition of `fn` into `count` boxes. The new diagram is owned by `fn` and set as
 * its `childDiagram`. Every arrow attached to `fn` on its own diagram that is not tunneled at the
 * connected end (call arrows excluded) gets a boundary port (ICOM role of the parent attachment,
 * `corresponds` = the parent arrow) and a default-wired arrow: inputs to the first box, controls
 * forked to every box, mechanisms to the first box, outputs from the last box.
 */
export function planDecompose(fn: Elem, count = 3, name?: string): DiagramPlan {
  if (!isIdef0Function(fn)) throw new Error('Only a function can be decomposed')
  if (fn['childDiagram']) throw new Error('The function already has a child diagram')
  const n = Math.max(1, Math.min(6, Math.round(count)))
  const diagram = createElement<Diagram>('IDEF0Diagram', { name: name ?? (fn['name'] as string), diagramKind: 'decomposition' })
  diagram.ownedViews.push(frameView(diagram))
  const insertions: Insertion[] = []
  const functions: Elem[] = []
  const ports: Elem[] = []
  const arrows: Elem[] = []
  const add = (view: View): View => {
    view._parent = diagram
    diagram.ownedViews.push(view)
    return view
  }

  const boxes: BoxSlot[] = []
  const existing = list(fn, 'functions')
  for (let i = 0; i < n; i++) {
    const child = createElement('IDEF0Function', { name: nextName([...existing, ...functions], 'New Function '), boxNumber: i + 1 })
    functions.push(child)
    boxes.push({ fn: child, view: add(createElement<NodeView>('IDEF0FunctionView', { model: child, ...staircaseBox(i, n) })) as NodeView })
  }

  // Parent attachments, in their order along the parent box sides.
  const parentScope = fn._parent
  const parentArrows = list(parentScope, 'arrows')
  const find = viewFinder(diagramOfScope(parentScope))
  const first = boxes[0] as BoxSlot
  const last = boxes[boxes.length - 1] as BoxSlot
  const perSide = new Map<string, number>()
  const attached = (role: Idef0Role): Elem[] =>
    attachedArrows(fn, role, parentArrows, (a) => find(a)).filter((a) => (role === 'output' ? !a['tunnelSource'] : !a['tunnelTarget']))
  const takeSlot = (b: BoxSlot, side: Idef0Side, total: number): number => {
    const key = `${b.fn._id}:${side}`
    const index = perSide.get(key) ?? 0
    perSide.set(key, index + 1)
    const box = boundsOf(b.view)!
    const length = side === 'left' || side === 'right' ? box.height : box.width
    const offset = slotOffsets(length, total)[index] ?? length / 2
    return side === 'left' || side === 'right' ? box.top + offset : box.left + offset
  }
  const addPort = (role: Idef0Role, parent: Elem, along: number): View => {
    const port = createElement('IDEF0Port', { role, corresponds: parent })
    ports.push(port)
    return add(createElement<NodeView>('IDEF0PortView', { model: port, ...portBounds(role, along) }))
  }
  const addArrow = (role: Idef0Role, label: string, source: Elem | null, target: Elem | null, tail: View, head: View): View => {
    const arrow = createElement('IDEF0Arrow', { name: label, role, source, target })
    arrows.push(arrow)
    return add(arrowView(arrow, tail, head))
  }

  for (const role of ['input', 'control', 'mechanism'] as Idef0Role[]) {
    const parents = attached(role).filter((a) => roleOf(a) !== 'call')
    for (const parent of parents) {
      const along = takeSlot(first, ROLE_SIDE[role], parents.length)
      const portView = addPort(role, parent, along)
      const trunk = addArrow(role, parent['name'] as string, portView.model, first.fn, portView, first.view)
      if (role === 'control') {
        for (const box of boxes.slice(1)) addArrow('control', '', trunk.model, box.fn, trunk, box.view)
      }
    }
  }
  const outputs = attached('output')
  for (const parent of outputs) {
    const portView = addPort('output', parent, takeSlot(last, 'right', outputs.length))
    addArrow('output', parent['name'] as string, last.fn, portView.model, last.view, portView)
  }

  for (const child of functions) insertions.push({ owner: fn, field: 'functions', element: child })
  for (const port of ports) insertions.push({ owner: fn, field: 'ports', element: port })
  for (const arrow of arrows) insertions.push({ owner: fn, field: 'arrows', element: arrow })
  insertions.push({ owner: fn, field: 'ownedElements', element: diagram })
  return {
    diagram,
    model: diagram,
    view: null,
    insertions,
    refAdditions: [],
    sets: [{ owner: fn, field: 'childDiagram', value: diagram }]
  }
}

// ---------------------------------------------------------------------------------------------
// Nodes

/** Throws unless `req` is a legal place for an IDEF0 node. */
function requireDecomposition(diagram: Diagram): void {
  if (isContextDiagram(diagram)) throw new Error('The A-0 diagram holds exactly one box')
}

export function planIdef0Node(req: NodeRequest): CreationPlan {
  const spec = IDEF0_NODE_KINDS[req.kind as Idef0NodeKind]
  const scope = req.diagram._parent
  if (!scope) throw new Error('Diagram has no owner')
  const bounds = {
    left: Math.round(req.left),
    top: Math.round(req.top),
    width: Math.round(req.width ?? spec.size[0]),
    height: Math.round(req.height ?? spec.size[1])
  }
  const insertions: Insertion[] = []
  const refAdditions: RefAddition[] = []
  let model: Elem
  let view: View
  if (req.kind === 'IDEF0Function') {
    requireDecomposition(req.diagram)
    const siblings = list(scope, 'functions')
    const boxNumber = siblings.reduce((m, f) => Math.max(m, f['boxNumber'] as number), 0) + 1
    model = createElement('IDEF0Function', { name: req.name ?? nextName(siblings, 'New Function '), boxNumber })
    insertions.push({ owner: scope, field: 'functions', element: model })
    view = createElement<NodeView>('IDEF0FunctionView', { model, ...bounds, width: Math.max(IDEF0_BOX.minWidth, bounds.width), height: Math.max(IDEF0_BOX.minHeight, bounds.height) })
  } else {
    const notes = ownedElementsOf(scope).filter((e) => isKindOf(e, 'IDEF0ModelNote'))
    const number = notes.reduce((m, e) => Math.max(m, e['number'] as number), 0) + 1
    model = createElement('IDEF0ModelNote', { name: req.name ?? defaultName('IDEF0ModelNote', notes), number })
    insertions.push({ owner: scope, field: 'ownedElements', element: model })
    view = createElement<NodeView>('IDEF0NoteView', { model, ...bounds, width: 16, height: 16 })
  }
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
  return { model, view, insertions, refAdditions }
}

// ---------------------------------------------------------------------------------------------
// Arrows

function isFunctionView(v: View | null | undefined): v is View {
  return !!v && v._type === 'IDEF0FunctionView'
}
function isPortView(v: View | null | undefined): v is View {
  return !!v && v._type === 'IDEF0PortView'
}
function isArrowView(v: View | null | undefined): v is View {
  return !!v && v._type === 'IDEF0ArrowView'
}

/** True when following arrow-to-arrow references from `start` reaches `target`. */
function reaches(start: Elem | null, target: Elem): boolean {
  const seen = new Set<Elem>()
  let current: Elem | null = start
  while (current && isKindOf(current, 'IDEF0Arrow') && !seen.has(current)) {
    if (current === target) return true
    seen.add(current)
    current = (current['source'] as Elem | null) ?? null
  }
  return false
}

function callArrowsOf(fn: Elem | null): number {
  return fn ? list(fn._parent, 'arrows').filter((a) => roleOf(a) === 'call' && a['source'] === fn).length : 0
}

/** Whether an arrow of `kind` may connect `tail` to `head` (spec 11 §2.4). */
export function canConnectIdef0(kind: Idef0EdgeKind, tail: View, head: View): boolean {
  if (tail === head) return false
  if (kind === 'IDEF0Call') return isFunctionView(tail) && isFunctionView(head) && callArrowsOf(tail.model) === 0
  const tm = tail.model
  const hm = head.model
  if (isArrowView(tail)) {
    // Fork: a new branch leaves an existing arrow.
    if (isArrowView(head) || !tm || reaches(hm, tm)) return false
    return isFunctionView(head) || (isPortView(head) && hm?.['role'] === 'output')
  }
  if (isFunctionView(tail)) {
    if (isArrowView(head)) return !reaches(tm, hm as Elem)
    return isFunctionView(head) || (isPortView(head) && hm?.['role'] === 'output')
  }
  if (isPortView(tail)) {
    if (tm?.['role'] === 'output') return false
    return isFunctionView(head) || isArrowView(head)
  }
  return false
}

/** Role the arrow takes as seen by its function end, from the kind of its ends. */
function defaultRole(tail: View | null, head: View | null): Idef0Role {
  if (isPortView(head)) return 'output'
  if (isArrowView(head)) return 'output'
  if (isArrowView(tail)) return roleOf(tail.model as Elem)
  return 'input'
}

export interface Idef0ArrowRequest {
  readonly diagram: Diagram
  readonly role?: Idef0Role
  /** Existing tail view, or null to start a new boundary port at `at`. */
  readonly tail: View | null
  readonly head: View | null
  /** Where the free end was released (decides the port position along its edge). */
  readonly at?: Point
  readonly name?: string
  readonly call?: boolean
}

function clampAlong(role: Idef0Role, value: number): number {
  const vertical = ROLE_SIDE[role] === 'left' || ROLE_SIDE[role] === 'right'
  const lo = (vertical ? IDEF0_AREA.top : IDEF0_AREA.left) + 16
  const hi = (vertical ? IDEF0_AREA.bottom : IDEF0_AREA.right) - 16
  return Math.max(lo, Math.min(hi, Math.round(value / 8) * 8))
}

/**
 * Plans an arrow between two views; a missing end creates a boundary port on the area edge of the
 * role. The arrow belongs to the scope of the diagram.
 */
export function planIdef0Arrow(req: Idef0ArrowRequest): CreationPlan {
  const scope = req.diagram._parent
  if (!scope) throw new Error('Diagram has no owner')
  const insertions: Insertion[] = []
  let tail = req.tail
  let head = req.head
  const role: Idef0Role = req.call ? 'call' : (req.role ?? defaultRole(tail, head))
  if (!tail && !head) throw new Error('An arrow needs at least one end on a box')
  const at = req.at ?? { x: 0, y: 0 }
  const addPort = (portRole: Idef0Role, along: number): View => {
    const port = createElement('IDEF0Port', { role: portRole })
    insertions.push({ owner: scope, field: 'ports', element: port })
    const view = createElement<NodeView>('IDEF0PortView', { model: port, ...portBounds(portRole, clampAlong(portRole, along)) })
    insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
    return view
  }
  const alongOf = (portRole: Idef0Role): number => (ROLE_SIDE[portRole] === 'left' || ROLE_SIDE[portRole] === 'right' ? at.y : at.x)
  if (!tail && head) tail = addPort(role === 'output' ? 'input' : (role as Idef0Role), alongOf(role))
  if (tail && !head && role !== 'call') head = addPort('output', alongOf('output'))
  const model = createElement('IDEF0Arrow', {
    name: req.name ?? '',
    role,
    source: tail?.model ?? null,
    target: role === 'call' ? null : (head?.model ?? null)
  })
  insertions.unshift({ owner: scope, field: 'arrows', element: model })
  const view = arrowView(model, tail, role === 'call' ? null : head)
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
  const sets = role === 'call' && head?.model ? [{ owner: tail?.model as Elem, field: 'calledFunction', value: head.model }] : []
  return { model, view, insertions: orderPorts(insertions), refAdditions: [], ...(sets.length > 0 ? { sets } : {}) }
}

/** Ports are inserted before the arrow that refers to them, views last. */
function orderPorts(insertions: Insertion[]): Insertion[] {
  const rank = (i: Insertion): number => (i.field === 'ports' ? 0 : i.field === 'arrows' ? 1 : 2)
  return [...insertions].sort((a, b) => rank(a) - rank(b))
}

export function planIdef0Edge(req: EdgeRequest): CreationPlan {
  return planIdef0Arrow({
    diagram: req.diagram,
    tail: req.tail,
    head: req.head,
    call: req.kind === 'IDEF0Call',
    ...(req.role ? { role: req.role as Idef0Role } : {}),
    ...(req.name ? { name: req.name } : {})
  })
}

/** A boundary arrow of `role` attached to `fnView`, with its port aligned to the box. */
export function planBoundaryArrow(diagram: Diagram, fnView: View, role: 'input' | 'control' | 'output' | 'mechanism', name = ''): CreationPlan {
  const box = boundsOf(fnView)
  if (!box) throw new Error('The function view has no bounds')
  const along = ROLE_SIDE[role] === 'left' || ROLE_SIDE[role] === 'right' ? box.top + box.height / 2 : box.left + box.width / 2
  const at = { x: along, y: along }
  return role === 'output'
    ? planIdef0Arrow({ diagram, role, tail: fnView, head: null, at, name })
    : planIdef0Arrow({ diagram, role, tail: null, head: fnView, at, name })
}
