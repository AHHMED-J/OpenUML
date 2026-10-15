/**
 * Adjustable runs of IDEF0 arrows: the horizontal run where a control or mechanism forks into
 * branches (the "bus"), the channel of an H-V-H arrow, the lane of a feedback loop.
 *
 * - The user drags such a run with the Select tool; the position is stored on the arrow view as a
 *   route hint (`routeX` / `routeY`, -1 = automatic) and kept valid by the router (inside the frame,
 *   off the boxes, far enough from the branch ends). Dragging a branch's run moves its trunk's bus.
 * - Without hints, the horizontal runs of boundary controls and mechanisms that would lie on top of
 *   each other (several controls forking across the top of a decomposition) get their own lanes,
 *   `LANE` apart, in diagram order: an earlier arrow keeps its run and a later one moves aside only
 *   when it would overlap it.
 *
 * Pure: reads the model and the layout pass, returns values.
 */
import type { EdgeView, View } from '../../model'
import type { Point, Rect } from '../core'
import type { LayoutContext } from '../layout/types'
import { areaRectOf } from './geometry'
import { busOf, resolveRun, routeArrowDetailed, type RouteAdjust, type RouteEnd, type RunAxis, type RunLimit, type RunValues } from './routing'

/** Gap between parallel runs given separate lanes. */
const LANE = 8

/** Stored value of a route hint that is not set. */
export const NO_HINT = -1

/** A run of an arrow's route the user can drag (segment `index` of its points); the hint goes to `viewId`. */
export interface RunHandle extends RouteAdjust {
  readonly index: number
  readonly viewId: string
}

/** The hint field of an axis. */
export function hintField(axis: RunAxis): 'routeX' | 'routeY' {
  return axis === 'x' ? 'routeX' : 'routeY'
}

function hintValue(view: View, axis: RunAxis): number | undefined {
  const v = view[hintField(axis)]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
}

/** The route hints stored on an arrow view. */
export function hintsOf(view: View): RunValues {
  const x = hintValue(view, 'x')
  const y = hintValue(view, 'y')
  return { ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) }
}

/** Whether an arrow view carries a route hint. */
export function hasRouteHint(view: View): boolean {
  return hintValue(view, 'x') !== undefined || hintValue(view, 'y') !== undefined
}

/** The services of the arrow layout the planner uses. */
export interface ArrowEnds {
  /** Attachment of one end of an arrow view (null for a branch end or a missing end). */
  end(edge: EdgeView, end: 'tail' | 'head', ctx: LayoutContext): RouteEnd | null
  /** The IDEF0 arrow views of the diagram, in list order. */
  arrows(ctx: LayoutContext): readonly EdgeView[]
}

const boxCache = new WeakMap<LayoutContext, Rect[]>()

/** The function boxes of the pass (obstacles of hinted runs). */
export function functionBoxes(ctx: LayoutContext): Rect[] {
  let boxes = boxCache.get(ctx)
  if (!boxes) {
    boxes = []
    for (const v of ctx.diagram.ownedViews ?? []) {
      if (v._type !== 'IDEF0FunctionView') continue
      const l = ctx.nodeLayout(v._id)
      if (l) boxes.push(l.box)
    }
    boxCache.set(ctx, boxes)
  }
  return boxes
}

/** The far ends of the branches leaving (fork) or joining `trunk`. */
export function branchEnds(trunk: EdgeView, ctx: LayoutContext, ends: ArrowEnds): RouteEnd[] {
  const out: RouteEnd[] = []
  for (const b of ends.arrows(ctx)) {
    if (b === trunk) continue
    const e = b.tail === trunk ? ends.end(b, 'head', ctx) : b.head === trunk ? ends.end(b, 'tail', ctx) : null
    if (e) out.push(e)
  }
  return out
}

/** Limits a trunk's own runs get from its branches' far ends (so each branch keeps its last run). */
export function branchLimits(far: readonly RouteEnd[]): Partial<Record<RunAxis, RunLimit>> {
  if (far.length === 0) return {}
  const ys = far.map((e) => e.point.y)
  const xs = far.map((e) => e.point.x)
  const limit = (axis: RunAxis): RunLimit => {
    let min = Number.NEGATIVE_INFINITY
    let max = Number.POSITIVE_INFINITY
    for (const e of far) {
      const v = axis === 'y' ? e.point.y : e.point.x
      if (e.dir === (axis === 'y' ? 'N' : 'W')) max = Math.min(max, v - 16)
      else if (e.dir === (axis === 'y' ? 'S' : 'E')) min = Math.max(min, v + 16)
    }
    const span = axis === 'y' ? xs : ys
    return { min, max, span: [Math.min(...span), Math.max(...span)] }
  }
  return { x: limit('x'), y: limit('y') }
}

interface Candidate {
  readonly id: string
  readonly axis: RunAxis
  readonly natural: number
  readonly min: number
  readonly max: number
  readonly span: readonly [number, number]
  readonly hinted: number | undefined
}

/** The run of a boundary arrow the planner may move: its fork bus, else its own adjustable run. */
function candidateOf(edge: EdgeView, ctx: LayoutContext, ends: ArrowEnds): Candidate | null {
  if (isArrow(edge.tail) || isArrow(edge.head) || edge.model?.['role'] === 'call') return null
  const tail = ends.end(edge, 'tail', ctx)
  const head = ends.end(edge, 'head', ctx)
  if (!tail || !head || !(tail.port || head.port)) return null
  const far = branchEnds(edge, ctx, ends)
  const obstacles = functionBoxes(ctx)
  const area = areaRectOf(ctx.diagram)
  const routed = routeArrowDetailed({ tail, head, area, obstacles })
  const hints = hintsOf(edge)
  const spanOf = (axis: RunAxis, own: readonly Point[]): [number, number] => {
    const values = [...own, ...far.map((e) => e.point)].map((p) => (axis === 'y' ? p.x : p.y))
    return [Math.min(...values), Math.max(...values)]
  }
  if (routed.points.length === 2 && far.length > 0) {
    const bus = busOf(routed.points, far, { obstacles })
    if (!bus || bus.min === bus.max) return null
    const hinted = hints[bus.axis] !== undefined ? busOf(routed.points, far, { obstacles, hint: hints[bus.axis] as number })?.value : undefined
    return { id: edge._id, axis: bus.axis, natural: bus.value, min: bus.min, max: bus.max, span: spanOf(bus.axis, routed.points), hinted }
  }
  const run = routed.adjust
  if (!run) return null
  const limits = branchLimits(far)
  const limited = routeArrowDetailed({ tail, head, area, obstacles, limit: limits, ...(hints[run.axis] !== undefined ? { hint: hints } : {}) }).adjust
  if (!limited) return null
  const hinted = hints[run.axis] !== undefined ? limited.value : undefined
  return { id: edge._id, axis: run.axis, natural: run.value, min: limited.min, max: limited.max, span: spanOf(run.axis, routed.points), hinted }
}

function isArrow(v: View | null | undefined): boolean {
  return !!v && v._type === 'IDEF0ArrowView'
}

const plans = new WeakMap<LayoutContext, Map<string, RunValues>>()

/**
 * Lane plan of the pass: the automatic value of every boundary arrow run that had to move aside
 * because an earlier run (or a hinted one) lies within `LANE` of it across an overlapping extent.
 * Runs not listed keep their natural position.
 */
export function plannedRuns(ctx: LayoutContext, ends: ArrowEnds): ReadonlyMap<string, RunValues> {
  const cached = plans.get(ctx)
  if (cached) return cached
  const plan = new Map<string, RunValues>()
  plans.set(ctx, plan)
  // Horizontal runs only: the control and mechanism buses that cross the top and bottom of a decomposition.
  const candidates = ends.arrows(ctx)
    .map((e) => candidateOf(e, ctx, ends))
    .filter((c): c is Candidate => c !== null && c.axis === 'y')
  const placed: Array<{ axis: RunAxis; value: number; span: readonly [number, number] }> = []
  for (const c of candidates) if (c.hinted !== undefined) placed.push({ axis: c.axis, value: c.hinted, span: c.span })
  const clashes = (c: Candidate, value: number): boolean =>
    placed.some((p) => p.axis === c.axis && Math.abs(p.value - value) < LANE && p.span[0] <= c.span[1] && c.span[0] <= p.span[1])
  for (const c of candidates) {
    if (c.hinted !== undefined) continue
    let value = c.natural
    if (clashes(c, value)) {
      // Step away from the nearer end of the range (into the free room), then the other way.
      const step = c.natural - c.min <= c.max - c.natural ? LANE : -LANE
      const tries: number[] = []
      for (let k = 1; k <= 12; k++) tries.push(c.natural + step * k)
      for (let k = 1; k <= 12; k++) tries.push(c.natural - step * k)
      const free = tries.find((v) => v >= c.min && v <= c.max && !clashes(c, v))
      if (free !== undefined) {
        value = free
        plan.set(c.id, { [c.axis]: value })
      }
    }
    placed.push({ axis: c.axis, value, span: c.span })
  }
  return plan
}

/** Index of the segment of `points` lying on `axis` = `value` (interior segments first), or -1. */
export function segmentOn(points: readonly Point[], axis: RunAxis, value: number): number {
  let found = -1
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i] as Point
    const q = points[i + 1] as Point
    const on = axis === 'y' ? p.y === value && q.y === value && p.x !== q.x : p.x === value && q.x === value && p.y !== q.y
    if (!on) continue
    if (i > 0 && i + 2 < points.length) return i
    if (found < 0) found = i
  }
  return found
}

/** The value a dragged run is stored at: snapped by the caller, then kept inside its valid range. */
export function validRunValue(handle: RouteAdjust, value: number): number {
  return resolveRun(value, handle.min, handle.max, handle.forbidden)
}
