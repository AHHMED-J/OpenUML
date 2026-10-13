/**
 * Measure/arrange of composite-structure nodes (spec 25 §5): ports (14 × 14 squares glued to the
 * border of their host, with a floating `name: Type[mult]` label), parts (solid outline for a
 * composite attribute, dashed otherwise), collaborations and collaboration uses (dashed
 * ellipses). Pure: reads the model, returns layout data.
 */
import { PORT_SIZE, isKindOf, type Elem, type NodeView, type View } from '../../../model'
import { NODE_LABEL_DEFAULTS, placeNodeLabel, type Font, type Point, type Rect } from '../../core'
import {
  arrangeNameCompartment,
  measureNameCompartment,
  nameEditText,
  nameOf,
  nodeLayout,
  stereotypeName,
  styleOf
} from '../../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { nodeNotationFor } from '../../render/registry'
import { collaborationUseText, typedFeatureText } from './strings'


// =============================================================================================
// Port

export type PortSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Point of `host`'s border where a port dragged to `p` sits: for a point outside the host, the
 * crossing of the border with the ray from the host's center through `p` (axis-aligned drags
 * therefore project orthogonally); for a point inside, the nearest of the four border crossings.
 */
export function snapToBorder(host: Rect, p: Point, outline: 'rect' | 'ellipse' = 'rect'): { point: Point; side: PortSide } {
  const cx = host.left + host.width / 2
  const cy = host.top + host.height / 2
  const right = host.left + host.width
  const bottom = host.top + host.height
  const inside = p.x > host.left && p.x < right && p.y > host.top && p.y < bottom
  if (inside && outline === 'rect') {
    const d = { left: p.x - host.left, right: right - p.x, top: p.y - host.top, bottom: bottom - p.y }
    const side = (['top', 'right', 'bottom', 'left'] as PortSide[]).reduce((a, b) => (d[b] < d[a] ? b : a))
    const point =
      side === 'left' ? { x: host.left, y: p.y } : side === 'right' ? { x: right, y: p.y } : side === 'top' ? { x: p.x, y: host.top } : { x: p.x, y: bottom }
    return { point, side }
  }
  const dx = p.x - cx
  const dy = p.y - cy
  if (dx === 0 && dy === 0) return { point: { x: cx, y: host.top }, side: 'top' }
  const hw = host.width / 2
  const hh = host.height / 2
  // Scale the direction from the center until it reaches the border.
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy)
  const t = outline === 'ellipse' ? 1 / Math.hypot(dx / hw, dy / hh) : Math.min(tx, ty)
  const point = { x: cx + dx * t, y: cy + dy * t }
  const side: PortSide = Math.abs(dx) * hh >= Math.abs(dy) * hw ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom'
  return { point, side }
}

/**
 * Edit region of a port or part: the `name: Type[mult]` it shows (with stereotype and
 * non-public visibility), committed through the typed-name syntax so type and multiplicity apply.
 */
function typedFeatureRegion(model: Elem, box: Rect, font: Font): EditRegion {
  const text = nameEditText(model) + typedFeatureText(model).slice(nameOf(model).length)
  return { box, target: { kind: 'typedName', elementId: model._id }, text, font }
}

export interface PortData {
  readonly side: PortSide | null
  readonly labels: readonly TextLine[]
}

/** The view hosting a port view: its container, else the diagram view showing the port's owner. */
function portHostView(view: NodeView, ctx: LayoutContext): View | null {
  const container = view.containerView ?? null
  if (container) return container
  const owner = view.model?._parent
  if (!owner) return null
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v !== view && isKindOf(v, 'NodeView') && v.visible !== false && v.model && (v.model === owner || (v.model['type'] === owner))) return v as View
  }
  return null
}

function hostLayout(host: View, ctx: LayoutContext): { box: Rect; outline: 'rect' | 'ellipse' } | null {
  let laid: NodeLayout | undefined = ctx.nodeLayout(host._id)
  if (!laid && isKindOf(host, 'NodeView')) {
    try {
      laid = nodeNotationFor(host).layout(host as NodeView, ctx)
    } catch {
      return null
    }
  }
  return laid ? { box: laid.box, outline: laid.outline === 'ellipse' ? 'ellipse' : 'rect' } : null
}

function polar(label: unknown, defaults: { alpha: number; distance: number }): { alpha: number; distance: number } {
  const l = label as View | null | undefined
  const alpha = typeof l?.['alpha'] === 'number' && Number.isFinite(l['alpha']) ? (l['alpha'] as number) : defaults.alpha
  const distance = typeof l?.['distance'] === 'number' && Number.isFinite(l['distance']) ? (l['distance'] as number) : defaults.distance
  return { alpha, distance }
}

function labelShown(label: unknown, fallback: boolean): boolean {
  const l = label as View | null | undefined
  return l ? l.visible !== false : fallback
}

/** Port layout: a fixed 14 × 14 square on the host's border plus its floating labels. */
export function layoutPort(view: NodeView, ctx: LayoutContext): NodeLayout<PortData> {
  const model = view.model
  const style = styleOf(view)
  const stored = { left: view.left ?? 0, top: view.top ?? 0, width: PORT_SIZE, height: PORT_SIZE }
  const host = portHostView(view, ctx)
  const hb = host ? hostLayout(host, ctx) : null
  let box: Rect = stored
  let side: PortSide | null = null
  if (hb) {
    const snap = snapToBorder(hb.box, { x: stored.left + PORT_SIZE / 2, y: stored.top + PORT_SIZE / 2 }, hb.outline)
    side = snap.side
    box = { left: Math.round(snap.point.x - PORT_SIZE / 2), top: Math.round(snap.point.y - PORT_SIZE / 2), width: PORT_SIZE, height: PORT_SIZE }
  }

  const labels: TextLine[] = []
  const regions: EditRegion[] = []
  const text = typedFeatureText(model, {
    showVisibility: view['showVisibility'] === true,
    showType: view['showType'] !== false,
    showMultiplicity: view['showMultiplicity'] !== false
  })
  const underline = model?.['isStatic'] === true
  if (text && labelShown(view['nameLabel'], true)) {
    const s = ctx.measurer.measure(text, style.font)
    const lb = placeNodeLabel(box, polar(view['nameLabel'], NODE_LABEL_DEFAULTS.name), { width: Math.ceil(s.width), height: s.height })
    labels.push({ text, font: style.font, align: 'center', box: lb, underline })
    if (model) regions.push(typedFeatureRegion(model, lb, style.font))
  }
  const st = stereotypeName(model)
  if (st && labelShown(view['stereotypeLabel'], false)) {
    const stText = `«${st}»`
    const s = ctx.measurer.measure(stText, style.font)
    labels.push({
      text: stText,
      font: style.font,
      align: 'center',
      box: placeNodeLabel(box, polar(view['stereotypeLabel'], NODE_LABEL_DEFAULTS.stereotype), { width: Math.ceil(s.width), height: s.height })
    })
  }
  if (model) regions.push(typedFeatureRegion(model, box, style.font))

  const positioned = { ...view, left: box.left, top: box.top, width: PORT_SIZE, height: PORT_SIZE, autoResize: false } as NodeView
  return nodeLayout(positioned, {
    minWidth: PORT_SIZE,
    minHeight: PORT_SIZE,
    sizable: 'none',
    style,
    ...(labels.length > 0 ? { extraBounds: labels.map((l) => l.box) } : {}),
    data: { side, labels },
    regions
  })
}

// =============================================================================================
// Part

export interface PartData {
  readonly nameRect: Rect
  readonly nameLines: readonly TextLine[]
  /** Solid outline for a composite attribute, dashed otherwise. */
  readonly composite: boolean
}

/** Part layout: a rectangle with the `name: Type[mult]` name compartment on top. */
export function layoutPart(view: NodeView, ctx: LayoutContext): NodeLayout<PartData> {
  const model = view.model
  const style = styleOf(view)
  const text = typedFeatureText(model, {
    showVisibility: view['showVisibility'] === true,
    showType: view['showType'] !== false,
    showMultiplicity: view['showMultiplicity'] !== false
  })
  const name = measureNameCompartment({ name: text, font: style.font, underlineName: model?.['isStatic'] === true }, ctx.measurer)
  const composite = !isKindOf(model, 'UMLAttribute') || model['aggregation'] === 'composite'
  return nodeLayout(view, {
    minWidth: name.width,
    minHeight: name.height,
    style,
    data: (box) => {
      const nameRect = { left: box.left, top: box.top, width: box.width, height: name.height }
      return { nameRect, nameLines: arrangeNameCompartment(name, nameRect), composite }
    },
    regions: (box) => (model ? [typedFeatureRegion(model, { left: box.left, top: box.top, width: box.width, height: name.height }, style.font)] : [])
  })
}

// =============================================================================================
// Collaboration and collaboration use

const COLLABORATION_MIN = { width: 70, height: 32 } as const

export interface CollaborationData {
  readonly form: 'ellipse' | 'box'
  readonly nameLines: readonly TextLine[]
}

function layoutDashedEllipse(view: NodeView, ctx: LayoutContext, label: string, model: Elem | null): NodeLayout<CollaborationData> {
  const style = styleOf(view)
  const display = view['stereotypeDisplay']
  const box = display === 'decoration' || display === 'decoration-label'
  const name = measureNameCompartment({ stereotype: display === 'none' ? '' : stereotypeName(model), name: label, font: style.font }, ctx.measurer)
  const minWidth = box ? name.width : Math.max(Math.floor(Math.SQRT2 * name.width), COLLABORATION_MIN.width)
  const minHeight = box ? name.height : Math.max(Math.floor(Math.SQRT2 * name.height), COLLABORATION_MIN.height)
  return nodeLayout(view, {
    minWidth,
    minHeight,
    outline: box ? 'rect' : 'ellipse',
    style,
    data: (b) => {
      const rect = box ? b : { ...b, top: b.top + (b.height - name.height) / 2, height: name.height }
      return { form: box ? 'box' : 'ellipse', nameLines: arrangeNameCompartment(name, box ? { ...b, height: name.height } : rect) }
    },
    regions: (b) =>
      model ? [{ box: { left: b.left, top: b.top + (b.height - name.height) / 2, width: b.width, height: name.height }, target: { kind: 'name', elementId: model._id }, text: nameEditText(model), font: style.font }] : []
  })
}

export function layoutCollaboration(view: NodeView, ctx: LayoutContext): NodeLayout<CollaborationData> {
  return layoutDashedEllipse(view, ctx, nameOf(view.model), view.model)
}

export function layoutCollaborationUse(view: NodeView, ctx: LayoutContext): NodeLayout<CollaborationData> {
  return layoutDashedEllipse(view, ctx, collaborationUseText(view.model), view.model)
}
