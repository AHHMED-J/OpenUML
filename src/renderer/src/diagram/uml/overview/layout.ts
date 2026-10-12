/**
 * Interaction overview nodes (spec 28 §5): the reference node (a rectangle with a `ref`
 * pentagon tab and the referenced interaction's text) and the inline node (an `sd` frame holding a
 * scaled preview of the referenced sequence diagram). Control nodes and flows use the activity
 * notation unchanged. Pure: reads the model, returns layout data.
 */
import { isKindOf, type Diagram, type NodeView } from '../../../model'
import { MIN_SIZES, Z_INDEX, type Point, type Rect } from '../../core'
import { nameOf, nodeLayout, styleOf } from '../../layout/helpers'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { EdgeLayout, LayoutContext, NodeLayout, TextLine } from '../../layout/types'
import { layoutFrameLabel, type FrameLabelLayout } from '../../render/generic'
import { interactionUseText, referencedDiagram, referencedInteraction } from './analysis'

const TAB_TEXT_GAP = 10

export interface OverviewUseData {
  readonly label: FrameLabelLayout
  readonly nameLine: TextLine
}

/** Reference node: `ref` tab, name text 10 to the right of the tab. Minimum 80 × 30. */
export function layoutOverviewUse(view: NodeView, ctx: LayoutContext): NodeLayout<OverviewUseData> {
  const action = view.model
  const style = styleOf(view)
  const text = interactionUseText(action)
  const size = ctx.measurer.measure(text, style.font)
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, 'ref', '', style.font, ctx.measurer)
  const tabRight = Math.max(...probe.polygon.map((p) => p.x))
  const arrange = (box: Rect): OverviewUseData => {
    const label = layoutFrameLabel(box, 'ref', '', style.font, ctx.measurer)
    const right = Math.max(...label.polygon.map((p) => p.x))
    return {
      label,
      nameLine: {
        text,
        font: style.font,
        align: 'left',
        box: { left: right + TAB_TEXT_GAP, top: box.top + (label.bandHeight - size.height) / 2, width: Math.ceil(size.width), height: size.height }
      }
    }
  }
  const target = referencedInteraction(action)
  return nodeLayout(view, {
    minWidth: Math.max(MIN_SIZES.frame.width, Math.ceil(tabRight + TAB_TEXT_GAP + size.width + TAB_TEXT_GAP)),
    minHeight: Math.max(MIN_SIZES.frame.height, probe.bandHeight + 5),
    zIndex: Z_INDEX.message,
    style,
    data: arrange,
    regions: (box) => {
      const line = arrange(box).nameLine
      return target ? [{ box: { ...line.box, width: Math.max(line.box.width, 20) }, target: { kind: 'name', elementId: target._id }, text: nameOf(target), font: style.font }] : []
    }
  })
}

// =============================================================================================
// Inline node

/** A plain-data copy of a laid-out sequence diagram, sensitive to every change in it. */
export interface PreviewData {
  readonly scale: number
  /** Translation applied after scaling: preview origin in diagram coordinates. */
  readonly offset: Point
  /** Source origin (top-left of the previewed content). */
  readonly origin: Point
  readonly nodes: readonly NodeLayout[]
  readonly edges: readonly EdgeLayout[]
  readonly order: readonly string[]
}

export interface OverviewInlineData {
  readonly label: FrameLabelLayout
  readonly preview: PreviewData | null
  readonly placeholder: TextLine | null
}

/** Scale of a preview: min((w − 20) / contentW, (h − 40) / contentH, 1). */
export function previewScale(box: Rect, content: { width: number; height: number }): number {
  const sx = content.width > 0 ? (box.width - 20) / content.width : 1
  const sy = content.height > 0 ? (box.height - 40) / content.height : 1
  return Math.max(0.05, Math.min(sx, sy, 1))
}

/** Lays out the previewed sequence diagram without its own frame; null when it has no content. */
function previewOf(diagram: Diagram, box: Rect, ctx: LayoutContext): PreviewData | null {
  const inner = computeDiagramLayout(diagram, ctx.repository, ctx.measurer)
  const frameIds = new Set((diagram.ownedViews ?? []).filter((v) => isKindOf(v, 'UMLFrameView')).map((v) => v._id))
  const order = inner.order.filter((id) => !frameIds.has(id))
  if (order.length === 0) return null
  const nodes = order.map((id) => inner.nodes.get(id)).filter((n): n is NodeLayout => n !== undefined)
  const edges = order.map((id) => inner.edges.get(id)).filter((e): e is EdgeLayout => e !== undefined)
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  const grow = (r: Rect): void => {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.left + r.width)
    bottom = Math.max(bottom, r.top + r.height)
  }
  for (const n of nodes) grow(n.box)
  for (const e of edges) for (const p of e.points) grow({ left: p.x, top: p.y, width: 0, height: 0 })
  if (!Number.isFinite(left)) return null
  const scale = previewScale(box, { width: right - left, height: bottom - top })
  return { scale, offset: { x: box.left + 10, y: box.top + 30 }, origin: { x: left, y: top }, nodes, edges, order }
}

/** Inline node: an `sd` frame with the interaction's name and the scaled preview of its diagram. */
export function layoutOverviewInline(view: NodeView, ctx: LayoutContext): NodeLayout<OverviewInlineData> {
  const action = view.model
  const style = styleOf(view)
  const interaction = referencedInteraction(action)
  const name = nameOf(interaction) || nameOf(action)
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, 'sd', name, style.font, ctx.measurer)
  const diagram = referencedDiagram(action) as Diagram | null
  const placeholderSize = ctx.measurer.measure('(empty)', style.font)
  const arrange = (box: Rect): OverviewInlineData => {
    const label = layoutFrameLabel(box, 'sd', name, style.font, ctx.measurer)
    const preview = diagram ? previewOf(diagram, box, ctx) : null
    return {
      label,
      preview,
      placeholder: preview
        ? null
        : {
            text: '(empty)',
            font: style.font,
            align: 'center',
            box: { left: box.left, top: box.top + label.bandHeight + (box.height - label.bandHeight - placeholderSize.height) / 2, width: box.width, height: placeholderSize.height }
          }
    }
  }
  return nodeLayout(view, {
    minWidth: Math.max(MIN_SIZES.frame.width, probe.minWidth),
    minHeight: Math.max(MIN_SIZES.frame.height, probe.bandHeight + 10),
    zIndex: Z_INDEX.message,
    style,
    data: arrange,
    regions: (box) => {
      if (!interaction || !arrange(box).label.name) return []
      return [{ box: arrange(box).label.name?.box ?? box, target: { kind: 'name', elementId: interaction._id }, text: nameOf(interaction), font: style.font }]
    }
  })
}
