/**
 * Measure/arrange of timing diagram nodes (spec 27 §5): the timing frame, lifeline bands, state
 * rows, time segments, ticks and time/duration constraints. Positions of the structural views are
 * derived from the frame-level arrangement (`arrange.ts`).
 */
import { isKindOf, type Elem, type NodeView } from '../../../model'
import { placeNodeLabel, type Rect } from '../../core'
import { nameEditText, nameFontOf, nameOf, nodeLayout, styleOf } from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { frameHitAreas, layoutFrameLabel, type FrameLabelLayout } from '../../render/generic'
import { lifelineEditText } from '../sequence/strings'
import { arrangeTiming, TIMING } from './arrange'

// ---------------------------------------------------------------------------------------------
// Frame

export interface TimingFrameData {
  readonly label: FrameLabelLayout
}

/** Timing frame: the `sd` pentagon label, sized to hold its lifeline bands, segments and ticks. */
export function layoutTimingFrame(view: NodeView, ctx: LayoutContext): NodeLayout<TimingFrameData> {
  const arr = arrangeTiming(ctx)
  const style = styleOf(view)
  const diagram = isKindOf(view.model, 'Diagram') ? view.model : ctx.diagram
  const owner = diagram._parent
  const name = nameOf(owner)
  const own = arr.frameId === view._id
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, 'sd', name, style.font, ctx.measurer)
  const layout = nodeLayout(view, {
    minWidth: own ? arr.frameMinWidth : probe.minWidth,
    minHeight: own ? arr.frameMinHeight : Math.max(30, probe.bandHeight + 30),
    zIndex: -1,
    style,
    data: (box) => ({ label: layoutFrameLabel(box, 'sd', name, style.font, ctx.measurer) }),
    regions: (box) =>
      owner
        ? [{ box: layoutFrameLabel(box, 'sd', name, style.font, ctx.measurer).name?.box ?? box, target: { kind: 'name', elementId: owner._id }, text: nameEditText(owner), font: style.font }]
        : []
  })
  return { ...layout, hitAreas: frameHitAreas(layout.box, layout.data.label) }
}

// ---------------------------------------------------------------------------------------------
// Lifeline band

export interface TimingLifelineData {
  readonly box: Rect
  /** The name, drawn rotated −90° about the center of `name.box`. */
  readonly name: TextLine
  readonly nameBox: Rect
}

function stored(view: NodeView): Rect {
  return { left: view.left ?? 0, top: view.top ?? 0, width: view.width ?? 0, height: view.height ?? 0 }
}

/** Lifeline band: full frame width, its name rotated at the left, state rows stacked inside. */
export function layoutTimingLifeline(view: NodeView, ctx: LayoutContext): NodeLayout<TimingLifelineData> {
  const info = arrangeTiming(ctx).bands.get(view._id)
  const style = styleOf(view)
  const nameFont = nameFontOf(style)
  const model = view.model
  const box = info?.box ?? stored(view)
  const placed = { ...view, ...box, autoResize: false } as NodeView
  const nameBox = info?.nameBox ?? { left: box.left + TIMING.nameOffset, top: box.top, width: style.font.size, height: 0 }
  const text = info?.nameText ?? nameOf(model)
  const cx = nameBox.left + nameBox.width / 2
  const cy = nameBox.top + nameBox.height / 2
  const name: TextLine = { text, font: nameFont, align: 'center', box: { left: cx - nameBox.height / 2, top: cy - nameBox.width / 2, width: nameBox.height, height: nameBox.width } }
  const layout = nodeLayout<TimingLifelineData>(placed, {
    minWidth: info?.minWidth ?? 30,
    minHeight: info?.minHeight ?? 50,
    sizable: 'none',
    style,
    data: { box, name, nameBox },
    regions: model && isKindOf(model, 'UMLLifeline') ? [{ box: nameBox, target: { kind: 'custom', elementId: model._id, syntax: 'lifeline' }, text: lifelineEditText(model), font: nameFont }] : []
  })
  return { ...layout, moveAxis: 'vert', derivedPosition: true, zIndex: 0 }
}

// ---------------------------------------------------------------------------------------------
// State / condition row

export interface TimingStateData {
  readonly label: TextLine
}

/** State/condition row: a right-aligned label ending 5 left of the common segment start. */
export function layoutTimingState(view: NodeView, ctx: LayoutContext): NodeLayout<TimingStateData> {
  const info = arrangeTiming(ctx).rows.get(view._id)
  const style = styleOf(view)
  const model = view.model
  const box = info?.box ?? stored(view)
  const placed = { ...view, ...box, autoResize: false } as NodeView
  const labelBox = info?.labelBox ?? box
  const label: TextLine = { text: info?.labelText ?? nameOf(model), font: style.font, align: 'right', box: { left: labelBox.left, top: labelBox.top, width: labelBox.width, height: labelBox.height } }
  const regions: EditRegion[] = model ? [{ box: { ...labelBox, width: Math.max(labelBox.width, 30), left: labelBox.left + labelBox.width - Math.max(labelBox.width, 30) }, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: style.font }] : []
  const layout = nodeLayout<TimingStateData>(placed, {
    minWidth: 10,
    minHeight: TIMING.rowHeight,
    sizable: 'none',
    style,
    data: { label },
    regions
  })
  return { ...layout, moveAxis: 'vert', derivedPosition: true, zIndex: 1 }
}

// ---------------------------------------------------------------------------------------------
// Time segment

export interface TimeSegmentData {
  /** y of the horizontal line. */
  readonly centerY: number
  /** Vertical state-change step at the left edge from the predecessor's row. */
  readonly step: { readonly x: number; readonly fromY: number; readonly toY: number } | null
}

/** Time segment: a 25 tall run on its row, laid out contiguously after the previous segment. */
export function layoutTimeSegment(view: NodeView, ctx: LayoutContext): NodeLayout<TimeSegmentData> {
  const info = arrangeTiming(ctx).segments.get(view._id)
  const style = styleOf(view)
  const box = info?.box ?? { ...stored(view), height: TIMING.segmentHeight }
  const placed = { ...view, ...box, autoResize: false } as NodeView
  const layout = nodeLayout<TimeSegmentData>(placed, {
    minWidth: TIMING.segmentMinWidth,
    minHeight: TIMING.segmentHeight,
    sizable: 'horz',
    style,
    data: { centerY: info?.centerY ?? box.top + 12, step: info?.step ?? null }
  })
  return { ...layout, derivedPosition: info !== undefined, zIndex: 2 }
}

// ---------------------------------------------------------------------------------------------
// Time tick

export interface TimeTickData {
  readonly text: TextLine
}

/** Time tick: a 1px vertical line at its left edge with its text centered 10 below. */
export function layoutTimeTick(view: NodeView, ctx: LayoutContext): NodeLayout<TimeTickData> {
  const arr = arrangeTiming(ctx)
  const info = arr.ticks.get(view._id)
  const style = styleOf(view)
  const text = typeof view['text'] === 'string' ? (view['text'] as string) : ''
  const box = info ?? { ...stored(view), height: TIMING.tickHeight }
  const placed = { ...view, ...box, autoResize: false } as NodeView
  const size = ctx.measurer.measure(text || '0', style.font)
  const textWidth = Math.max(Math.ceil(size.width), 20)
  const line: TextLine = {
    text,
    font: style.font,
    align: 'center',
    box: { left: box.left - textWidth / 2, top: box.top + box.height + 10 - size.height / 2, width: textWidth, height: size.height }
  }
  const layout = nodeLayout<TimeTickData>(placed, {
    minWidth: TIMING.tickMin,
    minHeight: TIMING.tickHeight,
    sizable: 'horz',
    style,
    extraBounds: [line.box],
    data: { text: line },
    // The text is a view field: edited as the tick view's text.
    regions: [{ box: line.box, target: { kind: 'text', viewId: view._id }, text, font: style.font }]
  })
  return { ...layout, moveAxis: 'horz', derivedPosition: info !== undefined, zIndex: 1 }
}

// ---------------------------------------------------------------------------------------------
// Constraints

/** `{min..max}` of an interval constraint with `min` / `max` placeholders for empty bounds. */
export function intervalText(model: Elem | null | undefined): string {
  const min = typeof model?.['min'] === 'string' && model['min'] !== '' ? (model['min'] as string) : 'min'
  const max = typeof model?.['max'] === 'string' && model['max'] !== '' ? (model['max'] as string) : 'max'
  return `{${min}..${max}}`
}

/** Editable `min..max` text of an interval constraint. */
function intervalEditText(model: Elem | null | undefined): string {
  const min = typeof model?.['min'] === 'string' ? (model['min'] as string) : ''
  const max = typeof model?.['max'] === 'string' ? (model['max'] as string) : ''
  return min === '' && max === '' ? '' : `${min}..${max}`
}

/** Parses `min..max` (either bound may be empty; a single value is the minimum). */
export function parseInterval(text: string): { min: string; max: string } | null {
  const t = text.trim().replace(/^\{/, '').replace(/\}$/, '')
  const i = t.indexOf('..')
  if (i < 0) return { min: t.trim(), max: '' }
  return { min: t.slice(0, i).trim(), max: t.slice(i + 2).trim() }
}

export interface DurationConstraintData {
  readonly horizontal: boolean
  readonly label: TextLine
}

/**
 * Duration constraint: a double-headed arrow with end bars, horizontal in timing diagrams
 * (min 16 × 14, horizontal resize) and vertical in others (min 14 × 16). The `{min..max}` label
 * sits at α = 3π/4, d = 20.
 */
export function layoutDurationConstraint(view: NodeView, ctx: LayoutContext): NodeLayout<DurationConstraintData> {
  const style = styleOf(view)
  const horizontal = ctx.diagram._type === 'UMLTimingDiagram'
  const model = view.model
  const text = intervalText(model)
  const size = ctx.measurer.measure(text, style.font)
  const labelView = view['nameLabel'] as { alpha?: unknown; distance?: unknown } | null | undefined
  const alpha = typeof labelView?.alpha === 'number' && Number.isFinite(labelView.alpha) ? labelView.alpha : (3 * Math.PI) / 4
  const distance = typeof labelView?.distance === 'number' && Number.isFinite(labelView.distance) ? labelView.distance : 20
  const min = horizontal ? { width: 16, height: 14 } : { width: 14, height: 16 }
  const labelOf = (box: Rect): TextLine => ({
    text,
    font: style.font,
    align: 'center',
    box: placeNodeLabel(box, { alpha, distance }, { width: Math.ceil(size.width), height: size.height })
  })
  return nodeLayout(view, {
    minWidth: min.width,
    minHeight: min.height,
    sizable: horizontal ? 'horz' : 'vert',
    style,
    data: (box) => ({ horizontal, label: labelOf(box) }),
    regions: (box) => (model ? [{ box: labelOf(box).box, target: { kind: 'custom', elementId: model._id, syntax: 'interval' }, text: intervalEditText(model), font: style.font }] : [])
  })
}

export interface TimeConstraintData {
  readonly line: TextLine
}

/** Time constraint: the `{min..max}` label, linked to its host message or segment. */
export function layoutTimeConstraint(view: NodeView, ctx: LayoutContext): NodeLayout<TimeConstraintData> {
  const style = styleOf(view)
  const model = view.model
  const text = intervalText(model)
  const size = ctx.measurer.measure(text, style.font)
  return nodeLayout(view, {
    minWidth: Math.ceil(size.width) + 6,
    minHeight: Math.ceil(size.height) + 2,
    sizable: 'none',
    style,
    data: (box) => ({ line: { text, font: style.font, align: 'center', box: { left: box.left, top: box.top + (box.height - size.height) / 2, width: box.width, height: size.height } } }),
    regions: (box) => (model ? [{ box, target: { kind: 'custom', elementId: model._id, syntax: 'interval' }, text: intervalEditText(model), font: style.font }] : [])
  })
}
