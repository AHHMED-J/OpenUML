/**
 * Room for the boundary arrows on the frame edge. A boundary port covers more than its square: its
 * ICOM code, and for a pending arrow its stub and name. Two placements keep these apart:
 *
 * - `spreadPorts` (every geometry operation, see `hooks.ts`): the ports the operation placed (new
 *   ports, ports it moved) and the pending arrows move to the nearest free spot of their edge when
 *   they sit on a neighbor; the ports already drawn stay put. `propagateUp` runs it on every level
 *   it adds a port to, so arrows propagated to the parent diagrams never land on each other.
 * - `spreadBoundaryArrows` (the Spread Boundary Arrows command): every port of the diagram gets
 *   its own slot, as close as possible to where its arrow meets its box, in that order, so the
 *   arrows do not cross. One undo step; it only moves ports (arrows reroute to them).
 */
import type { OperationBuilder } from '../../commands'
import { drawingAreaOf, isIdef0Function, listField, portBounds, roleOf, type Elem, type Idef0Role, type NodeView, type View } from '../../model'
import type { Rect } from '../core'
import { layoutOf, withGeometry, type DiagramEnv } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'
import { PENDING_HANDLE, type PortData } from './layout'
import { isPendingPort } from './pending'

/** Room left between a boundary port and its neighbors on the frame edge. */
const PORT_GAP = 6
const GRID = 8
const ROLES: readonly Idef0Role[] = ['input', 'control', 'output', 'mechanism']

/** A boundary port on the frame edge: where it is along the edge and what it covers around that point. */
interface EdgeSpan {
  readonly view: NodeView
  readonly at: number
  /** Extent before and after `at` along the edge (port square, ICOM code, stub, name). */
  readonly before: number
  readonly after: number
  readonly pending: boolean
}

function isVertical(role: Idef0Role): boolean {
  return role === 'input' || role === 'output'
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

/** The range of positions a port of `role` may take along its edge. */
function edgeRange(diagram: Elem, role: Idef0Role): { lo: number; hi: number } {
  const area = drawingAreaOf(diagram)
  const vertical = isVertical(role)
  return { lo: (vertical ? area.top : area.left) + 16, hi: (vertical ? area.bottom : area.right) - 16 }
}

function movePort(b: OperationBuilder, diagram: Elem, view: NodeView, role: Idef0Role, at: number): void {
  const bounds = portBounds(role, at, drawingAreaOf(diagram))
  if (bounds.left !== view.left || bounds.top !== view.top) b.setAll(view, { left: bounds.left, top: bounds.top })
}

/**
 * The port views of `diagram` that the running operation placed: inserted, or moved along their
 * edge (by `top` for input and output ports, `left` for the others). A resized sheet carries the
 * output and mechanism ports across, not along, so it places none.
 */
function placedInOperation(b: OperationBuilder, diagram: Elem): (view: View) => boolean {
  const inserted = new Set<string>()
  const moved = new Map<string, Set<string>>()
  for (const step of b.steps) {
    if (step.op === 'i' && step.field === 'ownedViews' && step.owner === diagram._id) inserted.add(step.elem)
    else if (step.op === 'a' && (step.field === 'left' || step.field === 'top')) moved.set(step.id, (moved.get(step.id) ?? new Set()).add(step.field))
  }
  return (view) => {
    if (inserted.has(view._id)) return true
    const role = roleOf(view.model as Elem)
    return moved.get(view._id)?.has(isVertical(role) ? 'top' : 'left') === true
  }
}

/**
 * Moves the boundary ports of `env.diagram` that the running operation placed, and the pending
 * arrows, off their neighbors on the frame edge (their square, ICOM code, stub or name over
 * theirs) to the nearest free spot of that edge. The other ports stay put.
 */
export function spreadPorts(b: OperationBuilder, env: DiagramEnv): void {
  const diagram = env.diagram
  const placedNow = placedInOperation(b, diagram)
  const ports = listField(diagram, 'ownedViews').filter((v) => v._type === 'IDEF0PortView') as View[]
  if (!ports.some((v) => placedNow(v) || isPendingPort(v.model))) return
  const layout = layoutOf(env)
  for (const role of ROLES) {
    const spans = edgeSpans(layout, diagram, role)
    const movable = (s: EdgeSpan): boolean => s.pending || placedNow(s.view)
    const placed = spans.filter((s) => !movable(s))
    const { lo, hi } = edgeRange(diagram, role)
    for (const span of spans.filter(movable).sort((x, y) => x.at - y.at)) {
      const free = (at: number): boolean =>
        placed.every((o) => at + span.after + PORT_GAP <= o.at - o.before || o.at + o.after + PORT_GAP <= at - span.before)
      let at = span.at
      if (!free(at)) {
        const start = Math.round(span.at / GRID) * GRID
        const found = [...Array(Math.ceil((hi - lo) / GRID) + 1).keys()]
          .flatMap((i) => [start + i * GRID, start - i * GRID])
          .find((c) => c >= lo && c <= hi && free(c))
        if (found !== undefined) {
          at = found
          movePort(b, diagram, span.view, role, at)
        }
      }
      placed.push({ ...span, at })
    }
  }
}

/** Where the arrow at `port` meets its box along the port's edge, or null when it does not end on a box. */
function boxEndAlong(env: DiagramEnv, layout: DiagramLayout, port: Elem, role: Idef0Role): number | null {
  const scope = port._parent as Elem
  const arrow = listField(scope, 'arrows').find((a) => a['source'] === port || a['target'] === port)
  if (!arrow) return null
  const far = (arrow['source'] === port ? arrow['target'] : arrow['source']) as Elem | null
  if (!isIdef0Function(far)) return null
  const view = env.diagram.ownedViews.find((v) => v._type === 'IDEF0ArrowView' && v.model === arrow)
  const points = view ? layout.edges.get(view._id)?.points : undefined
  if (!points || points.length === 0) return null
  const end = arrow['source'] === port ? points[points.length - 1] : points[0]
  return end ? (isVertical(role) ? end.y : end.x) : null
}

/**
 * Positions for ports in edge order: each as close as possible to `wanted` (least squares) with at
 * least `gaps[i]` between port i and i + 1, inside [lo, hi], on the grid.
 */
export function packAlong(wanted: readonly number[], gaps: readonly number[], lo: number, hi: number): number[] {
  const n = wanted.length
  if (n === 0) return []
  const offset: number[] = [0]
  for (let i = 1; i < n; i++) offset.push((offset[i - 1] as number) + (gaps[i - 1] as number))
  // Pool adjacent violators: each block shares one start, the mean of its ports' wanted starts.
  const blocks: Array<{ sum: number; count: number }> = []
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: (wanted[i] as number) - (offset[i] as number), count: 1 })
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1] as { sum: number; count: number }
      const prev = blocks[blocks.length - 2] as { sum: number; count: number }
      if (prev.sum / prev.count <= last.sum / last.count) break
      blocks.pop()
      prev.sum += last.sum
      prev.count += last.count
    }
  }
  const at: number[] = []
  for (const block of blocks) for (let k = 0; k < block.count; k++) at.push(block.sum / block.count + (offset[at.length] as number))
  // On the grid, never closer than the gap, then inside the edge (from the far end back).
  const step = (g: number): number => Math.ceil(g / GRID) * GRID
  for (let i = 0; i < n; i++) {
    const snapped = Math.round((at[i] as number) / GRID) * GRID
    at[i] = i === 0 ? Math.max(Math.ceil(lo / GRID) * GRID, snapped) : Math.max(snapped, (at[i - 1] as number) + step(gaps[i - 1] as number))
  }
  for (let i = n - 1; i >= 0; i--) {
    const limit = i === n - 1 ? Math.floor(hi / GRID) * GRID : (at[i + 1] as number) - step(gaps[i] as number)
    at[i] = Math.min(at[i] as number, limit)
  }
  return at
}

/**
 * Spread Boundary Arrows: gives every boundary port of `env.diagram` its own slot on its edge, as
 * close as possible to where its arrow meets its box (its current place for the others), keeping
 * the order of those meeting points. One undo step. Returns the number of ports moved.
 */
export function spreadBoundaryArrows(env: DiagramEnv): number {
  const layout = layoutOf(env)
  const plans: Array<{ view: NodeView; role: Idef0Role; at: number }> = []
  for (const role of ROLES) {
    const spans = edgeSpans(layout, env.diagram, role)
      .map((s) => ({ ...s, wanted: boxEndAlong(env, layout, (s.view as View).model as Elem, role) ?? s.at }))
      .sort((x, y) => x.wanted - y.wanted || x.at - y.at)
    const gaps = spans.slice(1).map((s, i) => (spans[i] as EdgeSpan).after + PORT_GAP + s.before)
    const { lo, hi } = edgeRange(env.diagram, role)
    const at = packAlong(
      spans.map((s) => s.wanted),
      gaps,
      lo,
      hi
    )
    spans.forEach((s, i) => {
      if (Math.abs((at[i] as number) - s.at) >= 0.5) plans.push({ view: s.view, role, at: at[i] as number })
    })
  }
  if (plans.length === 0) return 0
  withGeometry(env, 'Spread Boundary Arrows', (b) => {
    for (const p of plans) movePort(b, env.diagram, p.view, p.role, p.at)
  })
  return plans.length
}
