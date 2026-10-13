/**
 * IDEF0 arrow edges (spec 11 §3.2-3.4): the end of every arrow is derived from its role (a side of
 * the box, spread over evenly spaced slots), the route is orthogonal with rounded bends, branches
 * leave or join their trunk, tunneled ends are retracted and framed by parentheses, and the label
 * is linked to the line by a squiggle when it stands apart.
 */
import { roleOf, sourceSide, targetSide, type EdgeView, type Idef0Side, type View } from '../../model'
import type { EndSpec, Point, Rect } from '../core'
import { buildEdgeLayout, placeEdgeLabels, type EdgeLabelSpec } from '../layout/edges'
import { nameEditText } from '../layout/helpers'
import type { EdgeLayout, LayoutContext } from '../layout/types'
import type { EdgeNotation } from '../render/registry'
import { PORT_DIR, SIDE_DIR, IDEF0_STYLE, dirVector, rectCenterOf, slotPoint } from './geometry'
import { arrowLabelColor, arrowLineColor, arrowTextColor, isArrowView as isArrowEdge } from './colors'
import { STUB, feedbackKind, longestSegment, routeArrow, routeBranch, trimEnd, trimStart, type RouteEnd } from './routing'
import { arrowText, callLabelText } from './strings'

interface TunnelShape {
  /** SVG path data of the two parentheses of one tunneled end. */
  readonly paths: readonly string[]
  readonly bounds: Rect
}

export interface ArrowData {
  readonly tunnels: readonly TunnelShape[]
  /** Wavy line from the label to the arrow, or null. */
  readonly squiggle: readonly Point[] | null
  readonly lineWidth: number
  readonly role: string
}

function isArrowView(v: View | null | undefined): v is EdgeView {
  return !!v && v._type === 'IDEF0ArrowView'
}

function arrowViews(ctx: LayoutContext): EdgeView[] {
  return (ctx.diagram.ownedViews ?? []).filter(isArrowView) as EdgeView[]
}

function nodeBox(ctx: LayoutContext, view: View | null | undefined): Rect | null {
  const layout = view ? ctx.nodeLayout(view._id) : undefined
  return layout ? layout.box : null
}

function storedPoints(view: EdgeView): Point[] {
  return (view.points ?? []).map((p) => ({ x: p.x, y: p.y }))
}

function trunkPoints(trunk: View, ctx: LayoutContext): Point[] {
  return ctx.edgeLayout(trunk._id)?.points.map((p) => ({ ...p })) ?? storedPoints(trunk as EdgeView)
}

/** Coordinate of the other end of `edge` along the axis of `side`, used to order the slots of a side. */
function otherCoordinate(edge: EdgeView, end: 'tail' | 'head', side: Idef0Side, ctx: LayoutContext): number {
  const other = end === 'tail' ? edge.head : edge.tail
  if (!other) return Number.POSITIVE_INFINITY
  const horizontalSide = side === 'left' || side === 'right'
  let point: Point | null = null
  const box = nodeBox(ctx, other)
  if (box) point = rectCenterOf(box)
  else if (isArrowView(other)) {
    const pts = trunkPoints(other, ctx)
    point = pts[Math.floor(pts.length / 2)] ?? null
  }
  if (!point) return Number.POSITIVE_INFINITY
  return horizontalSide ? point.y : point.x
}

interface SlotEntry {
  readonly edge: EdgeView
  readonly end: 'tail' | 'head'
  readonly pinned: number
}

/** The arrow ends attached to `side` of the function view, in slot order (top-down / left-right). */
function slotsOn(fnView: View, side: Idef0Side, ctx: LayoutContext): SlotEntry[] {
  const entries: Array<SlotEntry & { order: number; key: number }> = []
  arrowViews(ctx).forEach((edge, order) => {
    const arrow = edge.model
    if (!arrow) return
    if (edge.tail === fnView && sourceSide(arrow) === side) {
      entries.push({ edge, end: 'tail', pinned: arrow['sourceSlot'] as number, order, key: otherCoordinate(edge, 'tail', side, ctx) })
    }
    if (edge.head === fnView && targetSide(arrow) === side) {
      entries.push({ edge, end: 'head', pinned: arrow['targetSlot'] as number, order, key: otherCoordinate(edge, 'head', side, ctx) })
    }
  })
  const auto = entries.filter((e) => e.pinned < 0).sort((a, b) => (a.key === b.key ? a.order - b.order : a.key - b.key))
  const pinned = entries.filter((e) => e.pinned >= 0).sort((a, b) => a.pinned - b.pinned || a.order - b.order)
  const result = [...auto]
  for (const p of pinned) result.splice(Math.min(p.pinned, result.length), 0, p)
  return result
}

/** Attachment of one end of `edge`, or null when the end is an arrow (branch) or absent. */
function describeEnd(edge: EdgeView, end: 'tail' | 'head', ctx: LayoutContext): RouteEnd | null {
  const view = end === 'tail' ? edge.tail : edge.head
  const arrow = edge.model
  if (!view || !arrow) return null
  const layout = ctx.nodeLayout(view._id)
  if (!layout) return null
  if (view._type === 'IDEF0PortView') {
    const role = (view.model?.['role'] as string | undefined) ?? 'input'
    return { point: rectCenterOf(layout.box), dir: PORT_DIR[role] ?? 'E', port: true }
  }
  const side = end === 'tail' ? sourceSide(arrow) : targetSide(arrow)
  const slots = slotsOn(view, side, ctx)
  const index = Math.max(0, slots.findIndex((s) => s.edge === edge && s.end === end))
  return { point: slotPoint(layout.box, side, index, slots.length), dir: SIDE_DIR[side], box: layout.box }
}

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a1, a2) <= Math.max(b1, b2) && Math.min(b1, b2) <= Math.max(a1, a2)
}

function laneOf(edge: EdgeView, tail: RouteEnd, head: RouteEnd, ctx: LayoutContext): number {
  const kind = feedbackKind(tail, head)
  if (!kind) return 0
  let lane = 0
  for (const other of arrowViews(ctx)) {
    if (other === edge) break
    const t = describeEnd(other, 'tail', ctx)
    const h = describeEnd(other, 'head', ctx)
    if (!t || !h || feedbackKind(t, h) !== kind) continue
    if (overlap(tail.point.x, head.point.x, t.point.x, h.point.x)) lane++
  }
  return lane
}

const SOLID_ARROW: EndSpec = { style: 'solidArrow' }
const FLAT: EndSpec = { style: 'flat' }

function unit(from: Point, to: Point): Point {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  return { x: dx, y: dy }
}

/** Parentheses around a tunneled end at `end`, `towards` the next point of the line. */
function tunnelAt(end: Point, towards: Point): TunnelShape {
  const u = unit(end, towards)
  const n = { x: -u.y, y: u.x }
  const half = IDEF0_STYLE.tunnelHalfChord
  const sag = 2 * (IDEF0_STYLE.tunnelRadius - Math.sqrt(IDEF0_STYLE.tunnelRadius ** 2 - half ** 2))
  const at = (s: number, bulge: number): string => {
    const c = { x: end.x + u.x * s, y: end.y + u.y * s }
    const p1 = { x: c.x + n.x * half, y: c.y + n.y * half }
    const p2 = { x: c.x - n.x * half, y: c.y - n.y * half }
    const q = { x: c.x + u.x * bulge, y: c.y + u.y * bulge }
    return `M${p1.x} ${p1.y} Q${q.x} ${q.y} ${p2.x} ${p2.y}`
  }
  const near = IDEF0_STYLE.tunnelGap
  const far = near + IDEF0_STYLE.tunnelSpan
  const box: Rect = {
    left: Math.min(end.x, end.x + u.x * far) - half,
    top: Math.min(end.y, end.y + u.y * far) - half,
    width: Math.abs(u.x * far) + 2 * half,
    height: Math.abs(u.y * far) + 2 * half
  }
  return { paths: [at(near, -sag), at(far, sag)], bounds: box }
}

/** Distance from `p` to the closest point of polyline `pts` and that point. */
function nearestOnPolyline(p: Point, pts: readonly Point[]): { point: Point; distance: number } {
  let best = { point: pts[0] ?? p, distance: Number.POSITIVE_INFINITY }
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Point
    const b = pts[i + 1] as Point
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const q = { x: a.x + t * dx, y: a.y + t * dy }
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < best.distance) best = { point: q, distance: d }
  }
  return best
}

function borderToward(box: Rect, p: Point): Point {
  return { x: Math.max(box.left, Math.min(box.left + box.width, p.x)), y: Math.max(box.top, Math.min(box.top + box.height, p.y)) }
}

/** Wavy line (2 periods, amplitude 2) from `from` to `to`. */
function squigglePoints(from: Point, to: Point): Point[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length < 1) return [from, to]
  const ux = (to.x - from.x) / length
  const uy = (to.y - from.y) / length
  const samples = 16
  const out: Point[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const off = i === 0 || i === samples ? 0 : Math.sin(t * 4 * Math.PI) * IDEF0_STYLE.squiggleAmplitude
    out.push({ x: from.x + ux * length * t - uy * off, y: from.y + uy * length * t + ux * off })
  }
  return out
}

/** Routes the arrow from its model-derived ends. */
function routeArrowView(edge: EdgeView, ctx: LayoutContext): { points: Point[]; join: boolean } {
  const arrow = edge.model
  if (!arrow) return { points: storedPoints(edge), join: false }
  const role = roleOf(arrow)
  if (isArrowView(edge.tail)) {
    const head = describeEnd(edge, 'head', ctx)
    if (!head) return { points: storedPoints(edge), join: false }
    return { points: routeBranch(trunkPoints(edge.tail, ctx), head), join: false }
  }
  if (isArrowView(edge.head)) {
    const tail = describeEnd(edge, 'tail', ctx)
    if (!tail) return { points: storedPoints(edge), join: true }
    return { points: routeBranch(trunkPoints(edge.head, ctx), tail).reverse(), join: true }
  }
  const tail = describeEnd(edge, 'tail', ctx)
  if (role === 'call') {
    if (!tail) return { points: storedPoints(edge), join: false }
    const v = dirVector(tail.dir)
    return { points: [tail.point, { x: tail.point.x + v.x * STUB, y: tail.point.y + v.y * STUB }], join: false }
  }
  const head = describeEnd(edge, 'head', ctx)
  if (!tail || !head) return { points: storedPoints(edge), join: false }
  return { points: routeArrow({ tail, head, lane: laneOf(edge, tail, head, ctx) }), join: false }
}

/**
 * The stored label offset (a quarter turn, 12 away) is the "not placed by hand" default: such labels
 * sit 4 above a horizontal run and 6 right of a vertical one. A dragged label keeps its own offset.
 */
function labelHost(edge: EdgeView, text: string, run: readonly Point[], ctx: LayoutContext): EdgeView {
  const stored = edge['nameLabel'] as View | null | undefined
  const isDefault = !stored || (Math.abs((stored['alpha'] as number) - Math.PI / 2) < 1e-6 && stored['distance'] === DEFAULT_LABEL_DISTANCE)
  if (!isDefault || !text || run.length < 2) return edge
  const font = stored?.font && (stored.font as { size: number }).size > 0 ? stored.font : edge.font
  const size = ctx.measurer.measure(text, font)
  const horizontal = (run[0] as Point).y === (run[1] as Point).y
  const distance = horizontal ? 4 + size.height / 2 : 6 + Math.ceil(size.width) / 2
  const label = { ...(stored ?? { _type: 'EdgeLabelView', _id: '', _parent: edge, edgePosition: 1, alpha: Math.PI / 2 }), distance } as unknown as View
  return { ...edge, nameLabel: label } as EdgeView
}

/**
 * The arrow views forming one fork/join tree with `edge` on its diagram (its root trunk and every
 * branch below it; just `edge` when it has no branches).
 */
function arrowTree(edge: EdgeView, ctx: LayoutContext): string[] {
  let root: View = edge
  for (let guard = 0; guard < 64; guard++) {
    const up = isArrowEdge(root['tail']) ? (root['tail'] as View) : isArrowEdge(root['head']) ? (root['head'] as View) : null
    if (!up) break
    root = up
  }
  const views = arrowViews(ctx)
  const tree: View[] = [root]
  for (let i = 0; i < tree.length && tree.length < 512; i++) {
    const trunk = tree[i] as View
    for (const v of views) if ((v.tail === trunk || v.head === trunk) && !tree.includes(v)) tree.push(v)
  }
  return tree.map((v) => v._id)
}

/** Gap between the line and a tunneled end where the parentheses sit. */
const RETRACT = IDEF0_STYLE.tunnelGap + 6

/** Stored `distance` of a label nobody has dragged (spec 11 §7.2). */
const DEFAULT_LABEL_DISTANCE = 12

function layoutArrow(edge: EdgeView, ctx: LayoutContext): EdgeLayout<ArrowData> {
  const arrow = edge.model
  const routed = routeArrowView(edge, ctx)
  let points = routed.points
  const tunnels: TunnelShape[] = []
  const touchesBox = (view: View | null): boolean => !!view && !isArrowView(view)
  if (arrow && points.length >= 2) {
    if (arrow['tunnelSource'] && touchesBox(edge.tail)) {
      tunnels.push(tunnelAt(points[0] as Point, points[1] as Point))
      points = trimStart(points, RETRACT)
    }
    if (arrow['tunnelTarget'] && touchesBox(edge.head)) {
      tunnels.push(tunnelAt(points[points.length - 1] as Point, points[points.length - 2] as Point))
      points = trimEnd(points, RETRACT)
    }
  }
  const role = arrow ? roleOf(arrow) : 'input'
  const text = arrow ? arrowText(arrow) : ''
  const isCall = role === 'call'
  const labelSpec: EdgeLabelSpec[] = arrow
    ? [
        {
          field: 'nameLabel',
          defaults: 'name',
          text,
          edit: isCall ? { kind: 'custom', elementId: arrow._id, syntax: 'idef0.call' } : { kind: 'name', elementId: arrow._id },
          editText: isCall ? callLabelText(arrow) : arrow['name'] ? nameEditText(arrow) : text
        }
      ]
    : []
  const labelPoints = longestSegment(points) ?? (points.length >= 2 ? [points[0] as Point, points[1] as Point] : points)
  const base = buildEdgeLayout(edge, ctx, {
    dash: 'solid',
    tailEnd: FLAT,
    headEnd: routed.join ? FLAT : SOLID_ARROW,
    zIndex: 1,
    labels: [],
    routed: { points, lineStyle: (edge.lineStyle ?? 2) as never },
    extraBounds: tunnels.map((t) => t.bounds)
  })
  // Colors: a branch takes its trunk's, the label follows the line unless it has a text color.
  const style = { ...base.style, lineColor: arrowLineColor(edge), fontColor: arrowTextColor(edge) }
  const labelColor = arrowLabelColor(edge, edge['nameLabel'] as View | null | undefined)
  const labels = (labelPoints.length >= 2 ? placeEdgeLabels(labelHost(edge, text, labelPoints, ctx), labelPoints, labelSpec, ctx) : []).map((l) => ({ ...l, fontColor: labelColor }))
  let squiggle: Point[] | null = null
  const label = labels[0]
  if (label && edge['showSquiggle'] !== false) {
    const near = nearestOnPolyline(rectCenterOf(label.box), points)
    const start = borderToward(label.box, near.point)
    const gap = Math.hypot(near.point.x - start.x, near.point.y - start.y)
    if (gap > 8) squiggle = squigglePoints(start, near.point)
  }
  const fallback =
    arrow && !text
      ? {
          target: isCall ? ({ kind: 'custom', elementId: arrow._id, syntax: 'idef0.call' } as const) : ({ kind: 'name', elementId: arrow._id } as const),
          text: isCall ? callLabelText(arrow) : ((arrow['name'] as string) ?? '')
        }
      : undefined
  return {
    ...base,
    style,
    labels,
    labelPoints,
    ...(fallback ? { fallbackEdit: fallback } : {}),
    highlightGroup: arrowTree(edge, ctx),
    data: { tunnels, squiggle, lineWidth: IDEF0_STYLE.arrowLine, role }
  }
}

export const arrowNotation: EdgeNotation<ArrowData> = {
  connectKind: 'IDEF0Arrow',
  layout: layoutArrow
}

