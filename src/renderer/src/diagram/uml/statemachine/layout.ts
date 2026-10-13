/**
 * Measure/arrange of state machine nodes (spec 20 §5): states with their internal activity,
 * internal transition and decomposition compartments, pseudostates, final states and connection
 * point references. Pure: reads the model, returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type View } from '../../../model'
import { NODE_LABEL_DEFAULTS, SPACING, placeNodeLabel, type Font, type Point, type Rect } from '../../core'
import {
  arrangeListCompartment,
  arrangeNameCompartment,
  measureListCompartment,
  measureNameCompartment,
  nameEditText,
  nameFontOf,
  nodeLayout,
  stereotypeName,
  styleOf,
  type ListRow
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeDivider, NodeLayout, TextLine } from '../../layout/types'
import { nodeNotationFor } from '../../render/registry'
import { nearestBorderPoint } from '../activity/layout'
import { internalActivityRows, internalTransitions, stateNameText, transitionLabel } from './strings'

/** Minimum size of a simple state. */
const STATE_MIN = { width: 60, height: 40 } as const
/** Minimum height of a region view. */
const REGION_MIN_HEIGHT = 50
/** Extra minimum height of a state that refers to a submachine (room for the mark). */
const SUBMACHINE_EXTRA = 16

// ---------------------------------------------------------------------------------------------
// State

interface StateRegionLayout {
  /** The region view (null when the region has no view yet). */
  readonly viewId: string | null
  readonly elementId: string
  readonly rect: Rect
  /** Dashed line across the top edge (every region but the first). */
  readonly dashedTop: boolean
}

interface SubmachineMark {
  readonly left: { readonly cx: number; readonly cy: number }
  readonly right: { readonly cx: number; readonly cy: number }
  readonly radius: number
  readonly lineFrom: Point
  readonly lineTo: Point
}

export interface StateData {
  readonly cornerRadius: number
  readonly nameLines: readonly TextLine[]
  readonly activityLines: readonly TextLine[]
  readonly transitionLines: readonly TextLine[]
  /** y of the solid separators (top of each visible compartment). */
  readonly separators: readonly number[]
  readonly regions: readonly StateRegionLayout[]
  readonly submachineMark: SubmachineMark | null
}

function showsStereotype(view: View): boolean {
  return view['stereotypeDisplay'] !== 'none'
}

/** Region views of a state view's decomposition compartment, by their region model. */
function regionViewOf(view: NodeView, region: Elem): NodeView | null {
  const compartment = view['decompositionCompartment'] as View | null | undefined
  const found = (compartment?.subViews ?? []).find((v) => v.model === region && isKindOf(v, 'UMLRegionView'))
  return (found as NodeView | undefined) ?? null
}

/** Mark of a submachine state: two small circles joined by a line in the bottom-right corner. */
function submachineMark(box: Rect): SubmachineMark {
  const right = box.left + box.width
  const bottom = box.top + box.height
  return {
    left: { cx: right - 23, cy: bottom - 13 },
    right: { cx: right - 11, cy: bottom - 13 },
    radius: 3,
    lineFrom: { x: right - 20, y: bottom - 13 },
    lineTo: { x: right - 14, y: bottom - 13 }
  }
}

function listRows(rows: ReadonlyArray<{ text: string; element: Elem }>, font: Font, edit: (el: Elem) => ListRow['edit']): ListRow[] {
  return rows.map((r) => ({ text: r.text, font, edit: edit(r.element) }))
}

/**
 * State layout: rounded rectangle (radius 10, min 60 × 40) with the name compartment on top, then
 * the internal activities, the internal transitions and the regions, each preceded by a separator.
 * Region heights come from their views (at least 50); the last region takes what is left.
 */
export function layoutState(view: NodeView, ctx: LayoutContext): NodeLayout<StateData> {
  const model = view.model
  const style = styleOf(view)
  const nameFont = nameFontOf(style)
  const submachine = model?.['submachine']
  const hasSubmachine = !!submachine && typeof submachine === 'object'
  const name = measureNameCompartment(
    {
      stereotype: showsStereotype(view) ? stereotypeName(model) : '',
      name: stateNameText(model, view['showType'] !== false),
      font: style.font
    },
    ctx.measurer
  )

  const activityRows = listRows(internalActivityRows(model), style.font, (el) => ({ kind: 'name', elementId: el._id }))
  const transitionRows = internalTransitions(model).map<ListRow>((t) => ({
    text: transitionLabel(t),
    font: style.font,
    edit: { kind: 'custom', elementId: t._id, syntax: 'transition' }
  }))
  const activities = activityRows.length > 0 ? measureListCompartment(activityRows, ctx.measurer) : null
  const transitions = transitionRows.length > 0 ? measureListCompartment(transitionRows, ctx.measurer) : null

  const regionModels = Array.isArray(model?.['regions']) ? (model['regions'] as Elem[]) : []
  const regions = regionModels.map((r) => {
    const rv = regionViewOf(view, r)
    return { element: r, view: rv, stored: Math.max(REGION_MIN_HEIGHT, rv?.height ?? 0) }
  })
  const lastMin = regions.length > 0 ? REGION_MIN_HEIGHT : 0
  // The last region takes whatever height is left, so only its minimum counts.
  const decoMin = regions.reduce((h, r, i) => h + (i === regions.length - 1 ? lastMin : r.stored), 0)

  const headerHeight = name.height + (activities?.height ?? 0) + (transitions?.height ?? 0)
  const minHeight = Math.max(STATE_MIN.height, headerHeight + decoMin) + (hasSubmachine ? SUBMACHINE_EXTRA : 0)
  const minWidth = Math.max(STATE_MIN.width, name.width, activities?.width ?? 0, transitions?.width ?? 0)

  const arrange = (box: Rect): StateData & { regionEdits: EditRegion[]; nameRect: Rect } => {
    let y = box.top
    const nameRect = { left: box.left, top: y, width: box.width, height: name.height }
    y += name.height
    const separators: number[] = []
    let activityLines: TextLine[] = []
    let transitionLines: TextLine[] = []
    const regionEdits: EditRegion[] = []
    if (activities) {
      separators.push(y)
      const rect = { left: box.left, top: y, width: box.width, height: activities.height }
      const lines = arrangeListCompartment(activities, rect)
      activityLines = lines
      for (const l of lines) if (l.edit) regionEdits.push({ box: l.box, target: l.edit, text: l.text.replace(/^[a-z]+\//, ''), font: l.font })
      y += activities.height
    }
    if (transitions) {
      separators.push(y)
      const rect = { left: box.left, top: y, width: box.width, height: transitions.height }
      const lines = arrangeListCompartment(transitions, rect)
      transitionLines = lines
      for (const l of lines) if (l.edit) regionEdits.push({ box: l.box, target: l.edit, text: l.text.replace(/^[^:]*: (?=.)/, ''), font: l.font })
      y += transitions.height
    }
    const laid: StateRegionLayout[] = []
    if (regions.length > 0) {
      separators.push(y)
      const bottom = box.top + box.height
      regions.forEach((r, i) => {
        const last = i === regions.length - 1
        const h = last ? Math.max(lastMin, bottom - y) : r.stored
        laid.push({ viewId: r.view?._id ?? null, elementId: r.element._id, rect: { left: box.left, top: y, width: box.width, height: h }, dashedTop: i > 0 })
        y += h
      })
    }
    return {
      cornerRadius: SPACING.actionCornerRadius,
      nameLines: arrangeNameCompartment(name, nameRect),
      activityLines,
      transitionLines,
      separators,
      regions: laid,
      submachineMark: hasSubmachine ? submachineMark(box) : null,
      regionEdits,
      nameRect
    }
  }

  const base = nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    data: (box) => {
      const { regionEdits: _r, nameRect: _n, ...data } = arrange(box)
      void _r
      void _n
      return data
    },
    regions: (box) => {
      const a = arrange(box)
      const out: EditRegion[] = []
      if (model) out.push({ box: a.nameRect, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: nameFont })
      out.push(...a.regionEdits)
      return out
    }
  })

  // Region views accept dropped vertices; dividers between regions resize them.
  const withViews = base.data.regions.filter((r): r is StateRegionLayout & { viewId: string } => r.viewId !== null)
  const dividers: NodeDivider[] = []
  base.data.regions.forEach((r, i) => {
    if (i === base.data.regions.length - 1 || r.viewId === null) return
    const below = base.data.regions.slice(i + 1, -1).reduce((h, x) => h + x.rect.height, 0)
    dividers.push({
      viewId: r.viewId,
      top: r.rect.top,
      y: r.rect.top + r.rect.height,
      left: base.box.left,
      width: base.box.width,
      minY: r.rect.top + REGION_MIN_HEIGHT,
      maxY: base.box.top + base.box.height - below - lastMin
    })
  })
  return {
    ...base,
    ...(withViews.length > 0 ? { subContainers: withViews.map((r) => ({ viewId: r.viewId, box: r.rect })) } : {}),
    ...(dividers.length > 0 ? { dividers } : {})
  }
}

// ---------------------------------------------------------------------------------------------
// Pseudostates and final state

type PseudostateShape =
  | 'initial'
  | 'history'
  | 'bar'
  | 'junction'
  | 'choice'
  | 'entryPoint'
  | 'exitPoint'
  | 'terminate'
  | 'final'

export interface PseudostateData {
  readonly shape: PseudostateShape
  /** Bars: horizontal when the width is at least the height. */
  readonly horizontal: boolean
  /** Centered text of history pseudostates (`H` / `H*`). */
  readonly text: TextLine | null
  /** Half-extent of the X arms of exit points and terminate. */
  readonly arm: number
}

const MIN_BY_KIND: Readonly<Record<string, { width: number; height: number }>> = {
  initial: { width: 20, height: 20 },
  deepHistory: { width: 26, height: 26 },
  shallowHistory: { width: 26, height: 26 },
  join: { width: 70, height: 6 },
  fork: { width: 70, height: 6 },
  junction: { width: 15, height: 15 },
  choice: { width: 23, height: 19 },
  entryPoint: { width: 15, height: 15 },
  exitPoint: { width: 15, height: 15 },
  terminate: { width: 26, height: 26 }
}

function pseudostateKindOf(model: Elem | null | undefined): string {
  const kind = model?.['kind']
  return typeof kind === 'string' && kind in MIN_BY_KIND ? kind : 'initial'
}

function shapeOfKind(kind: string): PseudostateShape {
  switch (kind) {
    case 'deepHistory':
    case 'shallowHistory':
      return 'history'
    case 'join':
    case 'fork':
      return 'bar'
    default:
      return kind as PseudostateShape
  }
}

/** Half-extent of the X arms of an exit point / terminate of the given width: `round(√2·width/4)`. */
function exitArm(width: number): number {
  return Math.round((Math.SQRT2 * width) / 4)
}

/** Pseudostate layout; labels are never shown. Bars are 6 thick along one axis. */
export function layoutPseudostate(view: NodeView, ctx: LayoutContext): NodeLayout<PseudostateData> {
  const kind = pseudostateKindOf(view.model)
  const shape = shapeOfKind(kind)
  const style = styleOf(view)
  const min = MIN_BY_KIND[kind] as { width: number; height: number }
  if (shape === 'bar') {
    const horizontal = (view.width ?? 0) >= (view.height ?? 0)
    const thick = SPACING.forkJoinThickness
    const normalized = (horizontal ? { ...view, height: thick } : { ...view, width: thick }) as NodeView
    const m = horizontal ? min : { width: min.height, height: min.width }
    return nodeLayout(normalized, {
      minWidth: m.width,
      minHeight: m.height,
      sizable: horizontal ? 'horz' : 'vert',
      style,
      data: { shape, horizontal, text: null, arm: 0 }
    })
  }
  const text = kind === 'deepHistory' ? 'H*' : kind === 'shallowHistory' ? 'H' : ''
  const size = text ? ctx.measurer.measure(text, style.font) : { width: 0, height: 0 }
  return nodeLayout(view, {
    minWidth: min.width,
    minHeight: min.height,
    sizable: shape === 'choice' ? 'free' : 'ratio',
    outline: shape === 'choice' ? 'diamond' : 'ellipse',
    style,
    data: (box) => ({
      shape,
      horizontal: true,
      arm: exitArm(box.width),
      text: text ? { text, font: style.font, align: 'center', box: { left: box.left, top: box.top + (box.height - size.height) / 2, width: box.width, height: size.height } } : null
    })
  })
}

export interface FinalStateData {
  /** Radius of the inner filled circle (the outer circle inset by 5). */
  readonly innerRadius: number
}

/** Final state: 26 × 26 outlined circle with a filled circle inset by 5. */
export function layoutFinalState(view: NodeView, _ctx: LayoutContext): NodeLayout<FinalStateData> {
  const style = styleOf(view)
  return nodeLayout(view, {
    minWidth: 26,
    minHeight: 26,
    sizable: 'ratio',
    outline: 'ellipse',
    style,
    data: (box) => ({ innerRadius: Math.max(1, Math.min(box.width, box.height) / 2 - SPACING.activityFinalInset) })
  })
}

// ---------------------------------------------------------------------------------------------
// Connection point reference

export interface ConnectionPointData {
  /** Carries an X when it references any exit point. */
  readonly hasExit: boolean
  readonly label: TextLine | null
}

const CPR_SIZE = { width: 14, height: 14 } as const

function namesOf(list: unknown): string[] {
  return Array.isArray(list) ? (list as Elem[]).map((e) => (typeof e['name'] === 'string' ? e['name'] : '')).filter((n) => n !== '') : []
}

/** Names of the referenced entry and exit points, comma separated. */
function connectionPointText(model: Elem | null | undefined): string {
  return [...namesOf(model?.['entry']), ...namesOf(model?.['exit'])].join(', ')
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

/** The state view a connection point reference is glued to. */
function connectionPointHost(view: NodeView, ctx: LayoutContext): View | null {
  const state = view.model?._parent
  const container = view.containerView ?? null
  if (container && (!state || container.model === state)) return container
  if (!state) return null
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v !== view && v.model === state && isKindOf(v, 'NodeView') && v.visible !== false) return v as View
  }
  return null
}

/** Connection point reference: 14 × 14 circle glued to the border of its state view. */
export function layoutConnectionPoint(view: NodeView, ctx: LayoutContext): NodeLayout<ConnectionPointData> {
  const style = styleOf(view)
  const model = view.model
  const stored = { left: view.left ?? 0, top: view.top ?? 0, width: CPR_SIZE.width, height: CPR_SIZE.height }
  const host = connectionPointHost(view, ctx)
  const hb = host ? hostBox(host, ctx) : null
  let box: Rect = stored
  if (hb) {
    const snap = nearestBorderPoint(hb, { x: stored.left + stored.width / 2, y: stored.top + stored.height / 2 })
    box = { left: Math.round(snap.point.x - stored.width / 2), top: Math.round(snap.point.y - stored.height / 2), ...CPR_SIZE }
  }
  const text = connectionPointText(model)
  const labelView = view['nameLabel'] as View | null | undefined
  let label: TextLine | null = null
  if (text && labelView?.visible !== false) {
    const s = ctx.measurer.measure(text, style.font)
    const alpha = typeof labelView?.['alpha'] === 'number' ? (labelView['alpha'] as number) : NODE_LABEL_DEFAULTS.name.alpha
    const distance = typeof labelView?.['distance'] === 'number' ? (labelView['distance'] as number) : NODE_LABEL_DEFAULTS.name.distance
    const lb = placeNodeLabel(box, { alpha, distance }, { width: Math.ceil(s.width), height: s.height })
    label = { text, font: style.font, align: 'center', box: lb }
  }
  const positioned = { ...view, left: box.left, top: box.top, width: box.width, height: box.height, autoResize: false } as NodeView
  return nodeLayout(positioned, {
    minWidth: CPR_SIZE.width,
    minHeight: CPR_SIZE.height,
    sizable: 'none',
    outline: 'ellipse',
    style,
    ...(label ? { extraBounds: [label.box] } : {}),
    data: { hasExit: Array.isArray(model?.['exit']) && (model['exit'] as unknown[]).length > 0, label }
  })
}

// ---------------------------------------------------------------------------------------------
// Region view found at the top level (only if a file stores one there)

export function layoutOrphanRegion(view: NodeView): NodeLayout<null> {
  return nodeLayout(view, { minWidth: 50, minHeight: REGION_MIN_HEIGHT, sizable: 'vert', data: null })
}
