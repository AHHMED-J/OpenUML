/**
 * Line-tool gestures of IDEF0 diagrams (spec 11 §3.4): the role of an arrow is derived from where
 * the drag ends or starts, an end released on empty canvas creates a boundary port, dropping on
 * an arrow forks or joins it, and dragging an end to another side of a box changes its role.
 */
import { applyPlan } from '../../commands'
import type { OperationBuilder } from '../../commands'
import {
  ModelRuleError,
  canConnect,
  isKindOf,
  planIdef0Arrow,
  sourceSide,
  targetSide,
  type EdgeView,
  type Idef0Role,
  type Idef0Side,
  type Elem,
  type View
} from '../../model'
import { distancePointToPolyline, rectContainsPoint, type Point, type Rect } from '../core'
import { layoutOf, withGeometry, type DiagramEnv, type ToolSpec } from '../editor/actions'
import { connectionRefusal } from '../editor/feedback'
import type { DiagramLayout } from '../layout/types'
import type { ArrowData } from './edges'
import { AREA_RECT, nearestSide } from './geometry'
import { insertedPorts, propagateUp } from './propagation'
import { NO_HINT, hasRouteHint, hintField, validRunValue, type RunHandle } from './runs'

const ENTER_ROLE: Readonly<Partial<Record<Idef0Side, Idef0Role>>> = { left: 'input', top: 'control', bottom: 'mechanism' }

/** Role of an arrow released on `side` of a box (the right side is an output side: refused). */
function roleForSide(side: Idef0Side): Idef0Role | null {
  return ENTER_ROLE[side] ?? null
}

/** How far outside a box outline a dragged arrow end still lands on the box. */
const END_DROP_TOLERANCE = 8

/** Distance from `p` to the rectangle `r` (0 inside). */
function distanceToRect(r: Rect, p: Point): number {
  const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width))
  const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height))
  return Math.hypot(dx, dy)
}

/** Distance from `p` to the outline of `r` (inside or outside). */
function distanceToOutline(r: Rect, p: Point): number {
  if (!rectContainsPoint(r, p)) return distanceToRect(r, p)
  return Math.min(p.x - r.left, r.left + r.width - p.x, p.y - r.top, r.top + r.height - p.y)
}

/** The function box under `p`, else the one whose outline is within `tolerance` of `p` (nearest first). */
function functionNear(layout: DiagramLayout, p: Point, tolerance: number): string | null {
  let best: { id: string; d: number } | null = null
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const id = layout.order[i] as string
    const node = layout.nodes.get(id)
    if (node?.viewType !== 'IDEF0FunctionView') continue
    const d = distanceToRect(node.box, p)
    if (d === 0) return id
    if (d <= tolerance && (!best || d < best.d)) best = { id, d }
  }
  return best?.id ?? null
}

/** How close to an arrow (diagram units) a line gesture end forks off or joins into it. */
const ARROW_PICK_TOLERANCE = 5

/**
 * The end a line gesture picks at `p` (spec 11 §3.4). Rule, so that crowded box sides keep
 * accepting new arrows:
 * 1. a function box under `p`, or within `END_DROP_TOLERANCE` of its outline, wins: the arrow ends
 *    on that side of the box (a new slot), even where the stubs of other arrows meet the side;
 * 2. else (arrow tool) a boundary port under `p`;
 * 3. else (arrow tool) an arrow within `ARROW_PICK_TOLERANCE` of `p` (fork / join), except near the
 *    frame edge, where an end on empty canvas makes a new boundary arrow;
 * 4. else nothing (empty canvas).
 */
export function pickEnd(layout: DiagramLayout, p: Point, tool: ToolSpec): string | null {
  const fn = functionNear(layout, p, END_DROP_TOLERANCE)
  if (fn || tool.kind === 'IDEF0Call') return fn
  const nearFrameEdge = distanceToOutline(AREA_RECT, p) <= END_DROP_TOLERANCE || !rectContainsPoint(AREA_RECT, p)
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const id = layout.order[i] as string
    const node = layout.nodes.get(id)
    if (node) {
      if (node.viewType === 'IDEF0PortView' && distanceToRect(node.box, p) <= 4) return id
      continue
    }
    const edge = layout.edges.get(id)
    if (!nearFrameEdge && edge && tool.kind === 'IDEF0Arrow' && edge.viewType === 'IDEF0ArrowView' && distancePointToPolyline(p, edge.points) <= ARROW_PICK_TOLERANCE) return id
  }
  return null
}

/** The function box a dragged arrow end lands on: the box under `p` or within a few units of its outline (topmost first). */
export function pickReconnect(layout: DiagramLayout, p: Point): string | null {
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const node = layout.nodes.get(layout.order[i] as string)
    if (!node) continue
    const t = node.viewType === 'IDEF0FunctionView' ? END_DROP_TOLERANCE : 0
    const b = node.box
    if (node.viewType !== 'IDEF0FrameView' && rectContainsPoint({ left: b.left - t, top: b.top - t, width: b.width + 2 * t, height: b.height + 2 * t }, p)) return node.viewId
  }
  return null
}

/** Whether the line tool may start on empty canvas. */
export function freeEnds(tool: ToolSpec): boolean {
  return tool.kind === 'IDEF0Arrow'
}

function viewOf(env: DiagramEnv, id: string | null): View | null {
  return id ? ((env.engine.repository.get(id) as View | undefined) ?? null) : null
}

/** Plain-language reasons for refused IDEF0 line gestures (shown as a toast). */
const REFUSAL = {
  noBox: 'An arrow needs a box at one end: start it on a box, or end it on the left, top or bottom side of a box',
  rightSide: 'An arrow can\'t end on the right side of a box (that side is for outputs): release it on the left (input), top (control) or bottom (mechanism) side',
  callStart: 'A call arrow must start on a box',
  callEnd: 'A call arrow must end on another box (or on empty canvas)',
  callTwice: 'This box already has a call arrow',
  selfLoop: 'An arrow can\'t start and end on the same box',
  freeBranch: 'A branch must end on a box side',
  freeBoundary: 'An arrow from the frame edge must end on a box side or join an arrow',
  boundaryIntoArrow: 'An arrow drawn from empty canvas must end on a box side, not on an arrow or the frame edge',
  arrowToArrow: 'A branch can\'t end on another arrow: end it on a box side',
  outputPort: 'An output on the frame edge can\'t start a new arrow',
  cycle: 'A branch can\'t feed back into the arrow it comes from'
} as const

/** Why an IDEF0 arrow from `tail` to `head` (both present) is refused. */
function arrowRefusal(tail: View, head: View): string {
  if (tail === head) return REFUSAL.selfLoop
  if (tail._type === 'IDEF0ArrowView') return head._type === 'IDEF0ArrowView' ? REFUSAL.arrowToArrow : REFUSAL.cycle
  if (tail._type === 'IDEF0PortView') return REFUSAL.outputPort
  if (head._type === 'IDEF0ArrowView') return REFUSAL.cycle
  return connectionRefusal('IDEF0Arrow', tail, head)
}

/**
 * Creates an arrow or call arrow from a line gesture. Returns the new view's ID; a connection that
 * is not allowed throws a `ModelRuleError` that says why (the editor shows it as a toast).
 */
export function createIdef0Edge(
  env: DiagramEnv,
  layout: DiagramLayout,
  tool: ToolSpec,
  tailId: string | null,
  headId: string | null,
  press: Point,
  release: Point
): string | null {
  const tail = viewOf(env, tailId)
  const head = viewOf(env, headId)
  const kind = tool.kind === 'IDEF0Call' ? 'IDEF0Call' : 'IDEF0Arrow'
  if (kind === 'IDEF0Call') {
    if (!tail || tail._type !== 'IDEF0FunctionView') throw new ModelRuleError(REFUSAL.callStart)
    if (head && !canConnect('IDEF0Call', tail, head)) throw new ModelRuleError(head._type === 'IDEF0FunctionView' && head !== tail ? REFUSAL.callTwice : REFUSAL.callEnd)
    const plan = withGeometry(env, 'Create Call Arrow', (b) => {
      const plan = planIdef0Arrow({ diagram: env.diagram, tail, head, call: true })
      applyPlan(b, plan)
      return plan
    })
    return plan.view?._id ?? null
  }
  if (!tail && !head) throw new ModelRuleError(REFUSAL.noBox)
  // Role from the side a box end is dropped on / started from.
  let role: Idef0Role | undefined
  if (head && head._type === 'IDEF0FunctionView') {
    const box = layout.nodes.get(head._id)?.box
    if (!box) return null
    role = roleForSide(nearestSide(box, release)) ?? undefined
    if (!role) throw new ModelRuleError(tail === head ? REFUSAL.selfLoop : REFUSAL.rightSide)
  }
  if (tail && head && !canConnect('IDEF0Arrow', tail, head)) throw new ModelRuleError(arrowRefusal(tail, head))
  if (!tail && head?._type !== 'IDEF0FunctionView') throw new ModelRuleError(REFUSAL.boundaryIntoArrow)
  if (tail && !head && tail._type !== 'IDEF0FunctionView') throw new ModelRuleError(tail._type === 'IDEF0ArrowView' ? REFUSAL.freeBranch : REFUSAL.freeBoundary)
  const plan = withGeometry(env, 'Create Arrow', (b) => {
    const plan = planIdef0Arrow({ diagram: env.diagram, tail, head, ...(role ? { role } : {}), at: tail ? release : press })
    applyPlan(b, plan)
    // A boundary arrow drawn on a child diagram also appears on the parent box (same undo step).
    for (const port of insertedPorts(plan)) propagateUp(b, env, port)
    return plan
  })
  return plan.view?._id ?? null
}

const SIDE_ROLE: Readonly<Partial<Record<Idef0Side, Idef0Role>>> = { left: 'input', top: 'control', bottom: 'mechanism' }

/**
 * Pins the order of the arrow ends on `side` of the box `view` with the end `end` of `edge` placed
 * where it was dropped (`at`): every end of that side gets its slot index, the others keep their
 * current order around it.
 */
function placeOnSide(b: OperationBuilder, env: DiagramEnv, view: View, side: Idef0Side, edge: EdgeView, end: 'tail' | 'head', at: Point): void {
  const layout = layoutOf(env)
  const along = (p: Point): number => (side === 'left' || side === 'right' ? p.y : p.x)
  const others: Array<{ arrow: Elem; field: 'sourceSlot' | 'targetSlot'; at: number }> = []
  for (const v of env.diagram.ownedViews) {
    if (v._type !== 'IDEF0ArrowView' || v === edge || !v.model) continue
    const e = v as EdgeView
    const pts = layout.edges.get(e._id)?.points
    if (!pts || pts.length === 0) continue
    if (e.tail === view && sourceSide(v.model) === side) others.push({ arrow: v.model, field: 'sourceSlot', at: along(pts[0] as Point) })
    if (e.head === view && targetSide(v.model) === side) others.push({ arrow: v.model, field: 'targetSlot', at: along(pts[pts.length - 1] as Point) })
  }
  others.sort((p, q) => p.at - q.at)
  const index = others.filter((o) => o.at < along(at)).length
  const order = [...others.slice(0, index), { arrow: edge.model as Elem, field: end === 'tail' ? ('sourceSlot' as const) : ('targetSlot' as const), at: along(at) }, ...others.slice(index)]
  order.forEach((o, i) => {
    if (o.arrow[o.field] !== i) b.set(o.arrow, o.field, i)
  })
}

/**
 * Reconnects an arrow end. Dropping the head end on a box (the same box included) takes the role
 * of the side it lands on; the right side and port ends are refused. Dropping an end on its own box
 * side (or another side of the same box, changing the role) places it among that side's arrows
 * where it was released.
 */
export function reconnectIdef0(env: DiagramEnv, edge: EdgeView, end: 'tail' | 'head', view: View, at: Point | undefined): boolean | undefined {
  if (edge._type !== 'IDEF0ArrowView' || !edge.model) return undefined
  const arrow = edge.model
  if (view._type !== 'IDEF0FunctionView' || arrow['role'] === 'call') return false
  const box = viewBounds(view)
  if (end === 'tail' && edge.tail === view) {
    if (!at || !box || nearestSide(box, at) !== 'right') return false
    withGeometry(env, 'Move Arrow End', (b) => placeOnSide(b, env, view, 'right', edge, 'tail', at))
    return true
  }
  if (end === 'head' && edge.head === view && at && box) {
    const side = nearestSide(box, at)
    const role = SIDE_ROLE[side]
    if (!role) return false
    withGeometry(env, role === arrow['role'] ? 'Move Arrow End' : 'Reconnect', (b) => {
      if (role !== arrow['role']) b.set(arrow, 'role', role)
      placeOnSide(b, env, view, side, edge, 'head', at)
    })
    return true
  }
  if (end === 'tail') {
    if (edge.tail?._type === 'IDEF0ArrowView' || edge.head === view) return false
    withGeometry(env, 'Reconnect', (b) => {
      b.set(edge, 'tail', view)
      b.set(arrow, 'source', view.model)
      b.set(arrow, 'sourceSlot', -1)
    })
    return true
  }
  if (edge.head?._type === 'IDEF0ArrowView' || edge.tail === view) return false
  const role = at && box ? roleForSide(nearestSide(box, at)) : (arrow['role'] as Idef0Role)
  if (!role) return false
  if (edge.tail && edge.head !== view && !canConnect('IDEF0Arrow', edge.tail, view)) return false
  withGeometry(env, 'Reconnect', (b) => {
    b.set(edge, 'head', view)
    b.set(arrow, 'target', view.model)
    b.set(arrow, 'role', role)
    b.set(arrow, 'targetSlot', -1)
  })
  return true
}

function viewBounds(view: View): { left: number; top: number; width: number; height: number } | null {
  if (!isKindOf(view, 'NodeView')) return null
  return { left: view.left, top: view.top, width: view.width, height: view.height }
}

// ---------------------------------------------------------------------------------------------
// Route runs

/** The draggable run of an arrow at segment `index` of its layout, or null. */
export function arrowRunAt(layout: DiagramLayout, edgeId: string, index: number): RunHandle | null {
  const edge = layout.edges.get(edgeId)
  if (!edge || edge.viewType !== 'IDEF0ArrowView') return null
  return (edge.data as ArrowData | undefined)?.runs?.find((r) => r.index === index) ?? null
}

/**
 * Moves the run at segment `index` of an arrow to `value` (y of a horizontal run, x of a vertical
 * one), kept inside its valid range: stores the route hint on the arrow (or on the trunk whose bus
 * a branch lies on). One undo step; false when the segment is not a draggable run.
 */
export function moveArrowRun(env: DiagramEnv, layout: DiagramLayout, edgeId: string, index: number, value: number): boolean {
  const run = arrowRunAt(layout, edgeId, index)
  const view = run ? (env.engine.repository.get(run.viewId) as View | undefined) : undefined
  if (!run || !view) return false
  const field = hintField(run.axis)
  const next = validRunValue(run, value)
  if (view[field] === next) return true
  withGeometry(env, 'Move Arrow Segment', (b) => b.set(view, field, next))
  return true
}

/** The arrow views whose hints shape `views`: each arrow plus the trunks its branches lie on. */
function hintOwners(views: readonly View[]): View[] {
  const out = new Set<View>()
  for (const v of views) {
    if (v._type !== 'IDEF0ArrowView') continue
    out.add(v)
    const edge = v as EdgeView
    for (let t: View | null | undefined = edge.tail?._type === 'IDEF0ArrowView' ? edge.tail : edge.head?._type === 'IDEF0ArrowView' ? edge.head : null, guard = 0; t && guard < 64; guard++) {
      out.add(t)
      const te = t as EdgeView
      t = te.tail?._type === 'IDEF0ArrowView' ? te.tail : te.head?._type === 'IDEF0ArrowView' ? te.head : null
    }
  }
  return [...out]
}

/** Whether any of `views` (or the trunk of a branch among them) has a route hint. */
export function hasRouteHints(views: readonly View[]): boolean {
  return hintOwners(views).some(hasRouteHint)
}

/** Removes the route hints of the given arrows (and of the trunks of branches among them): one undo step. Returns how many arrows changed. */
export function resetArrowRoutes(env: DiagramEnv, views: readonly View[]): number {
  const owners = hintOwners(views).filter(hasRouteHint)
  if (owners.length === 0) return 0
  withGeometry(env, 'Reset Arrow Route', (b) => {
    for (const v of owners) b.setAll(v, { routeX: NO_HINT, routeY: NO_HINT })
  })
  return owners.length
}
