/**
 * Line-tool gestures of IDEF0 diagrams (spec 11 §3.4): the role of an arrow is derived from where
 * the drag ends or starts, an end released on empty canvas creates a boundary port, dropping on
 * an arrow forks or joins it, and dragging an end to another side of a box changes its role.
 */
import { applyPlan } from '../../commands'
import {
  canConnect,
  isKindOf,
  planIdef0Arrow,
  type EdgeView,
  type Idef0Role,
  type Idef0Side,
  type View
} from '../../model'
import { distancePointToPolyline, rectContainsPoint, type Point } from '../core'
import { withGeometry, type DiagramEnv, type ToolSpec } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import { nearestSide } from './geometry'

const ENTER_ROLE: Readonly<Partial<Record<Idef0Side, Idef0Role>>> = { left: 'input', top: 'control', bottom: 'mechanism' }

/** Role of an arrow released on `side` of a box (the right side is an output side: refused). */
export function roleForSide(side: Idef0Side): Idef0Role | null {
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
    return plan
  })
  return plan.view?._id ?? null
}

/**
 * Reconnects an arrow end. Dropping the head end on a box (the same box included) takes the role
 * of the side it lands on; the right side and port ends are refused.
 */
export function reconnectIdef0(env: DiagramEnv, edge: EdgeView, end: 'tail' | 'head', view: View, at: Point | undefined): boolean | undefined {
  if (edge._type !== 'IDEF0ArrowView' || !edge.model) return undefined
  const arrow = edge.model
  if (view._type !== 'IDEF0FunctionView' || arrow['role'] === 'call') return false
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
  const box = viewBounds(view)
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
