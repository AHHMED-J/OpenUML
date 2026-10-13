/**
 * Component and artifact notation (spec 21 §5): the component box with its two tabs (label,
 * decoration and icon forms) and the artifact page icon. Pure: reads the model, returns layout data.
 */
import type { NodeView, UMLClassifierView } from '../../../model'
import { SPACING, type Point, type Rect } from '../../core'
import { arrangeNameCompartment, nodeLayout, styleOf } from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { classifierNameMeasure, compartmentsOf, nameRegion, stackCompartments, stereotypeForm, type CompartmentLayout, type StereotypeForm } from '../class/layout'

const PAD = SPACING.compartmentPaddingLeft
const ICON = SPACING.decorationIconSize
const ICON_INSET = SPACING.decorationIconInset

/** Offset of the component's main rectangle from the left edge of its box (the tabs stick out). */
const COMPONENT_TAB_OFFSET = 10
const COMPONENT_MIN = { width: 50, height: 45 } as const
const ARTIFACT_ICON_MIN = { width: 40, height: 50 } as const

export interface ComponentGlyph {
  /** The main rectangle of the component icon. */
  readonly main: Rect
  readonly tabs: readonly Rect[]
}

export interface ComponentData {
  readonly form: 'label' | 'decoration' | 'icon'
  /** The main rectangle (`form: 'icon'` and `'decoration'`: the box / glyph rectangle). */
  readonly main: Rect
  /** The two tabs of the label form (empty for decoration: see `glyph`). */
  readonly tabs: readonly Rect[]
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly CompartmentLayout[]
  /** The small component glyph (decoration form, top-right). */
  readonly glyph: ComponentGlyph | null
}

/** The tab rectangles of the label form for a box (20 × 10 at y+7 and y+27, over the left edge). */
export function componentTabs(box: Rect): Rect[] {
  return [
    { left: box.left, top: box.top + 7, width: 20, height: 10 },
    { left: box.left, top: box.top + 27, width: 20, height: 10 }
  ]
}

/** The 24 × 24 decoration glyph inside `icon` (scaled with its width). */
export function componentGlyph(icon: Rect): ComponentGlyph {
  const s = icon.width / ICON
  const r = (x: number, y: number, w: number, h: number): Rect => ({ left: icon.left + x * s, top: icon.top + y * s, width: w * s, height: h * s })
  return { main: r(9, 5, 13, 16), tabs: [r(6, 8, 7, 4), r(6, 14, 7, 4)] }
}

/** Display form of a component-like view. */
function formOf(view: UMLClassifierView, fallback: StereotypeForm): 'label' | 'decoration' | 'icon' {
  const f = view.stereotypeDisplay === undefined ? fallback : stereotypeForm(view)
  if (f === 'icon' || f === 'icon-label') return 'icon'
  if (f === 'decoration' || f === 'decoration-label') return 'decoration'
  return 'label'
}

function nameForm(form: 'label' | 'decoration' | 'icon', view: UMLClassifierView): StereotypeForm {
  const raw = stereotypeForm(view)
  if (form === 'label') return raw === 'none' ? 'none' : 'label'
  return raw
}

/** Component: label form (box + two tabs), decoration form (glyph top-right) and icon form. */
export function layoutComponent(view: NodeView, ctx: LayoutContext): NodeLayout<ComponentData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = formOf(cv, 'label')
  const name = classifierNameMeasure(cv, model, font, ctx, nameForm(form, cv))
  const compartments = model && form !== 'icon' ? compartmentsOf(cv, model, font, ctx) : []
  const listWidth = Math.max(0, ...compartments.map((c) => c.measure.width))
  const listHeight = compartments.reduce((h, c) => h + c.measure.height, 0)

  if (form === 'icon') {
    const minWidth = Math.max(COMPONENT_MIN.width, name.width)
    const minHeight = COMPONENT_MIN.height + name.height
    const iconOf = (box: Rect): Rect => {
      const h = Math.max(COMPONENT_MIN.height, box.height - name.height)
      const w = Math.min(box.width, Math.max(COMPONENT_MIN.width, (h * COMPONENT_MIN.width) / COMPONENT_MIN.height))
      return { left: box.left + (box.width - w) / 2, top: box.top, width: w, height: h }
    }
    const arrange = (box: Rect): ComponentData => {
      const icon = iconOf(box)
      const s = icon.width / COMPONENT_MIN.width
      const main = { left: icon.left + COMPONENT_TAB_OFFSET * s, top: icon.top, width: icon.width - COMPONENT_TAB_OFFSET * s, height: icon.height }
      const tabs = [
        { left: icon.left, top: icon.top + 6 * s, width: 20 * s, height: 10 * s },
        { left: icon.left, top: icon.top + 23 * s, width: 20 * s, height: 10 * s }
      ]
      const nameRect = { left: box.left, top: icon.top + icon.height, width: box.width, height: name.height }
      return { form: 'icon', main, tabs, nameLines: arrangeNameCompartment(name, nameRect), compartments: [], glyph: null }
    }
    return nodeLayout(view, {
      minWidth,
      minHeight,
      style,
      data: arrange,
      endpoint: (box) => ({ box: arrange(box).main, outline: 'rect' }),
      regions: (box) => nameRegion(model, { left: box.left, top: iconOf(box).top + iconOf(box).height, width: box.width, height: name.height }, name, font)
    })
  }

  const decoration = form === 'decoration'
  const arrange = (box: Rect): { data: ComponentData; regions: EditRegion[] } => {
    const regions: EditRegion[] = []
    const left = decoration ? box.left : box.left + COMPONENT_TAB_OFFSET
    const main = { left, top: box.top, width: box.left + box.width - left, height: box.height }
    // The name sits right of the tabs (label form) or left of the glyph (decoration form).
    const nameLeft = decoration ? box.left : box.left + 2 * COMPONENT_TAB_OFFSET
    const nameWidth = box.left + box.width - nameLeft - (decoration ? ICON + ICON_INSET : 0)
    const centered = compartments.length === 0
    const nameTop = centered ? box.top + Math.max(0, (box.height - name.height) / 2) : box.top
    const nameRect = { left: nameLeft, top: nameTop, width: nameWidth, height: name.height }
    regions.push(...nameRegion(model, nameRect, name, font))
    const laid = stackCompartments(compartments, main.left, main.width, box.top + name.height, regions)
    const glyph = decoration ? componentGlyph({ left: box.left + box.width - ICON - ICON_INSET, top: box.top + ICON_INSET, width: ICON, height: ICON }) : null
    return {
      data: { form: decoration ? 'decoration' : 'label', main, tabs: decoration ? [] : componentTabs(box), nameLines: arrangeNameCompartment(name, nameRect), compartments: laid, glyph },
      regions
    }
  }
  const nameMin = decoration ? name.width + ICON + ICON_INSET + PAD : name.width + 2 * COMPONENT_TAB_OFFSET
  const minWidth = Math.max(COMPONENT_MIN.width, nameMin, listWidth + (decoration ? 0 : COMPONENT_TAB_OFFSET))
  const minHeight = Math.max(COMPONENT_MIN.height, (decoration ? Math.max(name.height, ICON + 2 * ICON_INSET) : name.height) + listHeight)
  return nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions,
    // Edges attach to the main rectangle, not to the tabs.
    endpoint: (box) => ({ box: arrange(box).data.main, outline: 'rect' })
  })
}

// ---------------------------------------------------------------------------------------------
// Artifact

export interface ArtifactData {
  readonly form: 'icon' | 'box'
  /** Page icon (icon form: large, below the box top; decoration form: small, top-right). */
  readonly page: Rect | null
  readonly pagePolygon: readonly Point[]
  readonly pageFold: readonly Point[]
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly CompartmentLayout[]
}

/** Page outline and folded-corner triangle for an icon rectangle (`w` = icon width). */
export function pageShape(icon: Rect): { polygon: Point[]; fold: Point[] } {
  const x1 = icon.left
  const y1 = icon.top
  const x2 = icon.left + icon.width
  const y2 = icon.top + icon.height
  const w = icon.width
  return {
    polygon: [
      { x: x1, y: y1 },
      { x: x2 - 0.3 * w, y: y1 },
      { x: x2, y: y1 + 0.3 * w },
      { x: x2, y: y2 },
      { x: x1, y: y2 }
    ],
    fold: [
      { x: x2 - 0.3 * w, y: y1 },
      { x: x2 - 0.3 * w, y: y1 + 0.3 * w },
      { x: x2, y: y1 + 0.3 * w }
    ]
  }
}

/** Artifact: page icon with the name below (default), classifier box (label) or box with page glyph (decoration). */
export function layoutArtifact(view: NodeView, ctx: LayoutContext): NodeLayout<ArtifactData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = formOf(cv, 'icon')
  const name = classifierNameMeasure(cv, model, font, ctx, nameForm(form, cv))

  if (form === 'icon') {
    const iconOf = (box: Rect): Rect => {
      const h = Math.max(ARTIFACT_ICON_MIN.height, box.height - name.height)
      const w = Math.min(box.width, Math.max(ARTIFACT_ICON_MIN.width, Math.round(h * 0.8)))
      return { left: box.left + (box.width - w) / 2, top: box.top, width: w, height: h }
    }
    return nodeLayout(view, {
      minWidth: Math.max(name.width, ARTIFACT_ICON_MIN.width),
      minHeight: ARTIFACT_ICON_MIN.height + name.height,
      style,
      data: (box) => {
        const page = iconOf(box)
        const shape = pageShape(page)
        const nameRect = { left: box.left, top: page.top + page.height, width: box.width, height: name.height }
        return { form: 'icon', page, pagePolygon: shape.polygon, pageFold: shape.fold, nameLines: arrangeNameCompartment(name, nameRect), compartments: [] }
      },
      endpoint: (box) => ({ box: iconOf(box), outline: 'rect' }),
      regions: (box) => {
        const page = iconOf(box)
        return nameRegion(model, { left: box.left, top: page.top + page.height, width: box.width, height: name.height }, name, font)
      }
    })
  }

  const decoration = form === 'decoration'
  const compartments = model ? compartmentsOf(cv, model, font, ctx) : []
  const listWidth = Math.max(0, ...compartments.map((c) => c.measure.width))
  const listHeight = compartments.reduce((h, c) => h + c.measure.height, 0)
  const nameWidth = decoration ? name.width + ICON + 2 * PAD : name.width
  const nameHeight = decoration ? Math.max(name.height, ICON + 2 * PAD) : name.height
  const arrange = (box: Rect): { data: ArtifactData; regions: EditRegion[] } => {
    const nameRect = { left: box.left, top: box.top, width: box.width, height: nameHeight }
    const regions: EditRegion[] = [...nameRegion(model, nameRect, name, font)]
    const laid = stackCompartments(compartments, box.left, box.width, box.top + nameHeight, regions)
    let page: Rect | null = null
    let polygon: Point[] = []
    let fold: Point[] = []
    if (decoration) {
      page = { left: box.left + box.width - ICON - ICON_INSET + 3, top: box.top + ICON_INSET, width: 18, height: ICON }
      const shape = pageShape(page)
      polygon = shape.polygon
      fold = shape.fold
    }
    return { data: { form: 'box', page, pagePolygon: polygon, pageFold: fold, nameLines: arrangeNameCompartment(name, nameRect), compartments: laid }, regions }
  }
  return nodeLayout(view, {
    minWidth: Math.max(nameWidth, listWidth),
    minHeight: nameHeight + listHeight,
    style,
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions
  })
}
