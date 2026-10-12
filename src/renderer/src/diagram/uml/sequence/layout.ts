/**
 * Measure/arrange of sequence-diagram nodes (spec 03 §4.4): lifelines (header, dashed line,
 * activation bars, destruction X), combined fragments with their operands, lost/found
 * endpoints and gates, interaction uses, continuations and state invariants. Pure: reads the
 * model (and the diagram-wide `sequenceInfo`), returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type UMLSeqLifelineView, type View } from '../../../model'
import { LIFELINE_MIN_LINE_LENGTH, MIN_SIZES, SPACING, Z_INDEX, type Rect } from '../../core'
import {
  arrangeNameCompartment,
  measureNameCompartment,
  nameEditText,
  nameOf,
  nodeLayout,
  stereotypeName,
  styleOf
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeDivider, NodeLayout, TextLine } from '../../layout/types'
import { frameHitAreas, layoutFrameLabel, type FrameLabelLayout } from '../../render/generic'
import { EMPTY_LIFELINE_INFO, sequenceInfo } from './analysis'
import { lifelineEditText, lifelineHeaderText, lifelineType } from './strings'

const HEADER_H = SPACING.lifelineHeaderHeight
const ACT_W = SPACING.activationWidth
const ACT_SHIFT = SPACING.activationNestingShift
/** Half size of the destruction X. */
export const DESTRUCTION_HALF = 10
/** Hit tolerance around a lifeline's dashed line. */
const LINE_HIT = 10

// =============================================================================================
// Lifeline

export interface ActivationLayout {
  readonly messageId: string
  readonly rect: Rect
  readonly level: number
}

export interface LifelineData {
  /** Header box (box form) or icon + name area (actor form). */
  readonly header: Rect
  readonly form: 'box' | 'actor'
  /** Actor icon area (actor form). */
  readonly icon: Rect | null
  readonly nameLines: readonly TextLine[]
  readonly multiInstance: boolean
  /** The type is an active class: two inner vertical bars. */
  readonly active: boolean
  readonly lineX: number
  readonly lineTop: number
  readonly lineBottom: number
  readonly activations: readonly ActivationLayout[]
  /** y of the destruction X (the line ends there), null when not destroyed. */
  readonly destroyedAt: number | null
}

function lifelineModel(view: View): Elem | null {
  return isKindOf(view.model, 'UMLLifeline') ? view.model : null
}

/** Free line length kept below the lowest message so a lower message can be added without lengthening. */
export const LIFELINE_SLACK = 40

/** Bottom of the diagram's frame view (null when the diagram has none). */
export function lifelineFrameBottom(ctx: LayoutContext): number | null {
  const frame = (ctx.diagram.ownedViews ?? []).find((v) => isKindOf(v, 'UMLFrameView') && v.visible !== false) as NodeView | undefined
  return frame && typeof frame.top === 'number' && typeof frame.height === 'number' ? frame.top + frame.height : null
}

/** Lifeline layout: header at its stored y (or centered on its create message), line down to below the lowest message. */
export function layoutLifeline(view: NodeView, ctx: LayoutContext): NodeLayout<LifelineData> {
  const model = lifelineModel(view)
  const style = styleOf(view)
  const info = sequenceInfo(ctx)
  const ll = info.lifelines.get(view._id) ?? EMPTY_LIFELINE_INFO
  const type = lifelineType(model)
  const actor = isKindOf(type as Elem, 'UMLActor')
  const name = measureNameCompartment(
    { stereotype: stereotypeName(model), name: lifelineHeaderText(model), font: style.font },
    ctx.measurer
  )
  const textWidth = name.width - 2 * SPACING.compartmentPaddingLeft
  const headerH = actor ? HEADER_H + name.height : Math.max(HEADER_H, name.height)
  const minWidth = Math.max(MIN_SIZES.lifelineHeader.width, Math.ceil(textWidth) + 20)

  const top = ll.createdAt !== null ? Math.round(ll.createdAt - headerH / 2) : (view.top ?? SPACING.lifelineTop)
  const lineTop = top + headerH
  const destroyedAt = ll.destroyedAt !== null ? Math.max(ll.destroyedAt, lineTop) : null
  let minHeight: number
  let height: number | undefined
  if (destroyedAt !== null) {
    // Cut at the destruction X (deliberate deviation, spec 03 §4.4 [R]).
    minHeight = destroyedAt + DESTRUCTION_HALF - top
    height = minHeight
  } else {
    const lowest = info.lowestY
    // Reaches the diagram frame's bottom, and always leaves room below the lowest message to attach another.
    const frameBottom = lifelineFrameBottom(ctx)
    const reach = Math.max(
      lowest === null ? 0 : lowest + SPACING.lifelineBottomMargin + LIFELINE_SLACK,
      frameBottom === null ? 0 : frameBottom - SPACING.lifelineBottomMargin
    )
    const line = Math.max(LIFELINE_MIN_LINE_LENGTH, reach - lineTop)
    minHeight = headerH + line
  }
  const effective = { ...view, top, ...(height !== undefined ? { height } : {}) } as NodeView
  const base = nodeLayout<LifelineData>(effective, {
    minWidth,
    minHeight,
    style,
    data: (box) => {
      const header = { left: box.left, top: box.top, width: box.width, height: headerH }
      const lineX = Math.round(box.left + box.width / 2)
      const lineBottom = destroyedAt ?? box.top + box.height
      let icon: Rect | null = null
      let nameRect: Rect
      if (actor) {
        const w = Math.round((HEADER_H * MIN_SIZES.actor.width) / MIN_SIZES.actor.height)
        icon = { left: lineX - w / 2, top: box.top, width: w, height: HEADER_H }
        nameRect = { left: box.left, top: box.top + HEADER_H, width: box.width, height: name.height }
      } else {
        // Center the text itself (the compartment has 5 (+ 2 before the name) above the first line and 5 below).
        const pad = SPACING.compartmentPaddingTop + ((name.items[0]?.index ?? 1) > 0 ? SPACING.compartmentItemGap : 0)
        const textH = name.height - pad - SPACING.compartmentPaddingBottom
        nameRect = { left: box.left, top: box.top + (headerH - textH) / 2 - pad, width: box.width, height: name.height }
      }
      return {
        header,
        form: actor ? 'actor' : 'box',
        icon,
        nameLines: arrangeNameCompartment(name, nameRect),
        multiInstance: model?.['isMultiInstance'] === true,
        active: !actor && (type as Elem | null)?.['isActive'] === true,
        lineX,
        lineTop,
        lineBottom,
        activations: ll.activations.map((a) => ({
          messageId: a.messageId,
          level: a.level,
          rect: { left: lineX - ACT_W / 2 + a.level * ACT_SHIFT, top: a.top, width: ACT_W, height: a.bottom - a.top }
        })),
        destroyedAt
      }
    },
    regions: (box) =>
      model
        ? [
            {
              box: actor ? { left: box.left, top: box.top + HEADER_H, width: box.width, height: name.height } : { left: box.left, top: box.top, width: box.width, height: headerH },
              target: { kind: 'custom', elementId: model._id, syntax: 'lifeline' },
              text: lifelineEditText(model),
              font: style.font
            }
          ]
        : []
  })
  const d = base.data
  const maxLevel = Math.max(0, ...d.activations.map((a) => a.level))
  const lineEnd = d.destroyedAt !== null ? d.destroyedAt + DESTRUCTION_HALF : d.lineBottom
  const strip: Rect = {
    left: d.lineX - LINE_HIT,
    top: d.lineTop,
    width: LINE_HIT + Math.max(LINE_HIT, ACT_W / 2 + maxLevel * ACT_SHIFT + 3),
    height: Math.max(0, lineEnd - d.lineTop)
  }
  const linePart = (view as UMLSeqLifelineView).linePart
  return {
    ...base,
    moveAxis: 'horz',
    hitAreas: [d.header, strip],
    ...(linePart
      ? { subEndpoints: { [linePart._id]: { box: { left: d.lineX, top: d.lineTop, width: 1, height: Math.max(1, d.lineBottom - d.lineTop) }, outline: 'rect' as const } } }
      : {}),
    ...(d.multiInstance && d.form === 'box' ? { extraBounds: [{ ...d.header, left: d.header.left + 5, top: d.header.top + 5 }] } : {})
  }
}

// =============================================================================================
// Combined fragment

export interface OperandLayout {
  readonly viewId: string
  readonly elementId: string | null
  readonly rect: Rect
  readonly guard: TextLine | null
  /** Dashed separator along the top edge (all operands but the first). */
  readonly separator: boolean
}

export interface FragmentData {
  readonly label: FrameLabelLayout
  readonly operands: readonly OperandLayout[]
}

const OPERAND_MIN_H = MIN_SIZES.interactionOperand.height

/** Visible operand views of a combined fragment view, in order. */
export function operandViews(view: View): NodeView[] {
  const compartment = view['operandCompartment'] as View | null | undefined
  return (compartment?.subViews ?? []).filter(
    (v): v is NodeView => isKindOf(v, 'UMLInteractionOperandView') && v.visible !== false
  )
}

/** Combined fragment: frame with the operator in the pentagon, operands stacked below the label band. */
export function layoutCombinedFragment(view: NodeView, ctx: LayoutContext): NodeLayout<FragmentData> {
  const model = view.model
  const style = styleOf(view)
  const operator = typeof model?.['interactionOperator'] === 'string' && model['interactionOperator'] ? (model['interactionOperator'] as string) : 'seq'
  const name = nameOf(model)
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, operator, name, style.font, ctx.measurer)
  const band = probe.bandHeight
  const operands = operandViews(view).map((v) => {
    const guard = typeof v.model?.['guard'] === 'string' ? (v.model['guard'] as string) : ''
    const text = guard ? `[${guard}]` : ''
    const size = ctx.measurer.measure(text, style.font)
    const min = guard ? OPERAND_MIN_H + size.height : OPERAND_MIN_H
    return { view: v, text, size, min, stored: Math.max(min, v.height ?? 0) }
  })
  const fixed = operands.slice(0, -1).reduce((h, o) => h + o.stored, 0)
  const lastMin = operands.length > 0 ? (operands[operands.length - 1]?.min ?? OPERAND_MIN_H) : OPERAND_MIN_H
  const minWidth = Math.max(MIN_SIZES.frame.width, probe.minWidth, ...operands.map((o) => Math.ceil(o.size.width) + 40))
  const minHeight = band + fixed + lastMin

  const arrange = (box: Rect): FragmentData => {
    let y = box.top + band
    const bottom = box.top + box.height
    const laid = operands.map((o, i): OperandLayout => {
      const last = i === operands.length - 1
      const h = last ? bottom - y : o.stored
      const rect = { left: box.left, top: y, width: box.width, height: h }
      y += h
      const guard: TextLine | null = o.text
        ? {
            text: o.text,
            font: style.font,
            align: 'left',
            box: { left: rect.left + SPACING.guardOffsetX, top: rect.top + SPACING.guardOffsetY - o.size.height / 2, width: Math.ceil(o.size.width), height: o.size.height }
          }
        : null
      return { viewId: o.view._id, elementId: o.view.model?._id ?? null, rect, guard, separator: i > 0 }
    })
    return { label: layoutFrameLabel(box, operator, name, style.font, ctx.measurer), operands: laid }
  }

  /** The operand's guard text box, or the placeholder where an empty guard is edited. */
  const guardBox = (o: OperandLayout): Rect =>
    o.guard?.box ?? { left: o.rect.left + SPACING.guardOffsetX, top: o.rect.top + SPACING.guardOffsetY - style.font.size / 2, width: 80, height: style.font.size }

  const base = nodeLayout<FragmentData>(view, {
    minWidth,
    minHeight,
    zIndex: Z_INDEX.combinedFragment,
    style,
    data: arrange,
    regions: (box) => {
      const data = arrange(box)
      const labelRight = Math.max(...data.label.polygon.map((p) => p.x))
      const regions: EditRegion[] = model
        ? [{ box: { left: box.left, top: box.top, width: labelRight - box.left, height: data.label.bandHeight }, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: style.font }]
        : []
      for (const o of data.operands) {
        if (!o.elementId) continue
        const guardModel = operands.find((x) => x.view._id === o.viewId)?.view.model
        regions.push({
          box: guardBox(o),
          target: { kind: 'custom', elementId: o.elementId, syntax: 'guard' },
          text: typeof guardModel?.['guard'] === 'string' ? (guardModel['guard'] as string) : '',
          font: style.font
        })
      }
      return regions
    }
  })
  const box = base.box
  const data = base.data
  const dividers: NodeDivider[] = []
  data.operands.forEach((o, i) => {
    if (i === data.operands.length - 1) return
    const op = operands[i]
    if (!op) return
    const below = operands.slice(i + 1, -1).reduce((h, x) => h + x.stored, 0)
    dividers.push({
      viewId: o.viewId,
      top: o.rect.top,
      y: o.rect.top + o.rect.height,
      left: box.left,
      width: box.width,
      minY: o.rect.top + op.min,
      maxY: box.top + box.height - below - lastMin
    })
  })
  const hitAreas = [
    ...frameHitAreas(box, data.label),
    // Guards, or where an empty guard goes, so it can be double-clicked to add one.
    ...data.operands.filter((o) => o.elementId).map(guardBox),
    ...dividers.map((d) => ({ left: d.left, top: d.y - 4, width: d.width, height: 8 }))
  ]
  return { ...base, hitAreas, dividers }
}

// =============================================================================================
// Lost/found endpoints and gates

export interface EndpointData {
  readonly kind: 'endpoint' | 'gate'
}

/** 15 × 15 endpoint (filled circle) or gate (small square), vertically centered on its message. */
export function layoutMessageEndpoint(view: NodeView, ctx: LayoutContext): NodeLayout<EndpointData> {
  const size = MIN_SIZES.messageEndpoint
  const y = sequenceInfo(ctx).endpointY.get(view._id)
  const effective = { ...view, width: size.width, height: size.height, ...(y !== undefined ? { top: Math.round(y - size.height / 2) } : {}) } as NodeView
  const layout = nodeLayout<EndpointData>(effective, {
    minWidth: size.width,
    minHeight: size.height,
    sizable: 'none',
    outline: isKindOf(view, 'UMLGateView') ? 'rect' : 'ellipse',
    data: { kind: isKindOf(view, 'UMLGateView') ? 'gate' : 'endpoint' }
  })
  return y !== undefined ? { ...layout, moveAxis: 'horz' } : layout
}

// =============================================================================================
// Interaction use, continuation, state invariant (beyond the MVP toolbox, drawn for opened files)

export interface InteractionUseData {
  readonly label: FrameLabelLayout
  readonly nameLine: TextLine
}

/** `ref` frame with the referred interaction's name centered. */
export function layoutInteractionUse(view: NodeView, ctx: LayoutContext): NodeLayout<InteractionUseData> {
  const style = styleOf(view)
  const model = view.model
  const refersTo = model?.['refersTo'] as Elem | null | undefined
  const text = nameOf(refersTo) || nameOf(model)
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, 'ref', '', style.font, ctx.measurer)
  const size = ctx.measurer.measure(text, style.font)
  return nodeLayout(view, {
    minWidth: Math.max(MIN_SIZES.frame.width, probe.minWidth, Math.ceil(size.width) + 20),
    minHeight: probe.bandHeight + size.height + 10,
    zIndex: Z_INDEX.message,
    style,
    data: (box) => {
      const label = layoutFrameLabel(box, 'ref', '', style.font, ctx.measurer)
      const body = { left: box.left, top: box.top + label.bandHeight, width: box.width, height: box.height - label.bandHeight }
      return { label, nameLine: { text, font: style.font, align: 'center', box: { left: body.left, top: body.top + (body.height - size.height) / 2, width: body.width, height: size.height } } }
    },
    regions: (box) => (model ? [{ box, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: style.font }] : [])
  })
}

export interface RoundedBoxData {
  readonly line: TextLine
  readonly radius: number
}

/** Continuation (`name` in a rounded box) and state invariant (`{invariant}` in a rounded box). */
export function layoutRoundedLabelBox(view: NodeView, ctx: LayoutContext): NodeLayout<RoundedBoxData> {
  const style = styleOf(view)
  const model = view.model
  const invariant = model?.['invariant']
  const text = isKindOf(view, 'UMLStateInvariantView')
    ? `{${typeof invariant === 'string' ? invariant : nameOf(invariant as Elem | null) || nameOf(model)}}`
    : nameOf(model)
  const size = ctx.measurer.measure(text, style.font)
  return nodeLayout(view, {
    minWidth: Math.max(40, Math.ceil(size.width) + 20),
    minHeight: Math.max(20, size.height + 10),
    zIndex: Z_INDEX.message,
    style,
    data: (box) => ({
      radius: Math.min(box.height / 2, 15),
      line: { text, font: style.font, align: 'center', box: { left: box.left, top: box.top + (box.height - size.height) / 2, width: box.width, height: size.height } }
    }),
    regions: (box) => {
      if (!model) return []
      if (isKindOf(view, 'UMLStateInvariantView')) {
        const raw = typeof invariant === 'string' ? invariant : ''
        return [{ box, target: { kind: 'field', elementId: model._id, field: 'invariant' }, text: raw, font: style.font }]
      }
      return [{ box, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: style.font }]
    }
  })
}

// =============================================================================================
// Sub-view types drawn by their hosts; these layouts only apply if one is found at the top level.

export type OrphanKind = 'line' | 'activation' | 'operand'

export function layoutOrphanSubView(kind: OrphanKind) {
  return (view: NodeView): NodeLayout<{ readonly kind: OrphanKind }> =>
    nodeLayout(view, {
      minWidth: kind === 'activation' ? ACT_W : 1,
      minHeight: kind === 'activation' ? MIN_SIZES.activation.height : 1,
      data: { kind }
    })
}
