/**
 * Assigning parent arrows to the boxes of a child diagram. A boundary port linked to an arrow of
 * the parent box (`corresponds`) stands for that arrow on the child diagram; the modeler decides
 * which boxes it reaches, the app never wires it by itself:
 *
 * - A linked port with no arrow is a **pending arrow** (`pending.ts`): drawn as a dashed stub on
 *   the frame edge, warning W19, until it is assigned.
 * - `assignParentArrow(env, port, boxes)` makes the port's arrow tree reach exactly `boxes` in one
 *   undo step: none (pending again), one box (one arrow), or several (a fork; a join for outputs).
 *   Arrows to boxes that stay are kept with their labels and route hints; unchecking the box of
 *   the trunk promotes a branch to trunk. Every UI path (the gesture, the box table, the Advanced
 *   Arrows panel) goes through it.
 * - `addMissingPorts` gives a decomposed box's child diagram a pending port for every parent arrow
 *   it lacks; it runs inside every geometry operation (see `hooks.ts`), so an arrow added to the
 *   parent box later waits on the child diagram too.
 *
 * The parent level is never touched. A box that is unassigned and has its own child diagram loses
 * the boundary arrows standing for the flow there (`assignmentLosses` lists them for a warning).
 */
import { applyPlan, deleteFromModel, type OperationBuilder } from '../../commands'
import {
  ModelRuleError,
  attachedArrows,
  createElement,
  diagramOfScope,
  drawingAreaOf,
  effectiveArrowName,
  isIdef0Function,
  isKindOf,
  listField,
  planIdef0Arrow,
  portBounds,
  roleOf,
  rootArrow,
  viewFinder,
  type Diagram,
  type Elem,
  type Idef0Role,
  type NodeView,
  type View
} from '../../model'
import type { Point, Rect } from '../core'
import { layoutOf, withGeometry, type DiagramEnv } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import { PENDING_HANDLE, type PortData } from './layout'
import { isLinkedPort, isPendingPort } from './pending'
import { childCounterparts, syncLevels } from './propagation'

/** What a parent arrow reaches on its child diagram. */
export interface PortAssignment {
  readonly port: Elem
  /** The parent arrow the port stands for. */
  readonly parent: Elem
  readonly role: Idef0Role
  /** The boxes the port's arrow tree reaches, in box-number order. */
  readonly boxes: readonly Elem[]
  /** Why the assignment can't be edited (tunneled ends, a branch ending elsewhere), or null. */
  readonly readOnly: string | null
}

const READ_ONLY = {
  tunneled: 'A tunneled arrow keeps its boxes: edit it on the canvas',
  shape: 'This arrow branches to another arrow or to the frame edge: edit it on the canvas'
} as const


/** The end of an arrow that leads away from the port (toward the boxes) for a port of `role`. */
function farField(role: Idef0Role): 'source' | 'target' {
  return role === 'output' ? 'source' : 'target'
}

/** The end of an arrow that leads back to the port. */
function nearField(role: Idef0Role): 'source' | 'target' {
  return role === 'output' ? 'target' : 'source'
}

/** The arrows of the port's tree: the arrows at the port, then their branches (forks; joins for outputs), trunk first. */
function treeOf(port: Elem): Elem[] {
  const role = roleOf(port)
  const near = nearField(role)
  const arrows = listField(port._parent, 'arrows')
  const tree: Elem[] = []
  const queue = arrows.filter((a) => a[near] === port)
  while (queue.length > 0 && tree.length < 256) {
    const a = queue.shift() as Elem
    if (tree.includes(a)) continue
    tree.push(a)
    queue.push(...arrows.filter((x) => x[near] === a))
  }
  return tree
}

/** The current assignment of a linked port, or null for a port that stands for no parent arrow. */
export function portAssignment(port: Elem): PortAssignment | null {
  if (!isLinkedPort(port)) return null
  const role = roleOf(port)
  const far = farField(role)
  const tree = treeOf(port)
  const scope = port._parent as Elem
  const arrows = listField(scope, 'arrows')
  const boxes: Elem[] = []
  let readOnly: string | null = null
  for (const a of tree) {
    const end = a[far] as Elem | null
    if (a['tunnelSource'] || a['tunnelTarget']) readOnly ??= READ_ONLY.tunneled
    // Every arrow of the tree ends on a box of the diagram, once per box, and nothing joins a fork
    // tree from the other side (or forks off a join tree).
    if (!isIdef0Function(end) || end._parent !== scope || boxes.includes(end) || roleOf(a) === 'call') readOnly ??= READ_ONLY.shape
    else boxes.push(end)
    if (arrows.some((x) => x[far] === a)) readOnly ??= READ_ONLY.shape
  }
  boxes.sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
  return { port, parent: port['corresponds'] as Elem, role, boxes, readOnly }
}

/**
 * The port standing for a parent arrow that `el` belongs to: the port itself, or the port at the
 * root of the arrow's fork or join tree. Null for arrows between boxes and unlinked ports.
 */
export function linkedPortOf(el: Elem | null | undefined): Elem | null {
  if (isLinkedPort(el)) return el
  let current = el
  for (let guard = 0; current && isKindOf(current, 'IDEF0Arrow') && guard < 64; guard++) {
    const source = current['source'] as Elem | null
    const target = current['target'] as Elem | null
    if (isLinkedPort(source)) return source
    if (isLinkedPort(target)) return target
    current = isKindOf(source, 'IDEF0Arrow') ? source : isKindOf(target, 'IDEF0Arrow') ? target : null
  }
  return null
}

/** The arrow of the port's tree that reaches `box`. */
export function arrowToBox(port: Elem, box: Elem): Elem | null {
  const far = farField(roleOf(port))
  return treeOf(port).find((a) => a[far] === box) ?? null
}

/**
 * The boundary arrows (and their ports) one or more levels down that go away when the port stops
 * reaching the boxes not in `boxes`: those standing for the flow on the child diagrams of the
 * unassigned boxes.
 */
export function assignmentLosses(port: Elem, boxes: readonly Elem[]): Elem[] {
  const current = portAssignment(port)
  if (!current) return []
  const removed = current.boxes.filter((b) => !boxes.includes(b)).map((b) => arrowToBox(port, b)).filter((a): a is Elem => !!a)
  return cascadeDown(removed).filter((el) => isKindOf(el, 'IDEF0Arrow'))
}

/** The child counterparts of `arrows`, level by level down. */
function cascadeDown(arrows: readonly Elem[]): Elem[] {
  const out: Elem[] = []
  const queue = [...arrows]
  while (queue.length > 0) {
    const { ports, arrows: fed } = childCounterparts(queue.shift() as Elem)
    for (const el of [...ports, ...fed]) {
      if (out.includes(el)) continue
      out.push(el)
      if (isKindOf(el, 'IDEF0Arrow')) queue.push(el)
    }
  }
  return out
}

function viewOn(env: DiagramEnv, model: Elem, type: string): View | null {
  return (env.diagram.ownedViews.find((v) => v._type === type && v.model === model) as View | undefined) ?? null
}

/**
 * Takes `arrow` out of the port's tree: its branches hang from where it hung (the first one
 * becomes the trunk at the port, keeping the label), then it is deleted with its counterparts on
 * the levels below.
 */
function detach(b: OperationBuilder, env: DiagramEnv, port: Elem, arrow: Elem): Elem[] {
  const role = roleOf(port)
  const near = nearField(role)
  const viewEnd = near === 'source' ? 'tail' : 'head'
  const view = viewOn(env, arrow, 'IDEF0ArrowView')
  const upper = arrow[near] as Elem | null
  const upperView = (view?.[viewEnd] as View | null | undefined) ?? null
  const branches = listField(port._parent, 'arrows').filter((a) => a[near] === arrow)
  const [first, ...rest] = branches
  if (first) {
    const firstView = viewOn(env, first, 'IDEF0ArrowView')
    const toPort = upper === port
    b.set(first, near, upper)
    if (firstView) b.set(firstView, viewEnd, upperView)
    if (toPort && !first['name'] && arrow['name']) b.set(first, 'name', arrow['name'])
    for (const other of rest) {
      const otherView = viewOn(env, other, 'IDEF0ArrowView')
      b.set(other, near, toPort ? first : upper)
      if (otherView) b.set(otherView, viewEnd, toPort ? firstView : upperView)
    }
  }
  return [arrow, ...cascadeDown([arrow])]
}

/** Adds the arrow from the port's tree to `box`: the trunk when the tree is empty, else a branch of the trunk. */
function attach(b: OperationBuilder, env: DiagramEnv, port: Elem, box: Elem): void {
  const role = roleOf(port)
  const portView = viewOn(env, port, 'IDEF0PortView')
  const boxView = viewOn(env, box, 'IDEF0FunctionView')
  if (!portView || !boxView) throw new ModelRuleError('The box and the boundary arrow must be drawn on this diagram')
  const trunk = treeOf(port)[0] ?? null
  const trunkView = trunk ? viewOn(env, trunk, 'IDEF0ArrowView') : null
  const near = trunk && trunkView ? trunkView : portView
  const name = trunk ? '' : effectiveArrowName(port['corresponds'] as Elem)
  const plan =
    role === 'output'
      ? planIdef0Arrow({ diagram: env.diagram, role: 'output', tail: boxView, head: near, name })
      : planIdef0Arrow({ diagram: env.diagram, role, tail: near, head: boxView, name })
  // Ports running straight into this side of the box stay straight as the side makes room for
  // the new arrow; a pending port moves to where its first arrow meets the box.
  const straight = straightPorts(env, box, role)
  applyPlan(b, plan)
  if (!trunk) straight.push(port)
  alignPorts(b, env, straight)
}

/** The arrow of `port`'s tree that leaves the port (its trunk) and its points in `layout`. */
function trunkPoints(env: DiagramEnv, layout: DiagramLayout, port: Elem): { trunk: Elem; points: readonly Point[] } | null {
  const trunk = treeOf(port)[0]
  const view = trunk ? viewOn(env, trunk, 'IDEF0ArrowView') : null
  const points = view ? layout.edges.get(view._id)?.points : undefined
  return trunk && points && points.length > 0 ? { trunk, points } : null
}

/** Where the trunk of `port` meets its box, and where it leaves the port. */
function trunkEnds(role: Idef0Role, points: readonly Point[]): { atBox: Point; atPort: Point } {
  const first = points[0] as Point
  const last = points[points.length - 1] as Point
  return role === 'output' ? { atBox: first, atPort: last } : { atBox: last, atPort: first }
}

function isVertical(role: Idef0Role): boolean {
  return role === 'input' || role === 'output'
}

/** The linked ports of `role` whose trunk runs straight from the frame edge into `box`. */
function straightPorts(env: DiagramEnv, box: Elem, role: Idef0Role): Elem[] {
  const layout = layoutOf(env)
  const far = farField(role)
  return listField(box._parent, 'ports').filter((p) => {
    if (!isLinkedPort(p) || roleOf(p) !== role) return false
    const t = trunkPoints(env, layout, p)
    if (!t || t.trunk[far] !== box) return false
    const { atBox, atPort } = trunkEnds(role, t.points)
    return Math.abs(isVertical(role) ? atBox.y - atPort.y : atBox.x - atPort.x) < 0.5
  })
}

/** Moves each of `ports` along its frame edge to where its trunk meets the box. */
function alignPorts(b: OperationBuilder, env: DiagramEnv, ports: readonly Elem[]): void {
  if (ports.length === 0) return
  const layout = layoutOf(env)
  const area = drawingAreaOf(env.diagram)
  for (const port of ports) {
    const view = viewOn(env, port, 'IDEF0PortView') as NodeView | null
    const t = trunkPoints(env, layout, port)
    if (!view || !t) continue
    const role = roleOf(port)
    const vertical = isVertical(role)
    const { atBox } = trunkEnds(role, t.points)
    const lo = (vertical ? area.top : area.left) + 16
    const hi = (vertical ? area.bottom : area.right) - 16
    const bounds = portBounds(role, Math.max(lo, Math.min(hi, vertical ? atBox.y : atBox.x)), area)
    if (bounds.left !== view.left || bounds.top !== view.top) b.setAll(view, { left: bounds.left, top: bounds.top })
  }
}

/**
 * Makes the linked port `port` of `env.diagram` reach exactly `boxes` (boxes of that diagram):
 * one undo step. Returns false when nothing changes; throws a `ModelRuleError` for a read-only
 * assignment or a box of another diagram.
 */
export function assignParentArrow(env: DiagramEnv, port: Elem, boxes: readonly Elem[]): boolean {
  const current = portAssignment(port)
  if (!current) throw new ModelRuleError('Only a boundary arrow of a parent arrow can be assigned to boxes')
  if (current.readOnly) throw new ModelRuleError(current.readOnly)
  const scope = port._parent as Elem
  const wanted = [...new Set(boxes)]
  if (wanted.some((fn) => !isIdef0Function(fn) || fn._parent !== scope)) throw new ModelRuleError('A parent arrow can only go to the boxes of its child diagram')
  wanted.sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
  const removed = current.boxes.filter((fn) => !wanted.includes(fn))
  const added = wanted.filter((fn) => !current.boxes.includes(fn))
  if (removed.length === 0 && added.length === 0) return false
  withGeometry(env, 'Assign Parent Arrow', (b) => {
    // The other straight trunks into the sides losing an arrow follow their new slots.
    const straight = [...new Set(removed.flatMap((fn) => straightPorts(env, fn, current.role)))].filter((p) => p !== port)
    const doomed: Elem[] = []
    for (const fn of removed) {
      const arrow = arrowToBox(port, fn)
      if (arrow) doomed.push(...detach(b, env, port, arrow))
    }
    if (doomed.length > 0) {
      const levels = doomed.map((el) => diagramOfScope(el._parent)).filter((d): d is Elem => !!d && d !== env.diagram)
      deleteFromModel(env.engine, doomed)
      syncLevels(b, env, levels)
      alignPorts(b, env, straight.filter((p) => env.engine.repository.contains(p)))
    }
    for (const fn of added) attach(b, env, port, fn)
  })
  return true
}

/** Where a new port of `role` goes on the drawing-area edge: the free spot nearest the middle third, away from the other ports. */
function freeAlong(diagram: Elem, role: Idef0Role, taken: number[]): number {
  const area = drawingAreaOf(diagram)
  const vertical = role === 'input' || role === 'output'
  const lo = (vertical ? area.top : area.left) + 32
  const hi = (vertical ? area.bottom : area.right) - 32
  const start = Math.round((lo + (hi - lo) / 3) / 8) * 8
  for (let d = 0; d <= hi - lo; d += 8) {
    for (const at of [start + d, start - d]) {
      if (at < lo || at > hi) continue
      if (taken.every((t) => Math.abs(t - at) >= 40)) return at
    }
  }
  return start
}

/** Room left between a pending arrow and its neighbors on the frame edge. */
const PENDING_GAP = 6

/** A boundary port on the frame edge: where it is along the edge and what it covers around that point. */
interface EdgeSpan {
  readonly view: NodeView
  readonly at: number
  /** Extent before and after `at` along the edge (port square, ICOM code, stub, name). */
  readonly before: number
  readonly after: number
  readonly pending: boolean
}

function edgeSpans(layout: DiagramLayout, diagram: Elem, role: Idef0Role): EdgeSpan[] {
  const vertical = isVertical(role)
  const spans: EdgeSpan[] = []
  for (const v of listField(diagram, 'ownedViews')) {
    if (v._type !== 'IDEF0PortView' || roleOf((v as View).model as Elem) !== role) continue
    const node = layout.nodes.get(v._id)
    if (!node) continue
    const data = node.data as PortData
    const at = vertical ? data.anchor.y : data.anchor.x
    let lo = vertical ? node.box.top : node.box.left
    let hi = vertical ? node.box.top + node.box.height : node.box.left + node.box.width
    const cover = (r: Rect): void => {
      lo = Math.min(lo, vertical ? r.top : r.left)
      hi = Math.max(hi, vertical ? r.top + r.height : r.left + r.width)
    }
    if (data.codeLine) cover(data.codeLine.box)
    if (data.pending) {
      const h = data.pending.handle
      cover({ left: h.x - PENDING_HANDLE, top: h.y - PENDING_HANDLE, width: 2 * PENDING_HANDLE, height: 2 * PENDING_HANDLE })
      if (data.pending.label) cover(data.pending.label.box)
    }
    spans.push({ view: v as NodeView, at, before: at - lo, after: hi - at, pending: !!data.pending })
  }
  return spans
}

/**
 * Moves every pending arrow of `env.diagram` that sits on another boundary arrow of its edge (its
 * stub, ICOM code or name over theirs) to the nearest free spot of that edge; the others stay put.
 * Ports keep the place they had when their last arrow went away, which on a crowded edge can be on
 * top of a neighbor.
 */
export function spreadPendingPorts(b: OperationBuilder, env: DiagramEnv): void {
  const diagram = env.diagram
  if (!listField(diagram, 'ownedViews').some((v) => v._type === 'IDEF0PortView' && isPendingPort((v as View).model))) return
  const layout = layoutOf(env)
  const area = drawingAreaOf(diagram)
  for (const role of ['input', 'control', 'output', 'mechanism'] as Idef0Role[]) {
    const spans = edgeSpans(layout, diagram, role)
    const placed = spans.filter((s) => !s.pending)
    const vertical = isVertical(role)
    const lo = (vertical ? area.top : area.left) + 16
    const hi = (vertical ? area.bottom : area.right) - 16
    for (const span of spans.filter((s) => s.pending).sort((x, y) => x.at - y.at)) {
      const free = (at: number): boolean =>
        placed.every((o) => at + span.after + PENDING_GAP <= o.at - o.before || o.at + o.after + PENDING_GAP <= at - span.before)
      let at = span.at
      if (!free(at)) {
        const start = Math.round(span.at / 8) * 8
        const found = [...Array(Math.ceil((hi - lo) / 8) + 1).keys()]
          .flatMap((i) => [start + i * 8, start - i * 8])
          .find((c) => c >= lo && c <= hi && free(c))
        if (found !== undefined) {
          at = found
          const bounds = portBounds(role, at, area)
          b.setAll(span.view, { left: bounds.left, top: bounds.top })
        }
      }
      placed.push({ ...span, at })
    }
  }
}

/** Positions along their edge of the ports of `role` drawn on `diagram`. */
function portPositions(diagram: Elem, role: Idef0Role): number[] {
  const vertical = role === 'input' || role === 'output'
  return listField(diagram, 'ownedViews')
    .filter((v) => v._type === 'IDEF0PortView' && roleOf((v as View).model as Elem) === role)
    .map((v) => {
      const n = v as NodeView
      return vertical ? n.top + n.height / 2 : n.left + n.width / 2
    })
}

/**
 * The untunneled parent arrows of `fn` (call arrows excluded) its child diagram has no port for, in
 * their order along the box sides, with their roles.
 */
export function missingPorts(fn: Elem): Array<{ role: Idef0Role; arrow: Elem }> {
  const diagram = fn['childDiagram'] as Elem | null
  if (!isIdef0Function(fn) || !diagram || diagram._parent !== fn) return []
  const parentScope = fn._parent
  const parentArrows = listField(parentScope, 'arrows')
  const find = viewFinder(diagramOfScope(parentScope))
  const ports = listField(fn, 'ports')
  const missing: Array<{ role: Idef0Role; arrow: Elem }> = []
  for (const role of ['input', 'control', 'mechanism', 'output'] as Idef0Role[]) {
    for (const arrow of attachedArrows(fn, role, parentArrows, (a) => find(a))) {
      if (roleOf(arrow) === 'call' || (role === 'output' ? arrow['tunnelSource'] : arrow['tunnelTarget'])) continue
      const root = rootArrow(arrow)
      if (!ports.some((p) => p['corresponds'] === arrow || (p['corresponds'] && rootArrow(p['corresponds'] as Elem) === root))) missing.push({ role, arrow })
    }
  }
  return missing
}

/**
 * Adds a pending port to the child diagram of `fn` for every parent arrow it lacks (see
 * `missingPorts`), at a free spot of the role's edge. Returns the number of ports added.
 */
export function addMissingPorts(b: OperationBuilder, fn: Elem): number {
  const missing = missingPorts(fn)
  const diagram = fn['childDiagram'] as Diagram | null
  if (missing.length === 0 || !diagram) return 0
  const area = drawingAreaOf(diagram)
  const taken = new Map<Idef0Role, number[]>()
  for (const { role, arrow } of missing) {
    const positions = taken.get(role) ?? portPositions(diagram, role)
    const along = freeAlong(diagram, role, positions)
    taken.set(role, [...positions, along])
    const port = createElement('IDEF0Port', { role, corresponds: arrow })
    b.insert(fn, 'ports', port)
    b.insert(diagram, 'ownedViews', createElement<NodeView>('IDEF0PortView', { model: port, ...portBounds(role, along, area) }))
  }
  return missing.length
}
