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
import { cssColorOr } from '../../format/cssColor'
import { styleOf } from './helpers'
import type { EdgeLabelLayout, EdgeLabelSlot, EdgeLayout, EditTarget, LayoutContext } from './types'

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
  /**
   * Hint for an empty editable label (e.g. `'multiplicity'`): the label then still gets an
   * editor-only slot (`EdgeLayout.slots`) placed as the label would be.
   */
  readonly placeholder?: string
  /** Text the slot is sized for (e.g. `'0..*'`; default the placeholder). */
  readonly placeholderSample?: string
  /** This label's edit is the main inline edit of that end of the edge (`EdgeLayout.endEdits`). */
  readonly endEdit?: 'tail' | 'head'
}

interface PlacedBox {
  readonly viewId: string | null
  readonly edgePosition: EdgePosition
  readonly box: Rect
  readonly font: Font
  readonly label: View | null
}

function placeSpec(edge: EdgeView, points: readonly Point[], spec: EdgeLabelSpec, text: string, ctx: LayoutContext): PlacedBox {
  const lv = spec.field ? (edge[spec.field] as View | null | undefined) : null
  const label = isKindOf(lv, 'EdgeParasiticView') ? lv : null
  const d = EDGE_LABEL_DEFAULTS[spec.defaults]
  const position = (label && typeof label.edgePosition === 'number' ? label.edgePosition : d.edgePosition) as EdgePosition
  const alpha = label && Number.isFinite(label.alpha) ? label.alpha : d.alpha
  const distance = label && Number.isFinite(label.distance) ? label.distance : d.distance
  const font: Font = label?.font && label.font.size > 0 ? label.font : (styleOf(edge).font ?? DEFAULT_FONT)
  const size = ctx.measurer.measure(text, font)
  const width = Math.ceil(size.width)
  const box = placeEdgeLabel(points, position, { alpha, distance }, { width, height: size.height })
  return { viewId: label?._id ?? null, edgePosition: position, box, font, label }
}

/** Places labels around a routed polyline. Empty texts and hidden label views are skipped. */
export function placeEdgeLabels(
  edge: EdgeView,
  points: readonly Point[],
  specs: readonly EdgeLabelSpec[],
  ctx: LayoutContext
): EdgeLabelLayout[] {
  if (points.length === 0) return []
  const out: EdgeLabelLayout[] = []
  for (const spec of specs) {
    if (!spec.text) continue
    const placed = placeSpec(edge, points, spec, spec.text, ctx)
    const label = placed.label
    out.push({
      viewId: placed.viewId,
      edgePosition: placed.edgePosition,
      text: spec.text,
      box: placed.box,
      font: placed.font,
      fontColor: cssColorOr(label?.fontColor, styleOf(edge).fontColor),
      fillColor: cssColorOr(label?.fillColor, COLORS.edgeBackground),
      ...(spec.underline ? { underline: true } : {}),
      ...(spec.edit ? { edit: spec.edit } : {}),
      ...(spec.editText !== undefined ? { editText: spec.editText } : {})
    })
  }
  return out
}

/** Size of slot hints relative to the label font. */
const SLOT_HINT_SCALE = 0.75

/**
 * Editor-only slots of the empty editable labels that have a placeholder: where the label would
 * be placed, so it can be double-clicked (and hinted while the edge is selected).
 */
export function placeEdgeLabelSlots(
  edge: EdgeView,
  points: readonly Point[],
  specs: readonly EdgeLabelSpec[],
  ctx: LayoutContext
): EdgeLabelSlot[] {
  if (points.length === 0) return []
  const out: EdgeLabelSlot[] = []
  for (const spec of specs) {
    if (spec.text || !spec.edit || !spec.placeholder) continue
    const placed = placeSpec(edge, points, spec, spec.placeholderSample ?? spec.placeholder, ctx)
    // The hint is drawn smaller and in italics, centered on the slot.
    const hintFont: Font = { ...placed.font, size: Math.max(7, Math.round(placed.font.size * SLOT_HINT_SCALE)), style: 2 }
    const hint = ctx.measurer.measure(spec.placeholder, hintFont)
    const b = placed.box
    const hintBox = { left: b.left + b.width / 2 - Math.ceil(hint.width) / 2, top: b.top + b.height / 2 - hint.height / 2, width: Math.ceil(hint.width), height: hint.height }
    out.push({
      box: placed.box,
      font: placed.font,
      hintBox,
      hintFont,
      hint: spec.placeholder,
      edit: spec.edit,
      editText: spec.editText ?? '',
      ...(spec.endEdit ? { end: spec.endEdit } : {})
    })
  }
  return out
}

/** The main inline edit of each end, from the specs marked `endEdit`. */
function endEditsOf(specs: readonly EdgeLabelSpec[]): EdgeLayout['endEdits'] {
  let tail: EditTarget | undefined
  let head: EditTarget | undefined
  for (const spec of specs) {
    if (!spec.edit) continue
    if (spec.endEdit === 'tail') tail ??= spec.edit
    else if (spec.endEdit === 'head') head ??= spec.edit
  }
  return tail || head ? { ...(tail ? { tail } : {}), ...(head ? { head } : {}) } : undefined
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
  const specs = init.labels ?? []
  const slots = placeEdgeLabelSlots(edge, routed.points, specs, ctx)
  const endEdits = endEditsOf(specs)
  return {
    kind: 'edge',
    viewId: edge._id,
    viewType: edge._type,
    points: routed.points,
    lineStyle: routed.lineStyle,
    dash: init.dash,
    tailEnd: init.tailEnd,
    headEnd: init.headEnd,
    labels: placeEdgeLabels(edge, routed.points, specs, ctx),
    ...(slots.length > 0 ? { slots } : {}),
    ...(endEdits ? { endEdits } : {}),
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
