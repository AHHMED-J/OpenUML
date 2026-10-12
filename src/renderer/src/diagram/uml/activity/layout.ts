/**
 * Measure/arrange of activity-diagram nodes (spec 03 §4.5): actions (opaque, call behavior,
 * send signal, accept event, time event), object nodes, control nodes (initial, activity final,
 * flow final, decision/merge, fork/join), pins and partitions (swimlanes).
 * Pure: reads the model, returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type View } from '../../../model'
import {
  MIN_SIZES,
  NODE_LABEL_DEFAULTS,
  SPACING,
  placeNodeLabel,
  type Font,
  type Point,
  type Rect,
  type Size
} from '../../core'
import {
  arrangeNameCompartment,
  measureNameCompartment,
  nameEditText,
  nameFontOf,
  nameOf,
  nodeLayout,
  stereotypeName,
  styleOf,
  type NameCompartmentMeasure
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { nodeNotationFor } from '../../render/registry'

const PAD = SPACING.compartmentPaddingLeft

// ---------------------------------------------------------------------------------------------
// Shared helpers

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Name of a `var` field value: a plain string or a referenced element's name. */
export function varName(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return nameOf(value as Elem)
  return ''
}

function showsStereotype(view: View): boolean {
  return view['stereotypeDisplay'] !== 'none'
}

function nameRegion(model: Elem | null, box: Rect, font: Font): EditRegion[] {
  return model ? [{ box, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font }] : []
}

/** Edit region of `name: Type[mult]` (pins, object nodes); the text always carries the multiplicity so it is kept. */
function typedNameRegion(model: Elem | null, box: Rect, font: Font): EditRegion[] {
  if (!model) return []
  const text = nameEditText(model) + typedNameText(model, true).slice(nameOf(model).length)
  return [{ box, target: { kind: 'typedName', elementId: model._id }, text, font }]
}

/** Rect of height `h` vertically centered in `box`. */
function centeredBand(box: Rect, h: number): Rect {
  return { left: box.left, top: box.top + (box.height - h) / 2, width: box.width, height: h }
}

// ---------------------------------------------------------------------------------------------
// Action

/** Visual form of an action, from its `kind`. */
export type ActionShape = 'opaque' | 'sendSignal' | 'acceptEvent' | 'timeEvent'

export interface ActionData {
  readonly shape: ActionShape
  /** Outline polygon for send signal / accept event; empty for the rounded rectangle and time event. */
  readonly polygon: readonly Point[]
  /** Time event hourglass box (the icon above the name). */
  readonly icon: Rect | null
  /** Call-behavior "rake" glyph strokes (each a polyline). */
  readonly rake: ReadonlyArray<readonly Point[]>
  readonly nameLines: readonly TextLine[]
  readonly cornerRadius: number
}

export function actionShapeOf(model: Elem | null | undefined): ActionShape {
  const kind = model?.['kind']
  if (kind === 'sendSignal') return 'sendSignal'
  if (kind === 'acceptSignal' || kind === 'acceptEvent') return 'acceptEvent'
  if (kind === 'timeEvent') return 'timeEvent'
  return 'opaque'
}

/** Time event hourglass minimum size. */
export const TIME_EVENT_ICON = { width: 20, height: 26 } as const

/** Pentagon pointing right: the point at `right`, the shoulders at `right − h/4`. */
export function sendSignalPolygon(b: Rect): Point[] {
  const right = b.left + b.width
  const bottom = b.top + b.height
  const shoulder = right - b.height / 4
  return [
    { x: b.left, y: b.top },
    { x: shoulder, y: b.top },
    { x: right, y: b.top + b.height / 2 },
    { x: shoulder, y: bottom },
    { x: b.left, y: bottom }
  ]
}

/** Rectangle with a notch on the left edge whose deepest point is `(left + h/4, top + h/2)`. */
export function acceptEventPolygon(b: Rect): Point[] {
  const right = b.left + b.width
  const bottom = b.top + b.height
  return [
    { x: b.left, y: b.top },
    { x: right, y: b.top },
    { x: right, y: bottom },
    { x: b.left, y: bottom },
    { x: b.left + b.height / 4, y: b.top + b.height / 2 }
  ]
}

/** Call-behavior rake glyph in the top-right corner. */
export function rakeGlyph(b: Rect): Point[][] {
  const r = b.left + b.width
  const t = b.top
  return [
    [
      { x: r - 10, y: t + 5 },
      { x: r - 10, y: t + 20 }
    ],
    [
      { x: r - 15, y: t + 20 },
      { x: r - 15, y: t + 13 },
      { x: r - 5, y: t + 13 },
      { x: r - 5, y: t + 20 }
    ]
  ]
}

function hasRake(model: Elem | null | undefined): boolean {
  return model?.['kind'] === 'callBehavior' || isKindOf(model?.['subactivity'] as Elem | null | undefined, 'UMLActivity')
}

function actionNameMeasure(view: NodeView, model: Elem | null, font: Font, ctx: LayoutContext): NameCompartmentMeasure {
  return measureNameCompartment({ stereotype: showsStereotype(view) ? stereotypeName(model) : '', name: nameOf(model), font }, ctx.measurer)
}

/** Time event hourglass box for a box and name height: centered at the top, 2 : 3 aspect at most. */
function timeEventIcon(box: Rect, nameHeight: number): Rect {
  const height = Math.max(TIME_EVENT_ICON.height, box.height - nameHeight)
  const width = Math.max(TIME_EVENT_ICON.width, Math.min(box.width, Math.round((height * 2) / 3)))
  return { left: box.left + (box.width - width) / 2, top: box.top, width, height }
}

/**
 * Action layout. The name compartment is centered vertically ([R] spec 03 §4.5); send signal
 * reserves the pointed end (h/4) on the right and accept event the notch (h/4) on the left; a
 * call-behavior action reserves room for its rake glyph. Time events are an hourglass with the
 * name below it (no box).
 */
export function layoutAction(view: NodeView, ctx: LayoutContext): NodeLayout<ActionData> {
  const model = view.model
  const style = styleOf(view)
  const shape = actionShapeOf(model)
  const name = actionNameMeasure(view, model, style.font, ctx)
  const nameFont = nameFontOf(style)

  if (shape === 'timeEvent') {
    return nodeLayout(view, {
      minWidth: Math.max(TIME_EVENT_ICON.width, name.width),
      minHeight: TIME_EVENT_ICON.height + name.height,
      style,
      endpoint: (box) => ({ box: timeEventIcon(box, name.height), outline: 'rect' }),
      data: (box) => {
        const icon = timeEventIcon(box, name.height)
        const nameRect = { left: box.left, top: icon.top + icon.height, width: box.width, height: name.height }
        return { shape, polygon: [], icon, rake: [], nameLines: arrangeNameCompartment(name, nameRect), cornerRadius: 0 }
      },
      regions: (box) => {
        const icon = timeEventIcon(box, name.height)
        return nameRegion(model ?? null, { left: box.left, top: icon.top + icon.height, width: box.width, height: name.height }, nameFont)
      }
    })
  }

  const rake = hasRake(model)
  const minHeight = Math.max(MIN_SIZES.action.height, name.height)
  // Horizontal room taken by the pointed end / notch (h/4 of the effective height, which is at
  // least the minimum height) and by the rake glyph.
  const extra = (box: Rect): { left: number; right: number } => ({
    left: shape === 'acceptEvent' ? Math.ceil(box.height / 4) : 0,
    right: (shape === 'sendSignal' ? Math.ceil(box.height / 4) : 0) + (rake ? 20 : 0)
  })
  const effectiveHeight = view.autoResize ? minHeight : Math.max(minHeight, view.height ?? 0)
  const minExtra = extra({ left: 0, top: 0, width: 0, height: effectiveHeight })
  const nameRectOf = (box: Rect): Rect => {
    const e = extra(box)
    return centeredBand({ ...box, left: box.left + e.left, width: Math.max(0, box.width - e.left - e.right) }, name.height)
  }
  return nodeLayout(view, {
    minWidth: Math.max(MIN_SIZES.action.width, name.width + minExtra.left + minExtra.right),
    minHeight,
    style,
    data: (box) => ({
      shape,
      polygon: shape === 'sendSignal' ? sendSignalPolygon(box) : shape === 'acceptEvent' ? acceptEventPolygon(box) : [],
      icon: null,
      rake: rake ? rakeGlyph(box) : [],
      nameLines: arrangeNameCompartment(name, nameRectOf(box)),
      cornerRadius: shape === 'opaque' ? SPACING.actionCornerRadius : 0
    }),
    regions: (box) => nameRegion(model ?? null, nameRectOf(box), nameFont)
  })
}

// ---------------------------------------------------------------------------------------------
// Object node

export interface ObjectNodeData {
  readonly lines: readonly TextLine[]
}

/** `name: Type` of an object node (or pin), `[mult]` appended when given. */
export function typedNameText(model: Elem | null | undefined, withMultiplicity = false): string {
  const name = nameOf(model)
  const type = varName(model?.['type'])
  const mult = withMultiplicity ? str(model?.['multiplicity']) : ''
  return `${name}${type ? `: ${type}` : ''}${mult ? `[${mult}]` : ''}`
}

/** `[state1, state2]` of an object node's `inStates`, '' when none. */
export function inStatesText(model: Elem | null | undefined): string {
  const states = model?.['inStates']
  if (!Array.isArray(states) || states.length === 0) return ''
  return `[${(states as unknown[]).map(varName).filter((s) => s !== '').join(', ')}]`
}

/** Object node: plain rectangle with `«st»`, bold `name: Type` and `[states]` centered vertically. */
export function layoutObjectNode(view: NodeView, ctx: LayoutContext): NodeLayout<ObjectNodeData> {
  const model = view.model
  const style = styleOf(view)
  const name = measureNameCompartment(
    { stereotype: showsStereotype(view) ? stereotypeName(model) : '', name: typedNameText(model), font: style.font },
    ctx.measurer
  )
  const states = inStatesText(model)
  const statesSize: Size = states ? ctx.measurer.measure(states, style.font) : { width: 0, height: 0 }
  const statesHeight = states ? statesSize.height + SPACING.compartmentItemGap : 0
  const height = name.height + statesHeight
  const arrange = (box: Rect): { lines: TextLine[]; nameRect: Rect } => {
    const band = centeredBand(box, height)
    const nameRect = { ...band, height: name.height }
    const lines = arrangeNameCompartment(name, nameRect)
    if (states) {
      const top = band.top + name.height - PAD + SPACING.compartmentItemGap
      lines.push({ text: states, font: style.font, align: 'center', box: { left: box.left + PAD, top, width: Math.max(0, box.width - PAD * 2), height: statesSize.height } })
    }
    return { lines, nameRect }
  }
  return nodeLayout(view, {
    minWidth: Math.max(name.width, Math.ceil(statesSize.width) + PAD * 2, 40),
    minHeight: Math.max(height, 30),
    style,
    data: (box) => ({ lines: arrange(box).lines }),
    regions: (box) => typedNameRegion(model ?? null, arrange(box).nameRect, nameFontOf(style))
  })
}

// ---------------------------------------------------------------------------------------------
// Control nodes

export type ControlNodeShape = 'initial' | 'activityFinal' | 'flowFinal' | 'decision' | 'fork'

export interface ControlNodeData {
  readonly shape: ControlNodeShape
  /** Fork/join orientation (horizontal when width ≥ height). */
  readonly horizontal: boolean
}

export function controlShapeOf(model: Elem | null | undefined): ControlNodeShape {
  if (isKindOf(model, 'UMLActivityFinalNode')) return 'activityFinal'
  if (isKindOf(model, 'UMLFlowFinalNode')) return 'flowFinal'
  if (isKindOf(model, 'UMLDecisionNode') || isKindOf(model, 'UMLMergeNode')) return 'decision'
  if (isKindOf(model, 'UMLForkNode') || isKindOf(model, 'UMLJoinNode')) return 'fork'
  return 'initial'
}

/**
 * Control node layout, by model type. Circles keep their aspect ratio when resized, diamonds
 * resize freely, fork/join bars are always 6 thick (the stored thickness is normalized) and
 * resize only along their length. Control nodes show no name.
 */
export function layoutControlNode(view: NodeView, _ctx: LayoutContext): NodeLayout<ControlNodeData> {
  const shape = controlShapeOf(view.model)
  const style = styleOf(view)
  switch (shape) {
    case 'initial':
    case 'activityFinal':
    case 'flowFinal': {
      const min = shape === 'initial' ? MIN_SIZES.initialNode : shape === 'activityFinal' ? MIN_SIZES.activityFinal : MIN_SIZES.flowFinal
      return nodeLayout(view, { minWidth: min.width, minHeight: min.height, sizable: 'ratio', outline: 'ellipse', style, data: { shape, horizontal: true } })
    }
    case 'decision':
      return nodeLayout(view, {
        minWidth: MIN_SIZES.decision.width,
        minHeight: MIN_SIZES.decision.height,
        outline: 'diamond',
        style,
        data: { shape, horizontal: true }
      })
    case 'fork': {
      const horizontal = (view.width ?? 0) >= (view.height ?? 0)
      const thick = SPACING.forkJoinThickness
      const min = horizontal ? MIN_SIZES.forkJoinHorizontal : MIN_SIZES.forkJoinVertical
      const normalized = (horizontal ? { ...view, height: thick } : { ...view, width: thick }) as NodeView
      return nodeLayout(normalized, {
        minWidth: min.width,
        minHeight: min.height,
        sizable: horizontal ? 'horz' : 'vert',
        style,
        data: { shape, horizontal }
      })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pins

export type PinSide = 'top' | 'bottom' | 'left' | 'right'

export interface PinData {
  readonly input: boolean
  /** Border of the owning action the pin sits on (null when the pin has no action). */
  readonly side: PinSide | null
  /** Direction arrow inside the pin: shaft polyline and arrowhead polyline. */
  readonly arrow: { readonly shaft: readonly Point[]; readonly head: readonly Point[] } | null
  readonly labels: readonly TextLine[]
}

/** The owning action's view of a pin view: its container view, else the action's view in the diagram. */
export function pinHostView(view: NodeView, ctx: LayoutContext): View | null {
  const action = view.model?._parent
  const container = view.containerView ?? null
  if (container && (!action || container.model === action)) return container
  if (!action) return null
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v !== view && v.model === action && isKindOf(v, 'NodeView') && v.visible !== false) return v as View
  }
  return null
}

function hostBox(host: View, ctx: LayoutContext): Rect | null {
  const laid = ctx.nodeLayout(host._id)
  if (laid) return laid.box
  if (!isKindOf(host, 'NodeView')) return null
  try {
    return nodeNotationFor(host).layout(host as NodeView, ctx).box
  } catch {
    return null
  }
}

/**
 * Nearest point of `r`'s border to `p` and the side it lies on (points inside snap to the
 * closest side, points outside are clamped onto the border).
 */
export function nearestBorderPoint(r: Rect, p: Point): { point: Point; side: PinSide } {
  const right = r.left + r.width
  const bottom = r.top + r.height
  const inside = p.x >= r.left && p.x <= right && p.y >= r.top && p.y <= bottom
  if (inside) {
    const d = { left: p.x - r.left, right: right - p.x, top: p.y - r.top, bottom: bottom - p.y }
    const side = (Object.keys(d) as PinSide[]).reduce((a, b) => (d[b] < d[a] ? b : a))
    const point = side === 'left' ? { x: r.left, y: p.y } : side === 'right' ? { x: right, y: p.y } : side === 'top' ? { x: p.x, y: r.top } : { x: p.x, y: bottom }
    return { point, side }
  }
  const point = { x: Math.min(Math.max(p.x, r.left), right), y: Math.min(Math.max(p.y, r.top), bottom) }
  // Corner regions: the side with the larger overshoot wins.
  const dx = p.x < r.left ? r.left - p.x : p.x > right ? p.x - right : 0
  const dy = p.y < r.top ? r.top - p.y : p.y > bottom ? p.y - bottom : 0
  const side: PinSide = dx >= dy ? (p.x < r.left ? 'left' : 'right') : p.y < r.top ? 'top' : 'bottom'
  return { point, side }
}

const OUTWARD: Readonly<Record<PinSide, Point>> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }

/** Arrow across a pin box through its center, pointing out of the action (output) or into it (input). */
export function pinArrow(box: Rect, side: PinSide, input: boolean): { shaft: Point[]; head: Point[] } {
  const inset = 2
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const out = OUTWARD[side]
  const dir = input ? { x: -out.x, y: -out.y } : out
  const half = (out.x !== 0 ? box.width : box.height) / 2 - inset
  const from = { x: cx - dir.x * half, y: cy - dir.y * half }
  const tip = { x: cx + dir.x * half, y: cy + dir.y * half }
  // Arrowhead: two 3 × 3 strokes back from the tip.
  const back = { x: tip.x - dir.x * 3, y: tip.y - dir.y * 3 }
  const perp = { x: -dir.y * 3, y: dir.x * 3 }
  return {
    shaft: [from, tip],
    head: [
      { x: back.x + perp.x, y: back.y + perp.y },
      tip,
      { x: back.x - perp.x, y: back.y - perp.y }
    ]
  }
}

function labelParams(label: unknown, defaults: { alpha: number; distance: number }): { alpha: number; distance: number } {
  const l = label as View | null | undefined
  const alpha = typeof l?.['alpha'] === 'number' && Number.isFinite(l['alpha']) ? (l['alpha'] as number) : defaults.alpha
  const distance = typeof l?.['distance'] === 'number' && Number.isFinite(l['distance']) ? (l['distance'] as number) : defaults.distance
  return { alpha, distance }
}

function labelVisible(label: unknown, fallback: boolean): boolean {
  const l = label as View | null | undefined
  return l ? l.visible !== false : fallback
}

/** Gap between a pin and its outward-placed label. */
const PIN_LABEL_GAP = 3

const isDefaultLabel = (label: unknown, defaults: { alpha: number; distance: number }): boolean => {
  const p = labelParams(label, defaults)
  return Math.abs(p.alpha - defaults.alpha) < 1e-6 && Math.abs(p.distance - defaults.distance) < 1e-6
}

/**
 * Label box beside a pin, on the outer side of the owning action (away from the action's name):
 * above a top pin, below a bottom pin, left/right of a side pin. `offset` stacks further labels.
 */
export function pinLabelBox(pin: Rect, side: PinSide, size: { width: number; height: number }, offset = 0): Rect {
  const cx = pin.left + pin.width / 2
  const cy = pin.top + pin.height / 2
  const gap = PIN_LABEL_GAP + offset
  switch (side) {
    case 'top':
      return { left: cx - size.width / 2, top: pin.top - gap - size.height, width: size.width, height: size.height }
    case 'bottom':
      return { left: cx - size.width / 2, top: pin.top + pin.height + gap, width: size.width, height: size.height }
    case 'left':
      return { left: pin.left - gap - size.width, top: cy - size.height / 2, width: size.width, height: size.height }
    case 'right':
      return { left: pin.left + pin.width + gap, top: cy - size.height / 2, width: size.width, height: size.height }
  }
}

/**
 * Pin layout: an 18 × 18 fixed square pushed to straddle the nearest point of the owning
 * action's border; the arrow inside shows the flow direction; the floating name label
 * (`name: Type[mult]`) sits outside the action next to the pin by default (it never covers the
 * action's name; a label dragged elsewhere keeps its stored position) and the stereotype label
 * beyond it.
 */
export function layoutPin(view: NodeView, ctx: LayoutContext): NodeLayout<PinData> {
  const model = view.model
  const style = styleOf(view)
  const size = MIN_SIZES.pin
  const input = isKindOf(model, 'UMLInputPin') || view._type === 'UMLInputPinView'
  const stored = { left: view.left ?? 0, top: view.top ?? 0, width: size.width, height: size.height }
  const host = pinHostView(view, ctx)
  const hb = host ? hostBox(host, ctx) : null
  let box = stored
  let side: PinSide | null = null
  if (hb) {
    const snap = nearestBorderPoint(hb, { x: stored.left + size.width / 2, y: stored.top + size.height / 2 })
    side = snap.side
    box = { left: Math.round(snap.point.x - size.width / 2), top: Math.round(snap.point.y - size.height / 2), width: size.width, height: size.height }
  }

  const labels: TextLine[] = []
  const regions: EditRegion[] = []
  const nameText = typedNameText(model, true)
  if (nameText && labelVisible(view['nameLabel'], true)) {
    const s = ctx.measurer.measure(nameText, style.font)
    const dims = { width: Math.ceil(s.width), height: s.height }
    const lb =
      side && isDefaultLabel(view['nameLabel'], NODE_LABEL_DEFAULTS.name)
        ? pinLabelBox(box, side, dims)
        : placeNodeLabel(box, labelParams(view['nameLabel'], NODE_LABEL_DEFAULTS.name), dims)
    labels.push({ text: nameText, font: style.font, align: 'center', box: lb })
    regions.push(...typedNameRegion(model ?? null, lb, style.font))
  }
  const st = stereotypeName(model)
  if (st && labelVisible(view['stereotypeLabel'], false)) {
    const text = `«${st}»`
    const s = ctx.measurer.measure(text, style.font)
    const dims = { width: Math.ceil(s.width), height: s.height }
    const nameBox = labels[0]?.box
    const stacked = side !== null && isDefaultLabel(view['stereotypeLabel'], NODE_LABEL_DEFAULTS.stereotype)
    // Beyond the name label on a top/bottom pin; side pins stack the stereotype above the name.
    const sbox = !stacked || side === null
      ? placeNodeLabel(box, labelParams(view['stereotypeLabel'], NODE_LABEL_DEFAULTS.stereotype), dims)
      : side === 'left' || side === 'right'
        ? { ...pinLabelBox(box, side, dims), top: (nameBox?.top ?? box.top) - dims.height - 1 }
        : pinLabelBox(box, side, dims, nameBox ? nameBox.height + 1 : 0)
    labels.push({ text, font: style.font, align: 'center', box: sbox })
  }
  // The box itself is also a name target (double-click on the pin).
  regions.push(...typedNameRegion(model ?? null, box, style.font))

  const positioned = { ...view, left: box.left, top: box.top, width: box.width, height: box.height, autoResize: false } as NodeView
  return nodeLayout(positioned, {
    minWidth: size.width,
    minHeight: size.height,
    sizable: 'none',
    style,
    ...(labels.length > 0 ? { extraBounds: labels.map((l) => l.box) } : {}),
    data: { input, side, arrow: side ? pinArrow(box, side, input) : null, labels },
    regions
  })
}

// ---------------------------------------------------------------------------------------------
// Partition (swimlane)

export interface SwimlaneData {
  readonly vertical: boolean
  /** Header band (top row for vertical lanes, left column for horizontal ones). */
  readonly header: Rect
  /** Lane border polyline (open at the far end). */
  readonly border: readonly Point[]
  /** Name text (drawn rotated −90° in horizontal lanes). */
  readonly name: TextLine | null
}

/** Header thickness of a swimlane: name height + 4 + 4 (21 at 13 px). */
export function swimlaneHeaderSize(font: Font): number {
  return font.size + SPACING.partitionHeaderPadding * 2
}

/**
 * Swimlane layout: vertical lanes have a header row across the top (name centered, 4 below the
 * top), minimum max(50, name + 20) × 300; horizontal lanes have a header column on the left with
 * the name rotated −90°, minimum 300 × max(50, name + 20).
 */
export function layoutSwimlane(view: NodeView, ctx: LayoutContext): NodeLayout<SwimlaneData> {
  const model = view.model
  const style = styleOf(view)
  const vertical = view['isVertical'] !== false
  const font = nameFontOf(style)
  const text = nameOf(model)
  const size = ctx.measurer.measure(text, font)
  const nameLen = Math.ceil(size.width) + 20
  const hh = size.height + SPACING.partitionHeaderPadding * 2
  const pad = SPACING.partitionHeaderPadding
  const min = vertical ? MIN_SIZES.partitionVertical : MIN_SIZES.partitionHorizontal
  const arrange = (box: Rect): SwimlaneData => {
    const right = box.left + box.width
    const bottom = box.top + box.height
    if (vertical) {
      const header = { left: box.left, top: box.top, width: box.width, height: hh }
      return {
        vertical,
        header,
        border: [
          { x: box.left, y: bottom },
          { x: box.left, y: box.top },
          { x: right, y: box.top },
          { x: right, y: bottom }
        ],
        name: text ? { text, font, align: 'center', box: { left: box.left + PAD, top: box.top + pad, width: Math.max(0, box.width - PAD * 2), height: size.height } } : null
      }
    }
    const header = { left: box.left, top: box.top, width: hh, height: box.height }
    return {
      vertical,
      header,
      border: [
        { x: right, y: box.top },
        { x: box.left, y: box.top },
        { x: box.left, y: bottom },
        { x: right, y: bottom }
      ],
      // Unrotated text box; the renderer rotates it −90° about the header center.
      name: text
        ? {
            text,
            font,
            align: 'center',
            box: { left: box.left + hh / 2 - box.height / 2, top: box.top + box.height / 2 - size.height / 2, width: box.height, height: size.height }
          }
        : null
    }
  }
  return nodeLayout(view, {
    minWidth: vertical ? Math.max(min.width, nameLen) : Math.max(min.width, hh + 10),
    minHeight: vertical ? Math.max(min.height, hh + 10) : Math.max(min.height, nameLen),
    style,
    data: arrange,
    regions: (box) => nameRegion(model ?? null, arrange(box).header, font)
  })
}
