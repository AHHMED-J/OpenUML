/**
 * Standard edge layout: end attachment + routing (diagram/core) and polar label placement.
 */
import { isKindOf, type EdgeView, type View } from '../../model'
import {
  COLORS,
  DEFAULT_FONT,
  EDGE_LABEL_DEFAULTS,
  LineStyle,
  boundsOfPoints,
  edgeAsEndpoint,
  edgeEndShapes,
  placeEdgeLabel,
  routeEdge,
  type EdgeEndpoint,
  type EdgeLabelKind,
  type EdgePosition,
  type EndSpec,
  type Font,
  type LineDash,
  type Point,
  type Rect
} from '../core'
import { styleOf } from './helpers'
import type { EdgeLabelLayout, EdgeLayout, EditTarget, LayoutContext } from './types'

/** Attachment target of an edge end: a node layout, a sub-view endpoint, or another edge's middle. */
export function endpointOf(view: View | null | undefined, ctx: LayoutContext): EdgeEndpoint | null {
  if (!view) return null
  const node = ctx.nodeLayout(view._id)
  if (node) return node.endpoint ?? { box: node.box, outline: node.outline }
  const edge = ctx.edgeLayout(view._id)
  if (edge) return edgeAsEndpoint(edge.points)
  // Sub-view of a laid-out node (e.g. a lifeline's line part).
  for (let p = view._parent; isKindOf(p, 'View'); p = p._parent) {
    const host = ctx.nodeLayout(p._id)
    if (host) return host.subEndpoints?.[view._id] ?? host.endpoint ?? { box: host.box, outline: host.outline }
  }
  return null
}

/** Top-level view hosting `view` (the view itself when it is directly in the diagram). */
export function topLevelOf(view: View): View {
  let v = view
  while (isKindOf(v._parent, 'View')) v = v._parent
  return v
}

export interface RoutedEdge {
  readonly points: Point[]
  readonly lineStyle: LineStyle
}

/** Routes an edge view from its stored points and its ends' current layouts. */
export function routeEdgeView(edge: EdgeView, ctx: LayoutContext): RoutedEdge {
  const stored = (edge.points ?? []).map((p) => ({ x: p.x, y: p.y }))
  const style = (edge.lineStyle ?? LineStyle.Oblique) as LineStyle
  const tail = endpointOf(edge.tail, ctx)
  const head = endpointOf(edge.head, ctx)
  if (!tail || !head) return { points: stored, lineStyle: style }
  const selfLoop = edge.tail !== null && edge.tail === edge.head
  const r = routeEdge({ lineStyle: style, points: stored, tail, head, selfLoop })
  return { points: r.points, lineStyle: r.lineStyle }
}

export interface EdgeLabelSpec {
  /** Field of the edge holding the `EdgeLabelView` (e.g. `'nameLabel'`); its alpha/distance are used. */
  readonly field?: string
  /** Default placement when the label view is missing. */
  readonly defaults: EdgeLabelKind
  readonly text: string
  readonly edit?: EditTarget
  readonly editText?: string
  readonly underline?: boolean
}

/** Places labels around a routed polyline. Empty texts and hidden label views are skipped. */
export function placeEdgeLabels(
  edge: EdgeView,
  points: readonly Point[],
  specs: readonly EdgeLabelSpec[],
  ctx: LayoutContext
): EdgeLabelLayout[] {
  if (points.length === 0) return []
  const edgeFont = styleOf(edge).font
  const out: EdgeLabelLayout[] = []
  for (const spec of specs) {
    if (!spec.text) continue
    const lv = spec.field ? (edge[spec.field] as View | null | undefined) : null
    const label = isKindOf(lv, 'EdgeParasiticView') ? lv : null
    const d = EDGE_LABEL_DEFAULTS[spec.defaults]
    const position = (label && typeof label.edgePosition === 'number' ? label.edgePosition : d.edgePosition) as EdgePosition
    const alpha = label && Number.isFinite(label.alpha) ? label.alpha : d.alpha
    const distance = label && Number.isFinite(label.distance) ? label.distance : d.distance
    const font: Font = label?.font && label.font.size > 0 ? label.font : (edgeFont ?? DEFAULT_FONT)
    const size = ctx.measurer.measure(spec.text, font)
    const width = Math.ceil(size.width)
    const box = placeEdgeLabel(points, position, { alpha, distance }, { width, height: size.height })
    out.push({
      viewId: label?._id ?? null,
      edgePosition: position,
      text: spec.text,
      box,
      font,
      fontColor: label?.fontColor || styleOf(edge).fontColor,
      fillColor: label?.fillColor || COLORS.edgeBackground,
      ...(spec.underline ? { underline: true } : {}),
      ...(spec.edit ? { edit: spec.edit } : {}),
      ...(spec.editText !== undefined ? { editText: spec.editText } : {})
    })
  }
  return out
}

export interface EdgeLayoutInit<D> {
  readonly dash: LineDash
  readonly tailEnd: EndSpec
  readonly headEnd: EndSpec
  readonly labels?: readonly EdgeLabelSpec[]
  readonly zIndex?: number
  readonly data?: D
  /** Pre-routed points (custom routing); default `routeEdgeView`. */
  readonly routed?: RoutedEdge
  readonly extraBounds?: Rect[]
}

/** Standard edge layout: route, then place labels. */
export function buildEdgeLayout<D = undefined>(edge: EdgeView, ctx: LayoutContext, init: EdgeLayoutInit<D>): EdgeLayout<D> {
  const routed = init.routed ?? routeEdgeView(edge, ctx)
  return {
    kind: 'edge',
    viewId: edge._id,
    viewType: edge._type,
    points: routed.points,
    lineStyle: routed.lineStyle,
    dash: init.dash,
    tailEnd: init.tailEnd,
    headEnd: init.headEnd,
    labels: placeEdgeLabels(edge, routed.points, init.labels ?? [], ctx),
    zIndex: init.zIndex ?? 0,
    style: styleOf(edge),
    ...(init.extraBounds ? { extraBounds: init.extraBounds } : {}),
    data: init.data as D
  }
}

/** Area covered by an edge layout: polyline, end decorations, labels and extras. */
export function edgeLayoutBounds(layout: EdgeLayout): Rect[] {
  const pts: Point[] = [...layout.points]
  const ends = edgeEndShapes(layout.points, layout.tailEnd, layout.headEnd)
  for (const shape of [...ends.tail, ...ends.head]) {
    if (shape.type === 'circle') {
      pts.push({ x: shape.center.x - shape.radius, y: shape.center.y - shape.radius })
      pts.push({ x: shape.center.x + shape.radius, y: shape.center.y + shape.radius })
    } else pts.push(...shape.points)
  }
  const rects: Rect[] = []
  const pb = boundsOfPoints(pts)
  if (pb) rects.push(pb)
  for (const l of layout.labels) rects.push(l.box)
  if (layout.extraBounds) rects.push(...layout.extraBounds)
  return rects
}
