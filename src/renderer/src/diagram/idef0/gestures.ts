/**
 * Line-tool gestures of IDEF0 diagrams (spec 11 §3.4): the role of an arrow is derived from where
 * the drag ends or starts, an end released on empty canvas creates a boundary port, dropping on
 * an arrow forks or joins it, and dragging an end to another side of a box changes its role.
 */
import { applyPlan } from '../../commands'
import type { OperationBuilder } from '../../commands'
import {
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
import { distancePointToPolyline, rectContainsPoint, type Point } from '../core'
import { layoutOf, withGeometry, type DiagramEnv, type ToolSpec } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import type { ArrowData } from './edges'
import { nearestSide } from './geometry'
import { insertedPorts, propagateUp } from './propagation'
import { NO_HINT, hasRouteHint, hintField, validRunValue, type RunHandle } from './runs'

const ENTER_ROLE: Readonly<Partial<Record<Idef0Side, Idef0Role>>> = { left: 'input', top: 'control', bottom: 'mechanism' }

/** Role of an arrow released on `side` of a box (the right side is an output side: refused). */
function roleForSide(side: Idef0Side): Idef0Role | null {
  return ENTER_ROLE[side] ?? null
}

/** The function, port or (for arrow tools) arrow under `p`. */
export function pickEnd(layout: DiagramLayout, p: Point, tool: ToolSpec): string | null {
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const id = layout.order[i] as string
    const node = layout.nodes.get(id)
    if (node) {
      if (node.viewType === 'IDEF0FunctionView' && rectContainsPoint(node.box, p)) return id
      if (node.viewType === 'IDEF0PortView' && tool.kind !== 'IDEF0Call' && rectContainsPoint({ left: node.box.left - 4, top: node.box.top - 4, width: node.box.width + 8, height: node.box.height + 8 }, p)) return id
      continue
    }
    const edge = layout.edges.get(id)
    if (edge && tool.kind === 'IDEF0Arrow' && edge.viewType === 'IDEF0ArrowView' && distancePointToPolyline(p, edge.points) <= 5) return id
  }
  return null
}

/** How far outside a box outline a dragged arrow end still lands on the box. */
const END_DROP_TOLERANCE = 8

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

/**
 * Creates an arrow or call arrow from a line gesture. Returns the new view's ID, or null when the
 * connection is not allowed.
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
  if (!tail && !head) return null
  const kind = tool.kind === 'IDEF0Call' ? 'IDEF0Call' : 'IDEF0Arrow'
  if (kind === 'IDEF0Call') {
    if (!tail || tail._type !== 'IDEF0FunctionView') return null
    if (head && !canConnect('IDEF0Call', tail, head)) return null
    const plan = withGeometry(env, 'Create Call Arrow', (b) => {
      const plan = planIdef0Arrow({ diagram: env.diagram, tail, head, call: true })
      applyPlan(b, plan)
      return plan
    })
    return plan.view?._id ?? null
  }
  // Role from the side a box end is dropped on / started from.
  let role: Idef0Role | undefined
  if (head && head._type === 'IDEF0FunctionView') {
    const box = layout.nodes.get(head._id)?.box
    if (!box) return null
    role = roleForSide(nearestSide(box, release)) ?? undefined
    if (!role) return null
  }
  if (tail && head && !canConnect('IDEF0Arrow', tail, head)) return null
  if (!tail && head?._type !== 'IDEF0FunctionView') return null
  if (tail && !head && tail._type !== 'IDEF0FunctionView') return null
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
