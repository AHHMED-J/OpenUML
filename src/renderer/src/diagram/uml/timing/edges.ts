/**
 * Timing edges (spec 27 §3, §5): messages between time segments are straight lines at the
 * segments' row centers whose end x snaps to the segment edges; the time-constraint link joins a
 * constraint label to its host message or segment.
 */
import type { EdgeView, View } from '../../../model'
import { LineStyle, guillemets, messageNotation, relationshipNotation, type Point } from '../../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../../layout/edges'
import { stereotypeName } from '../../layout/helpers'
import type { EdgeLayout, LayoutContext, NodeLayout } from '../../layout/types'
import { tagString } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { messageSortOf } from '../sequence/analysis'
import { messageEditText, messageLabelText } from '../sequence/strings'
import { type TimeSegmentData } from './layout'

/** Ends snap to a segment's left or right edge when this close. */
export const SNAP_DISTANCE = 10

/** Snaps `x` onto `[left, right]`: clamped into it, then to an edge within `SNAP_DISTANCE`. */
export function snapToSegment(x: number, left: number, right: number): number {
  const c = Math.min(Math.max(x, left), right)
  if (c - left <= SNAP_DISTANCE) return left
  if (right - c <= SNAP_DISTANCE) return right
  return c
}

function segmentLayout(view: View | null, ctx: LayoutContext): NodeLayout<TimeSegmentData> | null {
  const l = view ? ctx.nodeLayout(view._id) : undefined
  return l && l.viewType === 'UMLTimeSegmentView' ? (l as NodeLayout<TimeSegmentData>) : null
}

/** Straight route between the two segments: y at each segment line, ends snapped to the segment edges. */
export function routeTimingMessage(edge: EdgeView, ctx: LayoutContext): Point[] | null {
  const t = segmentLayout(edge.tail, ctx)
  const h = segmentLayout(edge.head, ctx)
  if (!t || !h) return null
  const first = edge.points?.[0]
  const last = edge.points?.[edge.points.length - 1]
  const tx = snapToSegment(first?.x ?? t.box.left + t.box.width, t.box.left, t.box.left + t.box.width)
  const hx = snapToSegment(last?.x ?? h.box.left, h.box.left, h.box.left + h.box.width)
  return [
    { x: tx, y: t.data.centerY },
    { x: hx, y: h.data.centerY }
  ]
}

function messageLabels(edge: EdgeView): EdgeLabelSpec[] {
  const model = edge.model
  const n = messageNotation(messageSortOf(model))
  const keyword = stereotypeName(model) || n.fixedKeyword || ''
  return [
    {
      field: 'nameLabel',
      defaults: 'messageName',
      text: messageLabelText(model, { sequenceNumber: '', showSignature: true }),
      ...(model ? { edit: { kind: 'custom' as const, elementId: model._id, syntax: 'message' }, editText: messageEditText(model) } : {})
    },
    { field: 'stereotypeLabel', defaults: 'messageStereotype', text: keyword && (edge['stereotypeDisplay'] ?? 'label') !== 'none' ? guillemets(keyword) : '' },
    { field: 'propertyLabel', defaults: 'messageProperty', text: edge['showProperty'] === false ? '' : tagString(model) }
  ]
}

/** Z-index of messages: above the segments they join. */
export const TIMING_MESSAGE_Z = 3

export const timingMessageNotation: EdgeNotation = {
  layout(edge: EdgeView, ctx: LayoutContext): EdgeLayout {
    const n = messageNotation(messageSortOf(edge.model))
    const points = routeTimingMessage(edge, ctx)
    return buildEdgeLayout(edge, ctx, {
      dash: n.dash,
      tailEnd: n.tail,
      headEnd: n.head,
      zIndex: TIMING_MESSAGE_Z,
      labels: messageLabels(edge),
      ...(points ? { routed: { points, lineStyle: LineStyle.Oblique } } : {})
    })
  }
}

export const timeConstraintLinkNotation: EdgeNotation = {
  layout(edge: EdgeView, ctx: LayoutContext): EdgeLayout {
    const n = relationshipNotation('constraintLink')
    return buildEdgeLayout(edge, ctx, { dash: n.dash, tailEnd: n.tail, headEnd: n.head, labels: [] })
  }
}
