/**
 * Measure/arrange of object-diagram nodes (spec 23 §5): object boxes (underlined bold
 * `name: Type`, optional value line, slot compartment) and artifact / component / node
 * instances (their classifier shapes with the same instance label). Pure: reads the model,
 * returns layout data.
 */
import { isKindOf, type Elem, type NodeView } from '../../../model'
import { SPACING, type Font, type Point, type Rect } from '../../core'
import {
  arrangeListCompartment,
  arrangeNameCompartment,
  measureListCompartment,
  measureNameCompartment,
  nodeLayout,
  stereotypeName,
  styleOf,
  type ListRow
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { instanceEditText, instanceLabelText, slotEditText, slotText } from './strings'

export type InstanceShape = 'object' | 'artifact' | 'component' | 'node'

export interface SlotCompartmentLayout {
  readonly rect: Rect
  readonly rows: readonly TextLine[]
}

export interface InstanceData {
  readonly shape: InstanceShape
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
  readonly slots: SlotCompartmentLayout | null
  /** Object of an active class: two inner vertical bars. */
  readonly active: boolean
  /** Rectangle that is the main body (the front face of a node instance). */
  readonly body: Rect
  /** Extra outlines: node-instance faces, component-instance tabs. */
  readonly faces: ReadonlyArray<readonly Point[]>
  readonly tabs: readonly Rect[]
  /** Artifact page icon (iconic form or decoration), null otherwise. */
  readonly pageIcon: Rect | null
  readonly iconic: boolean
}

const PAD = SPACING.compartmentPaddingLeft
const NODE_DEPTH = 10
const TAB = { width: 12, height: 6, left: -6 }
const PAGE_ICON = { width: 18, height: 24 }

export function shapeOfView(viewType: string): InstanceShape {
  switch (viewType) {
    case 'UMLArtifactInstanceView':
      return 'artifact'
    case 'UMLComponentInstanceView':
      return 'component'
    case 'UMLNodeInstanceView':
      return 'node'
    default:
      return 'object'
  }
}

function slotRows(model: Elem | null, view: NodeView, font: Font): ListRow[] {
  const slots = model?.['slots']
  if (!Array.isArray(slots)) return []
  const format = {
    showVisibility: view['showVisibility'] !== false,
    showType: view['showType'] !== false,
    showProperty: view['showProperty'] !== false
  }
  return (slots as Elem[]).map((slot) => ({
    text: slotText(slot, format),
    font,
    edit: { kind: 'custom', elementId: slot._id, syntax: 'slot' } as const,
    editText: slotEditText(slot)
  }))
}

/** Layout of an object or an artifact / component / node instance. */
export function layoutInstance(view: NodeView, ctx: LayoutContext): NodeLayout<InstanceData> {
  const shape = shapeOfView(view._type)
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const display = view['stereotypeDisplay']
  const iconic = shape === 'artifact' && (display === 'icon' || display === 'icon-label')
  const value = typeof model?.['value'] === 'string' ? (model['value'] as string) : ''
  const showStereotype = display === 'label' || display === 'decoration-label' || display === 'icon-label' || display === undefined
  const name = measureNameCompartment(
    {
      stereotype: showStereotype ? stereotypeName(model) : '',
      name: instanceLabelText(model, view['showType'] !== false),
      namespace: value,
      font,
      underlineName: true
    },
    ctx.measurer
  )
  const rows = shape === 'object' ? slotRows(model, view, font) : []
  const slots = rows.length > 0 ? measureListCompartment(rows, ctx.measurer) : null
  const active = isKindOf(model?.['classifier'] as Elem | null, 'UMLClass') && (model?.['classifier'] as Elem)['isActive'] === true

  // Extra room needed by the shape around the name compartment.
  const extraW = shape === 'node' ? NODE_DEPTH : shape === 'component' ? -TAB.left : 0
  const extraH = shape === 'node' ? NODE_DEPTH : 0
  let minWidth = Math.max(name.width, slots?.width ?? 0) + extraW
  let minHeight = name.height + (slots?.height ?? 0) + extraH
  if (iconic) {
    minWidth = Math.max(name.width, PAGE_ICON.width + 10)
    minHeight = name.height + PAGE_ICON.height + 10
  } else if (shape === 'artifact') {
    minWidth += PAGE_ICON.width / 2 + PAD
  }

  const arrange = (box: Rect): { data: InstanceData; regions: EditRegion[] } => {
    let body = box
    const faces: Point[][] = []
    const tabs: Rect[] = []
    let pageIcon: Rect | null = null
    if (shape === 'node') {
      body = { left: box.left, top: box.top + NODE_DEPTH, width: box.width - NODE_DEPTH, height: box.height - NODE_DEPTH }
      const r = box.left + box.width
      faces.push([
        { x: body.left, y: body.top },
        { x: body.left + NODE_DEPTH, y: box.top },
        { x: r, y: box.top },
        { x: r - NODE_DEPTH, y: body.top }
      ])
      faces.push([
        { x: r - NODE_DEPTH, y: body.top },
        { x: r, y: box.top },
        { x: r, y: box.top + box.height - NODE_DEPTH },
        { x: r - NODE_DEPTH, y: box.top + box.height }
      ])
    } else if (shape === 'component') {
      tabs.push({ left: box.left + TAB.left, top: box.top + 10, width: TAB.width, height: TAB.height })
      tabs.push({ left: box.left + TAB.left, top: box.top + 10 + TAB.height + 6, width: TAB.width, height: TAB.height })
    }
    let nameRect: Rect
    let slotsRect: Rect | null = null
    if (iconic) {
      const iconLeft = box.left + (box.width - PAGE_ICON.width) / 2
      pageIcon = { left: iconLeft, top: box.top, width: PAGE_ICON.width, height: PAGE_ICON.height }
      nameRect = { left: box.left, top: box.top + PAGE_ICON.height + 10, width: box.width, height: name.height }
    } else {
      const inner = shape === 'component' ? { ...body, left: body.left + 4, width: body.width - 4 } : body
      const nameH = slots ? name.height : Math.min(name.height, inner.height)
      nameRect = slots ? { left: inner.left, top: inner.top, width: inner.width, height: nameH } : { left: inner.left, top: inner.top + (inner.height - nameH) / 2, width: inner.width, height: nameH }
      if (slots) slotsRect = { left: body.left, top: body.top + nameH, width: body.width, height: Math.max(slots.height, body.height - nameH) }
      if (shape === 'artifact') pageIcon = { left: box.left + box.width - PAGE_ICON.width / 2 - PAD - 4, top: box.top + 4, width: PAGE_ICON.width / 2 + 2, height: PAGE_ICON.height / 2 + 2 }
    }
    const regions: EditRegion[] = model
      ? [{ box: nameRect, target: { kind: 'custom', elementId: model._id, syntax: 'object' }, text: instanceEditText(model), font }]
      : []
    let slotLayout: SlotCompartmentLayout | null = null
    if (slots && slotsRect) {
      const laid = arrangeListCompartment(slots, slotsRect)
      for (const row of laid) {
        if (row.edit) regions.push({ box: { ...row.box, left: slotsRect.left, width: slotsRect.width }, target: row.edit, text: row.editText ?? row.text, font: row.font })
      }
      slotLayout = { rect: slotsRect, rows: laid.map(({ edit: _e, editText: _t, ...line }) => line) }
    }
    return {
      data: { shape, nameRect, nameLines: arrangeNameCompartment(name, nameRect), slots: slotLayout, active, body, faces, tabs, pageIcon, iconic },
      regions
    }
  }

  const layout = nodeLayout<InstanceData>(view, {
    minWidth,
    minHeight,
    style,
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions,
    ...(shape === 'component' ? {} : {})
  })
  const extra: Rect[] = []
  if (shape === 'component') extra.push({ left: layout.box.left + TAB.left, top: layout.box.top + 10, width: -TAB.left, height: 2 * TAB.height + 6 })
  return extra.length > 0 ? { ...layout, extraBounds: extra } : layout
}
