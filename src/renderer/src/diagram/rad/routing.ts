/**
 * Routing of RAD threads (spec 10 section 5.2): orthogonal state lines between successive
 * elements with a shared fan-in bus, empty-path side entries and loop-backs, and the straight
 * interaction link between two squares. Pure: reads the layouts of the ends, writes nothing.
 */
import { isKindOf, type EdgeView, type View } from '../../model'
import type { Point, Rect } from '../core'
import type { LayoutContext } from '../layout/types'
import { RAD_GEOMETRY } from './layout'

const RAD_ROUTING = {
  /** The bus runs this far above the top of its target. */
  busOffset: 28,
  /** ... and at least this far below the lowest source it collects. */
  busDrop: 20,
  /** A loop-back re-enters the thread this far above the target's top. */
  loopEntry: 15,
  /** A loop-back leaving a branch circle first drops this far. */
  loopDrop: 20
} as const

export type ThreadShape = 'straight' | 'bus' | 'side' | 'loop'

const cx = (r: Rect): number => r.left + r.width / 2
const cy = (r: Rect): number => r.top + r.height / 2
const bottom = (r: Rect): number => r.top + r.height

function boxOf(view: View | null | undefined, ctx: LayoutContext): Rect | null {
  return view ? (ctx.nodeLayout(view._id)?.box ?? null) : null
}

/** How a state line is drawn: `loopBack` wins, then the `routing` setting, then the automatic choice. */
export function threadShape(edge: EdgeView, ctx: LayoutContext): ThreadShape {
  const model = edge.model
  const tb = boxOf(edge.tail, ctx)
  const hb = boxOf(edge.head, ctx)
  if (!tb || !hb) return 'straight'
  if (model?.['loopBack'] === true) return 'loop'
  const routing = model?.['routing']
  const sideOk = hb.top + hb.height / 2 > bottom(tb) && cx(hb) < cx(tb) - 2
  if (routing === 'side' && cx(hb) !== cx(tb)) return 'side'
  if (routing !== 'bus' && sideOk && isKindOf(edge.tail?.model, 'RADBranch')) return 'side'
  return Math.abs(cx(tb) - cx(hb)) < 2 ? 'straight' : 'bus'
}

/** Views of the same role as `view` (its container's contained node views). */
function roleSiblings(view: View | null | undefined): View[] {
  const role = view?.containerView
  return role ? [...(role.containedViews ?? [])] : []
}

/** x of the loop-back lane of the role holding `view`: left of its leftmost symbol. */
export function loopLaneX(view: View | null | undefined, ctx: LayoutContext): number {
  let left = Infinity
  for (const v of roleSiblings(view)) {
    const b = boxOf(v, ctx)
    if (b && b.left < left) left = b.left
  }
  const own = boxOf(view, ctx)
  if (own && own.left < left) left = own.left
  return left - RAD_GEOMETRY.loopLane
}

/** The y of the bus collecting every forward line that ends at `edge.head`. */
function busLevel(edge: EdgeView, ctx: LayoutContext): number {
  const hb = boxOf(edge.head, ctx) as Rect
  const own = boxOf(edge.tail, ctx) as Rect
  let lowest = bottom(own)
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== 'RADStateLineView' || v === edge || v.visible === false) continue
    const other = v as EdgeView
    if (other.head !== edge.head || threadShape(other, ctx) !== 'bus') continue
    const ob = boxOf(other.tail, ctx)
    if (ob) lowest = Math.max(lowest, bottom(ob))
  }
  let y = Math.min(hb.top - RAD_ROUTING.busOffset, lowest + RAD_ROUTING.busDrop)
  // Not enough room below the sources: use the middle of the gap, or just below the lowest source.
  if (y < bottom(own) + 4) y = hb.top > bottom(own) + 8 ? (bottom(own) + hb.top) / 2 : bottom(own) + 10
  return Math.round(y)
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) }
    const last = out[out.length - 1]
    if (!last || last.x !== q.x || last.y !== q.y) out.push(q)
  }
  return out
}

/** Polyline of a state line, tail first; null when an end has no layout yet. */
export function routeStateLine(edge: EdgeView, ctx: LayoutContext): Point[] | null {
  const tb = boxOf(edge.tail, ctx)
  const hb = boxOf(edge.head, ctx)
  if (!tb || !hb) return null
  const sx = cx(tb)
  const sy = bottom(tb)
  const tx = cx(hb)
  const ty = hb.top
  switch (threadShape(edge, ctx)) {
    case 'straight':
      return dedupe([
        { x: sx, y: sy },
        { x: sx, y: ty }
      ])
    case 'side': {
      const y = cy(hb)
      const entry = sx > tx ? hb.left + hb.width : hb.left
      return dedupe([
        { x: sx, y: sy },
        { x: sx, y },
        { x: entry, y }
      ])
    }
    case 'loop': {
      const lane = loopLaneX(edge.tail, ctx)
      const entryY = ty - RAD_ROUTING.loopEntry
      const start: Point[] = isKindOf(edge.tail?.model, 'RADBranch')
        ? [
            { x: sx, y: sy },
            { x: sx, y: sy + RAD_ROUTING.loopDrop },
            { x: lane, y: sy + RAD_ROUTING.loopDrop }
          ]
        : [
            { x: tb.left, y: cy(tb) },
            { x: lane, y: cy(tb) }
          ]
      return dedupe([...start, { x: lane, y: entryY }, { x: tx, y: entryY }])
    }
    default: {
      const y = busLevel(edge, ctx)
      return dedupe([
        { x: sx, y: sy },
        { x: sx, y },
        { x: tx, y },
        { x: tx, y: ty }
      ])
    }
  }
}

/** Straight line between the facing side centres of two interaction squares. */
export function routeInteractionLink(edge: EdgeView, ctx: LayoutContext): Point[] | null {
  const a = boxOf(edge.tail, ctx)
  const b = boxOf(edge.head, ctx)
  if (!a || !b) return null
  const toRight = cx(b) >= cx(a)
  return [
    { x: toRight ? a.left + a.width : a.left, y: Math.round(cy(a)) },
    { x: toRight ? b.left : b.left + b.width, y: Math.round(cy(b)) }
  ]
}
