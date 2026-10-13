/**
 * Communication diagram nodes (spec 26 §5): lifeline boxes (bold centered `name[selector]: Type`,
 * 100 × 30 minimum, a second outline offset by 5 for multi-instance lifelines) and the short
 * free-floating message arrows that ride beside a connector's middle segment, with their
 * numbered labels. Pure: reads the model, returns layout data.
 */
import { COMM_LIFELINE_MIN, isKindOf, type EdgeView, type Elem, type NodeView, type View } from '../../../model'
import {
  COLORS,
  EdgePosition,
  SPACING,
  edgeAnchor,
  guillemets,
  messageNotation,
  placeEdgeLabel,
  polarLabelCenter,
  type EndSpec,
  type LineDash,
  type MessageSort,
  type Point,
  type Rect
} from '../../core'
import { routeEdgeView } from '../../layout/edges'
import {
  arrangeNameCompartment,
  measureNameCompartment,
  nodeLayout,
  stereotypeName,
  styleOf
} from '../../layout/helpers'
import type { EdgeLabelLayout, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { tagString } from '../../render/generic'
import { nodeNotationFor } from '../../render/registry'
import { lifelineEditText, lifelineHeaderText, messageEditText, messageLabelText } from '../sequence/strings'
import { messageSortOf } from '../sequence/analysis'

/** Length of a message arrow (±20 along the connector) and its offset from the connector. */
const MESSAGE_ARROW_LENGTH = 40
const MESSAGE_OFFSET = 10
/** Clickable margin around an arrow. */
const MESSAGE_HIT_MARGIN = 10

// =============================================================================================
// Lifeline

export interface CommLifelineData {
  readonly nameLines: readonly TextLine[]
  readonly multiInstance: boolean
  readonly active: boolean
}

export function layoutCommLifeline(view: NodeView, ctx: LayoutContext): NodeLayout<CommLifelineData> {
  const model = view.model
  const style = styleOf(view)
  const name = measureNameCompartment({ stereotype: stereotypeName(model), name: lifelineHeaderText(model), font: style.font }, ctx.measurer)
  const textWidth = name.width - 2 * SPACING.compartmentPaddingLeft
  const type = (model?.['represent'] as Elem | null | undefined)?.['type'] as Elem | string | null | undefined
  const base = nodeLayout<CommLifelineData>(view, {
    minWidth: Math.max(COMM_LIFELINE_MIN.width, Math.ceil(textWidth) + 20),
    minHeight: Math.max(COMM_LIFELINE_MIN.height, name.height),
    style,
    data: (box) => {
      // Center the text itself: the compartment has padding above the first line and below the last.
      const pad = SPACING.compartmentPaddingTop + ((name.items[0]?.index ?? 1) > 0 ? SPACING.compartmentItemGap : 0)
      const textH = name.height - pad - SPACING.compartmentPaddingBottom
      const rect = { left: box.left, top: box.top + (box.height - textH) / 2 - pad, width: box.width, height: name.height }
      return {
        nameLines: arrangeNameCompartment(name, rect),
        multiInstance: model?.['isMultiInstance'] === true,
        active: typeof type === 'object' && type !== null && type['isActive'] === true
      }
    },
    regions: (box) => (model ? [{ box, target: { kind: 'custom', elementId: model._id, syntax: 'lifeline' }, text: lifelineEditText(model), font: style.font }] : [])
  })
  return base.data.multiInstance ? { ...base, extraBounds: [{ ...base.box, left: base.box.left + 5, top: base.box.top + 5 }] } : base
}

// =============================================================================================
// Message arrow

export interface CommMessageData {
  readonly tail: Point
  readonly head: Point
  readonly dash: LineDash
  readonly headEnd: EndSpec
  readonly labels: readonly EdgeLabelLayout[]
}

/** Head decoration of a message sort: filled triangle for sync call / delete, open V otherwise. */
export function commArrowHead(sort: MessageSort): EndSpec {
  return sort === 'synchCall' || sort === 'deleteMessage' ? { style: 'solidArrow' } : { style: 'stickArrow' }
}

/** Only replies are dashed. */
export function commArrowDash(sort: MessageSort): LineDash {
  return sort === 'reply' ? 'dot' : 'solid'
}

/** 1-based position of `message` in its interaction (auto numbering), or the custom number. */
export function commSequenceNumber(message: Elem | null | undefined, diagram: { readonly [k: string]: unknown }): string {
  if (!message || diagram['showSequenceNumber'] === false) return ''
  if (diagram['sequenceNumbering'] === 'custom') {
    const custom = message['sequenceNumber']
    return typeof custom === 'string' ? custom : ''
  }
  const messages = message._parent?.['messages']
  const index = Array.isArray(messages) ? messages.indexOf(message) : -1
  return index >= 0 ? String(index + 1) : ''
}

/** A context whose node lookups fall back to on-demand layouts (the connector's ends may not be laid out yet). */
function withOnDemandNodes(ctx: LayoutContext): LayoutContext {
  const cache = new Map<string, NodeLayout | undefined>()
  return {
    ...ctx,
    nodeLayout(id) {
      const known = ctx.nodeLayout(id)
      if (known) return known
      if (cache.has(id)) return cache.get(id)
      cache.set(id, undefined)
      const view = ctx.repository.get(id) as View | undefined
      let laid: NodeLayout | undefined
      if (view && isKindOf(view, 'NodeView')) {
        try {
          laid = nodeNotationFor(view).layout(view as NodeView, this)
        } catch {
          laid = undefined
        }
      }
      cache.set(id, laid)
      return laid
    }
  }
}

/** Routed polyline of a connector view (what its edge layout will compute). */
function connectorPoints(connector: EdgeView, ctx: LayoutContext): Point[] {
  return routeEdgeView(connector, withOnDemandNodes(ctx)).points
}

export interface ArrowGeometry {
  readonly center: Point
  readonly tail: Point
  readonly head: Point
}

/**
 * Arrow beside a connector: centered at the polar offset (`alpha`, `distance`) from the middle
 * anchor of `points`, 40 long along the connector direction; `forward` false flips it.
 */
export function arrowBesideConnector(points: readonly Point[], alpha: number, distance: number, forward: boolean): ArrowGeometry {
  const a = edgeAnchor(points, EdgePosition.Middle)
  const center = polarLabelCenter(a, { alpha, distance })
  const dx = a.reference.x - a.anchor.x
  const dy = a.reference.y - a.anchor.y
  const len = Math.hypot(dx, dy)
  const d = len === 0 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len }
  const s = forward ? 1 : -1
  const half = MESSAGE_ARROW_LENGTH / 2
  return {
    center,
    tail: { x: Math.round(center.x - d.x * half * s), y: Math.round(center.y - d.y * half * s) },
    head: { x: Math.round(center.x + d.x * half * s), y: Math.round(center.y + d.y * half * s) }
  }
}

function polarOf(label: unknown, defaults: { alpha: number; distance: number }): { alpha: number; distance: number } {
  const l = label as View | null | undefined
  const alpha = typeof l?.['alpha'] === 'number' && Number.isFinite(l['alpha']) ? (l['alpha'] as number) : defaults.alpha
  const distance = typeof l?.['distance'] === 'number' && Number.isFinite(l['distance']) ? (l['distance'] as number) : defaults.distance
  return { alpha, distance }
}

const HALF_PI = Math.PI / 2

/** Message arrow layout; the arrow is hit within its bounding box expanded by 10. */
export function layoutCommMessage(view: NodeView, ctx: LayoutContext): NodeLayout<CommMessageData> {
  const message = view.model
  const style = styleOf(view)
  const connector = (view['hostEdge'] as EdgeView | null | undefined) ?? null
  const sort = messageSortOf(message)
  const n = messageNotation(sort)
  const points = connector ? connectorPoints(connector, ctx) : []
  const alpha = typeof view['alpha'] === 'number' && Number.isFinite(view['alpha']) ? (view['alpha'] as number) : HALF_PI
  const distance = typeof view['distance'] === 'number' && Number.isFinite(view['distance']) ? (view['distance'] as number) : MESSAGE_OFFSET
  const tailModel = connector?.tail?.model
  const forward = connector?.tail === connector?.head || !message || message['source'] === tailModel
  const arrow: ArrowGeometry =
    points.length > 0
      ? arrowBesideConnector(points, alpha, distance, forward)
      : { center: { x: view.left ?? 0, y: view.top ?? 0 }, tail: { x: view.left ?? 0, y: view.top ?? 0 }, head: { x: (view.left ?? 0) + MESSAGE_ARROW_LENGTH, y: view.top ?? 0 } }

  // Labels sit relative to the arrow axis; a visible property label pushes name and stereotype out.
  const showNumber = ctx.diagram['showSequenceNumber'] !== false
  const text = messageLabelText(message, {
    sequenceNumber: showNumber ? commSequenceNumber(message, ctx.diagram) : '',
    showSignature: ctx.diagram['showSignature'] !== false
  })
  const st = stereotypeName(message)
  const keyword = st || n.fixedKeyword || ''
  const propertyText = view['showProperty'] === false ? '' : tagString(message)
  const grow = propertyText && polarOf(view['nameLabel'], { alpha: HALF_PI, distance: MESSAGE_OFFSET }).distance < 25 ? 15 : 0
  // Leftward arrows place their labels along the reversed axis so the text stays above the arrow.
  const axis = arrow.head.x < arrow.tail.x ? [arrow.head, arrow.tail] : [arrow.tail, arrow.head]
  const labels: EdgeLabelLayout[] = []
  const place = (field: 'nameLabel' | 'stereotypeLabel' | 'propertyLabel', labelText: string, defaults: { alpha: number; distance: number }, extra: number, edit?: EdgeLabelLayout['edit'], editText?: string): void => {
    if (!labelText) return
    const lv = view[field] as View | null | undefined
    const p = polarOf(lv, defaults)
    const size = ctx.measurer.measure(labelText, style.font)
    labels.push({
      viewId: lv?._id ?? null,
      edgePosition: EdgePosition.Middle,
      text: labelText,
      box: placeEdgeLabel(axis, EdgePosition.Middle, { alpha: p.alpha, distance: p.distance + extra }, { width: Math.ceil(size.width), height: size.height }),
      font: style.font,
      fontColor: style.fontColor,
      fillColor: COLORS.edgeBackground,
      ...(edit ? { edit } : {}),
      ...(editText !== undefined ? { editText } : {})
    })
  }
  place('nameLabel', text, { alpha: HALF_PI, distance: MESSAGE_OFFSET }, grow, message ? { kind: 'custom', elementId: message._id, syntax: 'message' } : undefined, message ? messageEditText(message) : undefined)
  place('stereotypeLabel', keyword && view['stereotypeDisplay'] !== 'none' ? guillemets(keyword) : '', { alpha: HALF_PI, distance: 25 }, grow)
  place('propertyLabel', propertyText, { alpha: HALF_PI, distance: MESSAGE_OFFSET }, 0)

  const xs = [arrow.tail.x, arrow.head.x]
  const ys = [arrow.tail.y, arrow.head.y]
  const box: Rect = {
    left: Math.min(...xs) - 6,
    top: Math.min(...ys) - 6,
    width: Math.max(...xs) - Math.min(...xs) + 12,
    height: Math.max(...ys) - Math.min(...ys) + 12
  }
  const positioned = { ...view, left: box.left, top: box.top, width: box.width, height: box.height, autoResize: false } as NodeView
  const m = MESSAGE_HIT_MARGIN
  const laid = nodeLayout<CommMessageData>(positioned, {
    minWidth: box.width,
    minHeight: box.height,
    sizable: 'none',
    movable: false,
    zIndex: 1,
    style,
    extraBounds: labels.map((l) => l.box),
    data: { tail: arrow.tail, head: arrow.head, dash: commArrowDash(sort), headEnd: commArrowHead(sort), labels },
    regions: message
      ? [
          {
            box: labels[0]?.box ?? box,
            target: { kind: 'custom', elementId: message._id, syntax: 'message' },
            text: messageEditText(message),
            font: style.font
          }
        ]
      : []
  })
  return { ...laid, hitAreas: [{ left: box.left - m, top: box.top - m, width: box.width + 2 * m, height: box.height + 2 * m }] }
}
