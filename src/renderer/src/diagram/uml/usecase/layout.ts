/**
 * Measure/arrange of use case diagram nodes (spec 03 §4.3). Pure: reads the model, returns
 * layout data.
 *
 * - Use case: an ellipse that fits its name compartment by the √2 rule, with the extension
 *   points (and any unsuppressed attribute/operation) compartments below it; iconic form (a
 *   70:32 ellipse with the name below) and decoration form (a box with a small ellipse icon).
 * - Actor: a 26:55 stick figure with the name compartment below (label, none and icon forms are
 *   the same); decoration form is a classifier box with a stick-figure decoration.
 * - Subject (system boundary): a rectangle with the name centered at the top; a container drawn
 *   behind ordinary views.
 *
 * With the view's `wordWrap` flag, names wrap to the available width; the minimum width then
 * only needs to fit the longest word.
 */
import { isKindOf, type Elem, type NodeView, type UMLClassifierView } from '../../../model'
import { ACTOR_ASPECT, MIN_SIZES, SPACING, USE_CASE_ASPECT, wrapText, type EdgeEndpoint, type Font, type Rect } from '../../core'
import {
  arrangeListCompartment,
  arrangeNameCompartment,
  measureListCompartment,
  nameEditText,
  nameOf,
  nodeLayout,
  styleOf,
  type ListCompartmentMeasure,
  type ListRow,
  type NameCompartmentMeasure
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { classifierNameMeasure, type StereotypeForm } from '../class/layout'
import { attributeEditText, attributeText, operationEditText, operationText, type FeatureFormat } from '../class/strings'

const PAD = SPACING.compartmentPaddingLeft
const GAP = SPACING.compartmentItemGap
const ICON = SPACING.decorationIconSize
const ICON_INSET = SPACING.decorationIconInset
/** Gap between a use case ellipse and the compartments below it (spec 03 §4.3). */
const USE_CASE_COMPARTMENT_GAP = 5
/** Minimum subject size (not specified by the reference; OpenUML uses the package minimum). */
const SUBJECT_MIN_SIZE = MIN_SIZES.package
/**
 * Subjects paint between the diagram frame (−1) and ordinary views (0), so they always stay
 * behind the use cases and actors they contain (spec 03 §4.3 [R]), whatever the list order.
 */
export const SUBJECT_Z_INDEX = -0.5

// ---------------------------------------------------------------------------------------------
// Shared pieces

type UseCaseCompartmentKind = 'extensionPoints' | 'attributes' | 'operations'

export interface UseCaseCompartmentLayout {
  readonly kind: UseCaseCompartmentKind
  readonly rect: Rect
  readonly rows: readonly TextLine[]
}

interface Compartment {
  readonly kind: UseCaseCompartmentKind
  readonly measure: ListCompartmentMeasure
}

function items(model: Elem | null, field: string): Elem[] {
  const list = model?.[field]
  return Array.isArray(list) ? (list as Elem[]) : []
}

/** Stereotype display form of a view (default `label`). */
function stereotypeFormOf(view: NodeView): StereotypeForm {
  const v = view['stereotypeDisplay']
  return v === 'none' || v === 'decoration' || v === 'decoration-label' || v === 'icon' || v === 'icon-label' ? v : 'label'
}

/** Text of an extension point row: `name` or `name: location`. */
function extensionPointText(ep: Elem): string {
  const location = typeof ep['location'] === 'string' ? ep['location'].trim() : ''
  return location ? `${nameOf(ep)}: ${location}` : nameOf(ep)
}

/** Visible list compartments: extension points (use cases, when any), attributes, operations. */
function compartmentsOf(view: UMLClassifierView, model: Elem | null, font: Font, ctx: LayoutContext, withExtensionPoints: boolean): Compartment[] {
  if (!model) return []
  const format: FeatureFormat = {
    showVisibility: view.showVisibility !== false,
    showType: view.showType !== false,
    showMultiplicity: view.showMultiplicity !== false,
    showProperty: view.showProperty !== false,
    showOperationSignature: view.showOperationSignature !== false,
    showStereotype: true
  }
  const classifierId = model._id
  const result: Compartment[] = []
  const add = (kind: UseCaseCompartmentKind, rows: ListRow[]): void => {
    result.push({ kind, measure: measureListCompartment(rows, ctx.measurer) })
  }
  const points = withExtensionPoints ? items(model, 'extensionPoints') : []
  const epCompartment = view['extensionPointCompartment'] as NodeView | null | undefined
  if (points.length > 0 && epCompartment?.visible !== false) {
    add(
      'extensionPoints',
      points.map((ep) => ({ text: extensionPointText(ep), font, edit: { kind: 'name', elementId: ep._id }, editText: nameEditText(ep) }))
    )
  }
  if (view.suppressAttributes === false) {
    add(
      'attributes',
      items(model, 'attributes').map((attr) => ({
        text: attributeText(attr, format),
        font,
        underline: attr['isStatic'] === true,
        edit: { kind: 'attribute', elementId: attr._id, classifierId },
        editText: attributeEditText(attr)
      }))
    )
  }
  if (view.suppressOperations === false) {
    add(
      'operations',
      items(model, 'operations').map((op) => ({
        text: operationText(op, format),
        font: op['isAbstract'] === true ? { ...font, style: font.style | 2 } : font,
        underline: op['isStatic'] === true,
        edit: { kind: 'operation', elementId: op._id, classifierId },
        editText: operationEditText(op)
      }))
    )
  }
  return result
}

/** Stacks compartments from `top` across `box`; collects their rows' edit regions. */
function arrangeCompartments(compartments: readonly Compartment[], box: Rect, top: number, regions: EditRegion[]): UseCaseCompartmentLayout[] {
  let y = top
  return compartments.map((c) => {
    const rect = { left: box.left, top: y, width: box.width, height: c.measure.height }
    y += c.measure.height
    const rows = arrangeListCompartment(c.measure, rect)
    for (const row of rows) {
      if (row.edit) regions.push({ box: { ...row.box, left: rect.left, width: rect.width }, target: row.edit, text: row.editText ?? row.text, font: row.font })
    }
    return { kind: c.kind, rect, rows: rows.map(({ edit: _e, editText: _t, ...line }) => line) }
  })
}

function heightOf(compartments: readonly Compartment[]): number {
  return compartments.reduce((h, c) => h + c.measure.height, 0)
}

function widthOf(compartments: readonly Compartment[]): number {
  return Math.max(0, ...compartments.map((c) => c.measure.width))
}

/**
 * Re-measures a name compartment with the name wrapped to `maxTextWidth` (each wrapped line is
 * a name item, 2 apart). `maxTextWidth = 0` puts every word on its own line (the narrowest form).
 */
function wrapNameCompartment(m: NameCompartmentMeasure, maxTextWidth: number, ctx: LayoutContext): NameCompartmentMeasure {
  const name = m.items.find((i) => i.index === 1)
  if (!name || !name.text.includes(' ') || name.size.width <= maxTextWidth) return m
  const lines = wrapText(name.text, Math.max(0, maxTextWidth), name.font, ctx.measurer)
  if (lines.length <= 1) return m
  const out: Array<NameCompartmentMeasure['items'][number]> = []
  for (const item of m.items) {
    if (item !== name) out.push(item)
    else for (const text of lines) out.push({ ...item, text, size: ctx.measurer.measure(text, item.font) })
  }
  let width = 0
  let height = PAD + PAD
  for (const item of out) {
    width = Math.max(width, item.size.width)
    height += item.size.height + (item.index > 0 ? GAP : 0)
  }
  return { width: Math.ceil(width) + PAD * 2, height, items: out }
}

/** Width the node will get for a minimum width (stored width grown to it; exactly it with auto-resize). */
function effectiveWidth(view: NodeView, minWidth: number): number {
  const min = Math.ceil(minWidth)
  return view.autoResize ? min : Math.max(view.width ?? 0, min)
}

/**
 * The name compartment for a node: unwrapped, or (with `wordWrap`) wrapped to the text width the
 * node's final width allows. `textWidthFor(width)` maps the node width to the name's text width;
 * `minWidthFor(nameWidth)` maps a name compartment width to the node's minimum width.
 */
function fitName(
  view: NodeView,
  base: NameCompartmentMeasure,
  ctx: LayoutContext,
  minWidthFor: (nameWidth: number) => number,
  textWidthFor: (width: number) => number
): { name: NameCompartmentMeasure; minWidth: number } {
  if (view['wordWrap'] !== true) return { name: base, minWidth: minWidthFor(base.width) }
  const minWidth = minWidthFor(wrapNameCompartment(base, 0, ctx).width)
  return { name: wrapNameCompartment(base, textWidthFor(effectiveWidth(view, minWidth)), ctx), minWidth }
}

function nameRegion(model: Elem | null, rect: Rect, m: NameCompartmentMeasure, font: Font): EditRegion[] {
  if (!model) return []
  const nameItem = m.items.find((i) => i.index === 1)
  return [{ box: rect, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: nameItem?.font ?? font }]
}

/** Box (decoration) form shared by actors and use cases: classifier box + 24 × 24 icon slot. */
interface BoxFormResult {
  readonly nameRect: Rect
  readonly nameLines: TextLine[]
  readonly compartments: UseCaseCompartmentLayout[]
  readonly iconRect: Rect
  readonly regions: EditRegion[]
}

function boxForm(
  view: NodeView,
  model: Elem | null,
  base: NameCompartmentMeasure,
  compartments: readonly Compartment[],
  font: Font,
  ctx: LayoutContext
): { minWidth: number; minHeight: number; arrange: (box: Rect) => BoxFormResult } {
  const decorationWidth = ICON + PAD * 2
  const { name, minWidth: nameMin } = fitName(
    view,
    base,
    ctx,
    (w) => w + decorationWidth,
    (width) => width - decorationWidth - PAD * 2
  )
  const nameHeight = Math.max(name.height, ICON + PAD * 2)
  const minWidth = Math.max(nameMin, widthOf(compartments))
  const minHeight = nameHeight + heightOf(compartments)
  return {
    minWidth,
    minHeight,
    arrange(box) {
      const nameRect = { left: box.left, top: box.top, width: box.width, height: nameHeight }
      const regions = nameRegion(model, nameRect, name, font)
      const laid = arrangeCompartments(compartments, box, box.top + nameHeight, regions)
      const iconRect = { left: box.left + box.width - ICON - ICON_INSET, top: box.top + ICON_INSET, width: ICON, height: ICON }
      return { nameRect, nameLines: arrangeNameCompartment(name, nameRect), compartments: laid, iconRect, regions }
    }
  }
}

/** `rect` shrunk to `aspect` (width : height), centered horizontally and kept at the top. */
function fitAspectTop(rect: Rect, aspect: number): Rect {
  const width = Math.min(rect.width, rect.height * aspect)
  const height = width / aspect
  return { left: rect.left + (rect.width - width) / 2, top: rect.top, width, height }
}

// ---------------------------------------------------------------------------------------------
// Use case

export interface UseCaseData {
  /** `ellipse`: canonical; `icon`: 70:32 ellipse with the name below; `box`: decoration form. */
  readonly form: 'ellipse' | 'icon' | 'box'
  /** The ellipse (ellipse/icon forms) or the small decoration ellipse (box form). */
  readonly ellipse: Rect
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly UseCaseCompartmentLayout[]
}

/** Use case node layout (spec 03 §4.3). */
export function layoutUseCase(view: NodeView, ctx: LayoutContext): NodeLayout<UseCaseData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = stereotypeFormOf(view)
  const base = classifierNameMeasure(cv, model, font, ctx, form)

  if (form === 'decoration' || form === 'decoration-label') {
    const compartments = compartmentsOf(cv, model, font, ctx, true)
    const b = boxForm(view, model, base, compartments, font, ctx)
    const ellipseOf = (icon: Rect): Rect => {
      const height = icon.width / USE_CASE_ASPECT
      return { left: icon.left, top: icon.top + (icon.height - height) / 2, width: icon.width, height }
    }
    return nodeLayout(view, {
      minWidth: b.minWidth,
      minHeight: b.minHeight,
      style,
      data: (box) => {
        const r = b.arrange(box)
        return { form: 'box', ellipse: ellipseOf(r.iconRect), nameRect: r.nameRect, nameLines: r.nameLines, compartments: r.compartments }
      },
      regions: (box) => b.arrange(box).regions
    })
  }

  if (form === 'icon' || form === 'icon-label') {
    // Iconic form: a 70:32 ellipse at the top center, the name compartment below.
    const { name, minWidth: nameMin } = fitName(view, base, ctx, (w) => w, (width) => width - PAD * 2)
    const ellipseIn = (box: Rect): Rect =>
      fitAspectTop({ left: box.left, top: box.top, width: box.width, height: Math.max(MIN_SIZES.useCase.height, box.height - name.height) }, USE_CASE_ASPECT)
    const nameRectIn = (box: Rect): Rect => {
      const e = ellipseIn(box)
      return { left: box.left, top: e.top + e.height, width: box.width, height: name.height }
    }
    return nodeLayout(view, {
      minWidth: Math.max(MIN_SIZES.useCase.width, nameMin),
      minHeight: MIN_SIZES.useCase.height + name.height,
      style,
      outline: 'rect',
      data: (box) => {
        const nameRect = nameRectIn(box)
        return { form: 'icon', ellipse: ellipseIn(box), nameRect, nameLines: arrangeNameCompartment(name, nameRect), compartments: [] }
      },
      endpoint: (box): EdgeEndpoint => ({ box: ellipseIn(box), outline: 'ellipse' }),
      regions: (box) => nameRegion(model, nameRectIn(box), name, font)
    })
  }

  // Canonical form: the ellipse fills the box above the compartments.
  const compartments = compartmentsOf(cv, model, font, ctx, true)
  const { name, minWidth: nameMin } = fitName(
    view,
    base,
    ctx,
    (w) => Math.floor(Math.SQRT2 * w),
    (width) => Math.floor(width / Math.SQRT2) - PAD * 2
  )
  const below = compartments.length > 0 ? heightOf(compartments) + USE_CASE_COMPARTMENT_GAP : 0
  const minWidth = Math.max(nameMin, MIN_SIZES.useCase.width, widthOf(compartments))
  const minHeight = Math.max(Math.floor(Math.SQRT2 * name.height), MIN_SIZES.useCase.height) + below
  const ellipseIn = (box: Rect): Rect => ({ left: box.left, top: box.top, width: box.width, height: box.height - below })
  const nameRectIn = (box: Rect): Rect => {
    const e = ellipseIn(box)
    const width = Math.floor(box.width / Math.SQRT2)
    return { left: box.left + (box.width - width) / 2, top: e.top + (e.height - name.height) / 2, width, height: name.height }
  }
  const arrange = (box: Rect): { data: UseCaseData; regions: EditRegion[] } => {
    const ellipse = ellipseIn(box)
    const nameRect = nameRectIn(box)
    const regions = nameRegion(model, nameRect, name, font)
    const laid = arrangeCompartments(compartments, box, ellipse.top + ellipse.height + USE_CASE_COMPARTMENT_GAP, regions)
    return { data: { form: 'ellipse', ellipse, nameRect, nameLines: arrangeNameCompartment(name, nameRect), compartments: laid }, regions }
  }
  return nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    outline: 'ellipse',
    ...(below > 0 ? { endpoint: (box: Rect): EdgeEndpoint => ({ box: ellipseIn(box), outline: 'ellipse' }) } : {}),
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions
  })
}

// ---------------------------------------------------------------------------------------------
// Actor

export interface ActorData {
  /** `figure`: stick figure + name below (label/none/icon forms); `box`: decoration form. */
  readonly form: 'figure' | 'box'
  /** Rectangle the stick figure is drawn in (26:55). */
  readonly figure: Rect
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly UseCaseCompartmentLayout[]
}

/** Stick figure strokes inside its icon rectangle (spec 03 §4.3 proportions). */
export interface StickFigureGeometry {
  readonly head: Rect
  readonly body: readonly [number, number, number, number]
  readonly arms: readonly [number, number, number, number]
  readonly leftLeg: readonly [number, number, number, number]
  readonly rightLeg: readonly [number, number, number, number]
}

export function stickFigure(r: Rect): StickFigureGeometry {
  const x1 = r.left
  const y1 = r.top
  const x2 = r.left + r.width
  const y2 = r.top + r.height
  const w = r.width
  const h = r.height
  const cx = x1 + w / 2
  const hip = y1 + 0.66 * h
  return {
    head: { left: x1 + 0.16 * w, top: y1 + 1, width: w - 0.32 * w, height: 0.34 * h - 1 },
    body: [cx, y1 + 0.34 * h, cx, hip],
    arms: [x1 + 0.14 * w, y1 + 0.46 * h, x2 - 0.14 * w, y1 + 0.46 * h],
    leftLeg: [cx, hip, x1, y2 - 1],
    rightLeg: [cx, hip, x2, y2 - 1]
  }
}

/** Actor node layout (spec 03 §4.3). */
export function layoutActor(view: NodeView, ctx: LayoutContext): NodeLayout<ActorData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = stereotypeFormOf(view)
  const base = classifierNameMeasure(cv, model, font, ctx, form)

  if (form === 'decoration' || form === 'decoration-label') {
    const compartments = compartmentsOf(cv, model, font, ctx, false)
    const b = boxForm(view, model, base, compartments, font, ctx)
    return nodeLayout(view, {
      minWidth: b.minWidth,
      minHeight: b.minHeight,
      style,
      data: (box) => {
        const r = b.arrange(box)
        return { form: 'box', figure: fitAspectTop(r.iconRect, ACTOR_ASPECT), nameRect: r.nameRect, nameLines: r.nameLines, compartments: r.compartments }
      },
      regions: (box) => b.arrange(box).regions
    })
  }

  // Canonical and iconic forms: the 26:55 figure at the top center, the name below.
  const { name, minWidth } = fitName(view, base, ctx, (w) => Math.max(w, MIN_SIZES.actor.width), (width) => width - PAD * 2)
  const figureIn = (box: Rect): Rect =>
    fitAspectTop({ left: box.left, top: box.top, width: box.width, height: Math.max(MIN_SIZES.actor.height, box.height - name.height) }, ACTOR_ASPECT)
  const nameRectIn = (box: Rect): Rect => {
    const f = figureIn(box)
    return { left: box.left, top: f.top + f.height, width: box.width, height: name.height }
  }
  return nodeLayout(view, {
    minWidth,
    minHeight: MIN_SIZES.actor.height + name.height,
    style,
    data: (box) => {
      const nameRect = nameRectIn(box)
      return { form: 'figure', figure: figureIn(box), nameRect, nameLines: arrangeNameCompartment(name, nameRect), compartments: [] }
    },
    regions: (box) => nameRegion(model, nameRectIn(box), name, font)
  })
}

// ---------------------------------------------------------------------------------------------
// Subject (system boundary)

export interface SubjectData {
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
}

/** The element whose name a subject shows: its represented classifier, else itself. */
function subjectShownElement(model: Elem | null): Elem | null {
  const represent = model?.['represent']
  return isKindOf(represent as Elem | null, 'UMLClassifier') ? (represent as Elem) : model
}

/** Subject layout: a rectangle with the name compartment at the top; drawn behind ordinary views. */
export function layoutSubject(view: NodeView, ctx: LayoutContext): NodeLayout<SubjectData> {
  const shown = subjectShownElement(view.model)
  const style = styleOf(view)
  const form = stereotypeFormOf(view) === 'none' ? 'none' : 'label'
  const base = classifierNameMeasure(view, shown, style.font, ctx, form)
  const { name, minWidth } = fitName(view, base, ctx, (w) => Math.max(w, SUBJECT_MIN_SIZE.width), (width) => width - PAD * 2)
  const nameRectIn = (box: Rect): Rect => ({ left: box.left, top: box.top, width: box.width, height: name.height })
  return nodeLayout(view, {
    minWidth,
    minHeight: Math.max(SUBJECT_MIN_SIZE.height, name.height),
    style,
    zIndex: SUBJECT_Z_INDEX,
    data: (box) => ({ nameRect: nameRectIn(box), nameLines: arrangeNameCompartment(name, nameRectIn(box)) }),
    regions: (box) => nameRegion(shown, nameRectIn(box), name, style.font)
  })
}
