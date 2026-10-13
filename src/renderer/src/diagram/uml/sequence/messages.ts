/**
 * Sequence messages (spec 03 §4.4): horizontal edges between lifeline lines that route
 * themselves. The y comes from the first stored point (dragging a message shifts it vertically);
 * x comes from the lifelines: the tail leaves the sender's line or the side of its innermost
 * active bar, the head arrives at the receiver's line, the side of its new (or active) bar, or the
 * side of the created lifeline's header. Self messages loop out 30 to the right and down 20.
 */
import { type EdgeView, type Elem, type View } from '../../../model'
import { LineStyle, SPACING, Z_INDEX, guillemets, messageNotation, type Point } from '../../core'
import { buildEdgeLayout, placeEdgeLabels, type EdgeLabelSpec } from '../../layout/edges'
import { stereotypeName, styleOf } from '../../layout/helpers'
import type { EdgeLayout, LayoutContext, NodeLayout } from '../../layout/types'
import { tagString } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { messageSortOf, sequenceInfo, type MessageInfo } from './analysis'
import type { ActivationLayout, LifelineData } from './layout'
import { messageEditText, messageLabelText } from './strings'

export interface MessageData {
  readonly self: boolean
  readonly sequenceNumber: string
}

function lifelineLayout(id: string | null, ctx: LayoutContext): NodeLayout<LifelineData> | null {
  const l = id ? ctx.nodeLayout(id) : undefined
  return l && l.viewType === 'UMLSeqLifelineView' ? (l as NodeLayout<LifelineData>) : null
}

/** Innermost bar on a lifeline covering `y` (excluding the bar of `excludeId`). */
function activeBarAt(lifeline: LifelineData, y: number, excludeId?: string): ActivationLayout | null {
  let best: ActivationLayout | null = null
  for (const a of lifeline.activations) {
    if (a.messageId === excludeId) continue
    if (y < a.rect.top || y > a.rect.top + a.rect.height) continue
    if (!best || a.level > best.level) best = a
  }
  return best
}

function barSide(bar: ActivationLayout, right: boolean): number {
  return right ? bar.rect.left + bar.rect.width : bar.rect.left
}

/** x of a non-lifeline end (endpoint / gate node): its side facing the other end, or its center. */
function nodeEndX(view: View | null, ctx: LayoutContext, towardRight: boolean | null): number | null {
  const n = view ? ctx.nodeLayout(view._id) : undefined
  if (!n) return null
  if (towardRight === null) return Math.round(n.box.left + n.box.width / 2)
  return Math.round(towardRight ? n.box.left + n.box.width : n.box.left)
}

/** Routed points of a message, or null when its ends are not laid out. */
function routeMessage(info: MessageInfo, ctx: LayoutContext): Point[] | null {
  const id = info.view._id
  const y = info.y
  const tl = lifelineLayout(info.tailLifeline, ctx)
  const hl = lifelineLayout(info.headLifeline, ctx)
  const own = hl?.data.activations.find((a) => a.messageId === id) ?? null

  if (info.self && tl) {
    const d = tl.data
    const out = activeBarAt(d, y, id)
    const x0 = out ? barSide(out, true) : d.lineX
    const xr = x0 + SPACING.selfMessageWidth
    const y2 = info.arrivalY
    const back = own ?? activeBarAt(d, y2, id)
    const xa = back ? barSide(back, true) : d.lineX
    return [
      { x: x0, y },
      { x: xr, y },
      { x: xr, y: y2 },
      { x: xa, y: y2 }
    ]
  }

  const tailCenter = tl ? tl.data.lineX : nodeEndX(info.tail, ctx, null)
  const headCenter = hl ? hl.data.lineX : nodeEndX(info.head, ctx, null)
  if (tailCenter === null || headCenter === null) return null
  const right = headCenter >= tailCenter

  let tx = tailCenter
  if (tl) {
    const bar = activeBarAt(tl.data, y, id)
    if (bar) tx = barSide(bar, right)
  } else tx = nodeEndX(info.tail, ctx, right) ?? tailCenter

  let hx = headCenter
  if (hl) {
    if (info.sort === 'createMessage') {
      const h = hl.data.header
      hx = right ? h.left : h.left + h.width
    } else if (info.sort !== 'deleteMessage') {
      const bar = own ?? activeBarAt(hl.data, y, id)
      if (bar) hx = barSide(bar, !right)
    }
  } else hx = nodeEndX(info.head, ctx, !right) ?? headCenter

  return [
    { x: tx, y },
    { x: hx, y }
  ]
}

function labelSpecs(edge: EdgeView, model: Elem | null, info: MessageInfo | undefined, ctx: LayoutContext): EdgeLabelSpec[] {
  const n = messageNotation(messageSortOf(model))
  const st = stereotypeName(model)
  const keyword = st || n.fixedKeyword || ''
  const text = messageLabelText(model, {
    sequenceNumber: info?.sequenceNumber ?? '',
    showSignature: ctx.diagram['showSignature'] !== false
  })
  return [
    {
      field: 'nameLabel',
      defaults: 'messageName',
      text,
      ...(model ? { edit: { kind: 'custom' as const, elementId: model._id, syntax: 'message' }, editText: messageEditText(model) } : {})
    },
    { field: 'stereotypeLabel', defaults: 'messageStereotype', text: keyword && (edge['stereotypeDisplay'] ?? 'label') !== 'none' ? guillemets(keyword) : '' },
    { field: 'propertyLabel', defaults: 'messageProperty', text: edge['showProperty'] === false ? '' : tagString(model) }
  ]
}

/**
 * Polyline the labels are placed on: the message itself, reversed for leftward messages (so
 * labels stay above the arrow), or a virtual line beside a self message's loop (labels start 5
 * to the right of the loop, vertically centered on it).
 */
function labelPolyline(points: readonly Point[], self: boolean, labelWidth: number): Point[] {
  const first = points[0] as Point
  const last = points[points.length - 1] as Point
  if (self) {
    const loopX = points[1]?.x ?? first.x
    const y = Math.round((first.y + last.y) / 2) + 15
    return [
      { x: loopX + 5, y },
      { x: loopX + 5 + labelWidth, y }
    ]
  }
  return last.x < first.x ? [...points].reverse() : [...points]
}

function layoutMessage(edge: EdgeView, ctx: LayoutContext): EdgeLayout<MessageData> {
  const model = edge.model
  const info = sequenceInfo(ctx).messages.get(edge._id)
  const n = messageNotation(messageSortOf(model))
  const specs = labelSpecs(edge, model, info, ctx)
  const points = info ? routeMessage(info, ctx) : null
  const lineStyle = edge.lineStyle === LineStyle.Curve ? LineStyle.Rectilinear : ((edge.lineStyle ?? LineStyle.Oblique) as LineStyle)
  const base = buildEdgeLayout<MessageData>(edge, ctx, {
    dash: n.dash,
    tailEnd: n.tail,
    headEnd: n.head,
    zIndex: Z_INDEX.message,
    data: { self: info?.self ?? false, sequenceNumber: info?.sequenceNumber ?? '' },
    ...(points ? { routed: { points, lineStyle } } : {}),
    labels: points ? [] : specs
  })
  if (!points) return { ...base, dragAxis: 'vert' }
  const font = styleOf(edge).font
  const width = Math.max(0, ...specs.map((s) => Math.ceil(ctx.measurer.measure(s.text, font).width)))
  const labelPoints = labelPolyline(points, info?.self ?? false, width)
  return { ...base, labels: placeEdgeLabels(edge, labelPoints, specs, ctx), labelPoints, dragAxis: 'vert' }
}

export const messageNotationEntry: EdgeNotation<MessageData> = {
  connectKind: 'Message',
  layout: layoutMessage
}

