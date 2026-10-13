/**
 * Node (3D box) notation (spec 22 §5): label form with depth-10 faces, decoration form (plain box
 * with a glyph) and icon form. Pure: reads the model, returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type UMLClassifierView, type View } from '../../../model'
import { SPACING, type Point, type Rect } from '../../core'
import { arrangeNameCompartment, nodeLayout, styleOf } from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import type { ContainerBehavior } from '../../render/registry'
import { classifierNameMeasure, compartmentsOf, nameRegion, stackCompartments, stereotypeForm, type CompartmentLayout } from '../class/layout'

const ICON = SPACING.decorationIconSize
const ICON_INSET = SPACING.decorationIconInset
const PAD = SPACING.compartmentPaddingLeft

/** Depth of the 3D box. */
const NODE_DEPTH = 10
const NODE_MIN = { width: 45, height: 45 } as const

export interface NodeFaces {
  readonly front: Rect
  readonly top: readonly Point[]
  readonly side: readonly Point[]
}

/** The three faces of a node box in `box` (right/bottom are one unit inside the box). */
export function nodeFaces(box: Rect, d = NODE_DEPTH): NodeFaces {
  const r = box.left + box.width - 1
  const b = box.top + box.height - 1
  return {
    front: { left: box.left, top: box.top + d, width: r - d - box.left, height: b - box.top - d },
    top: [
      { x: box.left, y: box.top + d },
      { x: box.left + d, y: box.top },
      { x: r, y: box.top },
      { x: r - d, y: box.top + d }
    ],
    side: [
      { x: r, y: box.top },
      { x: r - d, y: box.top + d },
      { x: r - d, y: b },
      { x: r, y: b - d }
    ]
  }
}

/** The 24 × 24 decoration glyph of a node inside `icon` (front box, top and side faces). */
export function nodeGlyph(icon: Rect): NodeFaces {
  const x = icon.left
  const y = icon.top
  const s = icon.width / ICON
  const p = (dx: number, dy: number): Point => ({ x: x + dx * s, y: y + dy * s })
  return {
    front: { left: x + 3 * s, top: y + 10 * s, width: 16 * s, height: 10 * s },
    top: [p(3, 10), p(8, 5), p(24, 5), p(19, 10)],
    side: [p(24, 5), p(19, 10), p(19, 20), p(24, 15)]
  }
}

export interface NodeData {
  readonly form: 'box3d' | 'decoration' | 'icon'
  /** Faces to draw (the front face for the decoration form is the whole box). */
  readonly faces: NodeFaces | null
  /** Small glyph of the decoration form. */
  readonly glyph: NodeFaces | null
  readonly nameLines: readonly TextLine[]
  readonly compartments: readonly CompartmentLayout[]
}

function formOf(view: UMLClassifierView): 'box3d' | 'decoration' | 'icon' {
  const f = stereotypeForm(view)
  if (f === 'icon' || f === 'icon-label') return 'icon'
  if (f === 'decoration' || f === 'decoration-label') return 'decoration'
  return 'box3d'
}

export function layoutNodeBox(view: NodeView, ctx: LayoutContext): NodeLayout<NodeData> {
  const cv = view as UMLClassifierView
  const model = view.model
  const style = styleOf(view)
  const font = style.font
  const form = formOf(cv)
  const name = classifierNameMeasure(cv, model, font, ctx, form === 'box3d' ? (stereotypeForm(cv) === 'none' ? 'none' : 'label') : stereotypeForm(cv))

  if (form === 'icon') {
    const iconOf = (box: Rect): Rect => {
      const side = Math.max(NODE_MIN.width, Math.min(box.width, box.height - name.height))
      return { left: box.left + (box.width - side) / 2, top: box.top, width: side, height: side }
    }
    return nodeLayout(view, {
      minWidth: Math.max(NODE_MIN.width, name.width),
      minHeight: NODE_MIN.height + name.height,
      style,
      data: (box) => {
        const icon = iconOf(box)
        const nameRect = { left: box.left, top: icon.top + icon.height, width: box.width, height: name.height }
        return { form: 'icon', faces: nodeFaces(icon), glyph: null, nameLines: arrangeNameCompartment(name, nameRect), compartments: [] }
      },
      endpoint: (box) => ({ box: iconOf(box), outline: 'rect' }),
      regions: (box) => {
        const icon = iconOf(box)
        return nameRegion(model, { left: box.left, top: icon.top + icon.height, width: box.width, height: name.height }, name, font)
      }
    })
  }

  const compartments = model ? compartmentsOf(cv, model, font, ctx) : []
  const listWidth = Math.max(0, ...compartments.map((c) => c.measure.width))
  const listHeight = compartments.reduce((h, c) => h + c.measure.height, 0)
  const decoration = form === 'decoration'
  const nameWidth = decoration ? name.width + ICON + 2 * PAD : name.width
  const nameHeight = decoration ? Math.max(name.height, ICON + 2 * ICON_INSET) : name.height

  const arrange = (box: Rect): { data: NodeData; regions: EditRegion[] } => {
    const regions: EditRegion[] = []
    // Label form: content lives in the front face (below the top face, left of the side face).
    const content = decoration
      ? box
      : { left: box.left, top: box.top + NODE_DEPTH, width: box.width - NODE_DEPTH, height: box.height - NODE_DEPTH }
    const centered = compartments.length === 0
    const nh = decoration ? nameHeight : name.height
    const nameRect = {
      left: content.left,
      top: centered && !decoration ? content.top + Math.max(0, (content.height - nh) / 2) : content.top,
      width: decoration ? content.width - ICON - ICON_INSET : content.width,
      height: nh
    }
    regions.push(...nameRegion(model, nameRect, name, font))
    const laid: CompartmentLayout[] = stackCompartments(compartments, content.left, content.width, content.top + nh, regions)
    const glyph = decoration ? nodeGlyph({ left: box.left + box.width - ICON - ICON_INSET, top: box.top + ICON_INSET, width: ICON, height: ICON }) : null
    return {
      data: { form: decoration ? 'decoration' : 'box3d', faces: decoration ? null : nodeFaces(box), glyph, nameLines: arrangeNameCompartment(name, nameRect), compartments: laid },
      regions
    }
  }
  return nodeLayout(view, {
    minWidth: Math.max(NODE_MIN.width, nameWidth + (decoration ? 0 : NODE_DEPTH), listWidth + (decoration ? 0 : NODE_DEPTH)),
    minHeight: Math.max(NODE_MIN.height, nameHeight + listHeight + (decoration ? 0 : NODE_DEPTH)),
    style,
    data: (box) => arrange(box).data,
    regions: (box) => arrange(box).regions
  })
}

/**
 * Nodes visually contain classifiers, packages and instances; the child's model moves into the
 * node's `ownedElements` (nested nodes, artifacts and components live under the node).
 */
export const nodeContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return (
      childModel === null ||
      isKindOf(childModel, 'UMLClassifier') ||
      isKindOf(childModel, 'UMLPackage') ||
      isKindOf(childModel, 'UMLInstance')
    )
  },
  ownerFor(container: View, childModel: Elem | null) {
    const owner = container.model
    if (!owner || !childModel || owner === childModel) return null
    return { owner, field: 'ownedElements' }
  }
}
