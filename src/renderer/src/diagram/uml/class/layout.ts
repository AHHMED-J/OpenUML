/**
 * Measure/arrange of class-diagram nodes (spec 03 §4.1–4.2): classifier boxes (class, interface,
 * data type, primitive type, signal, enumeration) in label / decoration / icon forms, and packages.
 * Pure: reads the model, returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type UMLClassifierView } from '../../../model'
import { MIN_SIZES, SPACING, type Font, type Rect } from '../../core'
import {
  arrangeListCompartment,
  arrangeNameCompartment,
  measureListCompartment,
  measureNameCompartment,
  nameEditText,
  nameOf,
  nodeLayout,
  stereotypeName,
  styleOf,
  type ListCompartmentMeasure,
  type ListRow,
  type NameCompartmentMeasure
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import {
  attributeEditText,
  attributeText,
  classifierKeyword,
  classifierPropertyText,
  literalText,
  operationEditText,
  operationText,
  receptionText,
  type FeatureFormat
} from './strings'

export type CompartmentKind = 'literals' | 'attributes' | 'operations' | 'receptions'

export interface CompartmentLayout {
  readonly kind: CompartmentKind
  readonly rect: Rect
  readonly rows: readonly TextLine[]
}

export type StereotypeForm = 'none' | 'label' | 'decoration' | 'decoration-label' | 'icon' | 'icon-label'

export interface ClassifierData {
  /** `box`: canonical/decoration forms; `icon`: iconic form (no box). */
  readonly form: 'box' | 'icon'
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly CompartmentLayout[]
  readonly active: boolean
  /** Decoration icon (top-right) or the iconic-form icon. */
  readonly icon: { readonly kind: 'interface' | 'placeholder'; readonly rect: Rect } | null
}

const PAD = SPACING.compartmentPaddingLeft
const ICON = SPACING.decorationIconSize
const ICON_INSET = SPACING.decorationIconInset

function items(model: Elem, field: string): Elem[] {
  const list = model[field]
  return Array.isArray(list) ? (list as Elem[]) : []
}

export function stereotypeForm(view: UMLClassifierView): StereotypeForm {
  const v = view.stereotypeDisplay
  return v === 'none' || v === 'decoration' || v === 'decoration-label' || v === 'icon' || v === 'icon-label' ? v : 'label'
}

function rowFont(base: Font, italic: boolean): Font {
  return italic ? { ...base, style: base.style | 2 } : base
}

export interface Compartment {
  readonly kind: CompartmentKind
  readonly measure: ListCompartmentMeasure
}

/** Builds the visible list compartments of a classifier view. */
export function compartmentsOf(view: UMLClassifierView, model: Elem, font: Font, ctx: LayoutContext): Compartment[] {
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
  const add = (kind: CompartmentKind, rows: ListRow[]): void => {
    result.push({ kind, measure: measureListCompartment(rows, ctx.measurer) })
  }
  if (isKindOf(model, 'UMLEnumeration') && view['suppressLiterals'] !== true) {
    add(
      'literals',
      items(model, 'literals').map((lit) => ({
        text: literalText(lit, format),
        font,
        edit: { kind: 'literal', elementId: lit._id, classifierId },
        editText: nameEditText(lit)
      }))
    )
  }
  if (!view.suppressAttributes) {
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
  if (!view.suppressOperations) {
    add(
      'operations',
      items(model, 'operations').map((op) => ({
        text: operationText(op, format),
        font: rowFont(font, op['isAbstract'] === true),
        underline: op['isStatic'] === true,
        edit: { kind: 'operation', elementId: op._id, classifierId },
        editText: operationEditText(op)
      }))
    )
  }
  if (view.suppressReceptions === false) {
    add(
      'receptions',
      items(model, 'receptions').map((r) => ({
        text: receptionText(r, format),
        font,
        edit: { kind: 'name', elementId: r._id },
        editText: nameEditText(r)
      }))
    )
  }
  return result
}

/** Name compartment input of a classifier-like view. */
export function classifierNameMeasure(view: UMLClassifierView | NodeView, model: Elem | null, font: Font, ctx: LayoutContext, form: StereotypeForm): NameCompartmentMeasure {
  const showText = form === 'label' || form === 'decoration-label' || form === 'icon-label'
  const st = stereotypeName(model) || classifierKeyword(model)
  const ns = view['showNamespace'] === true && model?._parent ? `(from ${nameOf(model._parent)})` : ''
  return measureNameCompartment(
    {
      stereotype: showText ? st : '',
      name: nameOf(model),
      namespace: ns,
      property: view['showProperty'] === false || !model ? '' : classifierPropertyText(model),
      font,
      italicName: model?.['isAbstract'] === true
    },
    ctx.measurer
  )
}

/** Classifier node layout (box, decoration and iconic forms). */
export function layoutClassifier(view: NodeView, ctx: LayoutContext): NodeLayout<ClassifierData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = stereotypeForm(cv)
  const name = classifierNameMeasure(cv, model, font, ctx, form)
  const compartments = model ? compartmentsOf(cv, model, font, ctx) : []
  const active = model?.['isActive'] === true
  const iconKind: 'interface' | 'placeholder' = isKindOf(model, 'UMLInterface') ? 'interface' : 'placeholder'

  if (form === 'icon' || form === 'icon-label') {
    // Iconic form: the icon at the top center, the name compartment below, no box.
    const minWidth = Math.max(ICON, name.width)
    const minHeight = ICON + name.height
    return nodeLayout(view, {
      minWidth,
      minHeight,
      style,
      outline: iconKind === 'interface' ? 'ellipse' : 'rect',
      data: (box) => {
        const side = Math.max(ICON, Math.min(box.width, box.height - name.height))
        const iconRect = { left: box.left + (box.width - side) / 2, top: box.top, width: side, height: side }
        const nameRect = { left: box.left, top: box.top + side, width: box.width, height: name.height }
        return { form: 'icon', nameRect, nameLines: arrangeNameCompartment(name, nameRect), compartments: [], active: false, icon: { kind: iconKind, rect: iconRect } }
      },
      endpoint: (box) => {
        const side = Math.max(ICON, Math.min(box.width, box.height - name.height))
        return { box: { left: box.left + (box.width - side) / 2, top: box.top, width: side, height: side }, outline: iconKind === 'interface' ? 'ellipse' : 'rect' }
      },
      regions: (box) => {
        const side = Math.max(ICON, Math.min(box.width, box.height - name.height))
        return nameRegion(model, { left: box.left, top: box.top + side, width: box.width, height: name.height }, name, font)
      }
    })
  }

  const decoration = form === 'decoration' || form === 'decoration-label'
  const nameWidth = decoration ? name.width + ICON + PAD * 2 : name.width
  const nameHeight = decoration ? Math.max(name.height, ICON + PAD * 2) : name.height
  const minWidth = Math.max(nameWidth, ...compartments.map((c) => c.measure.width))
  const minHeight = nameHeight + compartments.reduce((h, c) => h + c.measure.height, 0)

  const arrange = (box: Rect): { data: ClassifierData; regions: EditRegion[] } => {
    const nameRect = { left: box.left, top: box.top, width: box.width, height: nameHeight }
    const nameLines = arrangeNameCompartment(name, nameRect)
    const regions: EditRegion[] = [...nameRegion(model, nameRect, name, font)]
    let y = box.top + nameHeight
    const laid: CompartmentLayout[] = compartments.map((c) => {
      const rect = { left: box.left, top: y, width: box.width, height: c.measure.height }
      y += c.measure.height
      const rows = arrangeListCompartment(c.measure, rect)
      for (const row of rows) {
        if (row.edit) regions.push({ box: { ...row.box, left: rect.left, width: rect.width }, target: row.edit, text: row.editText ?? row.text, font: row.font })
      }
      return { kind: c.kind, rect, rows: rows.map(({ edit: _e, editText: _t, ...line }) => line) }
    })
    const icon = decoration
      ? { kind: iconKind, rect: { left: box.left + box.width - ICON - ICON_INSET, top: box.top + ICON_INSET, width: ICON, height: ICON } }
      : null
    return { data: { form: 'box', nameRect, nameLines, compartments: laid, active, icon }, regions }
  }

  return nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions
  })
}

export function nameRegion(model: Elem | null, rect: Rect, m: NameCompartmentMeasure, font: Font): EditRegion[] {
  if (!model) return []
  const nameItem = m.items.find((i) => i.index === 1)
  return [{ box: rect, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: nameItem?.font ?? font }]
}

// ---------------------------------------------------------------------------------------------
// Package

export interface PackageData {
  readonly tab: Rect
  readonly body: Rect
  readonly nameLines: readonly TextLine[]
}

/** Package (and model) layout: tab 2/5 wide × 15 high, body below, name in the body's top area. */
export function layoutPackage(view: NodeView, ctx: LayoutContext): NodeLayout<PackageData> {
  const model = view.model
  const style = styleOf(view)
  const name = classifierNameMeasure(view, model, style.font, ctx, view['stereotypeDisplay'] === 'none' ? 'none' : 'label')
  const tabH = SPACING.packageTabHeight
  return nodeLayout(view, {
    minWidth: Math.max(MIN_SIZES.package.width, name.width),
    minHeight: Math.max(MIN_SIZES.package.height, tabH + name.height),
    style,
    data: (box) => {
      const tab = { left: box.left, top: box.top, width: Math.round(box.width * SPACING.packageTabWidthRatio), height: tabH }
      const body = { left: box.left, top: box.top + tabH - 1, width: box.width, height: box.height - tabH + 1 }
      return { tab, body, nameLines: arrangeNameCompartment(name, { ...body, height: name.height }) }
    },
    regions: (box) => nameRegion(model, { left: box.left, top: box.top + tabH - 1, width: box.width, height: name.height }, name, style.font)
  })
}
