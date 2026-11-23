/**
 * Edge notations of the RAD family: the thin state line (thread) and the thick interaction link.
 * Both are routed from the positions of their ends on every layout (stored points are a cache).
 */
import type { EdgeView } from '../../model'
import { LineStyle } from '../core'
import { buildEdgeLayout } from '../layout/edges'
import type { EdgeLayout, LayoutContext } from '../layout/types'
import type { EdgeNotation } from '../render/registry'
import { radLookOf } from './layout'
import { customColorsOf, radRoleOf, radSwatchOf, RAD_INK, type AccentUse } from './look'
import { InteractionLinkEdge, StateLineEdge, type RadEdgeData } from './render'
import { routeInteractionLink, routeStateLine } from './routing'

/**
 * Lines in the diagram style: dark unless the user picked a line color; in Colorful a thread takes
 * the color of its role.
 */
function styled(layout: EdgeLayout<RadEdgeData>, edge: EdgeView, ctx: LayoutContext, thread: boolean): EdgeLayout<RadEdgeData> {
  const custom = customColorsOf(edge).line
  const look = radLookOf(ctx)
  const swatch = thread && look.colorful && !custom ? radSwatchOf(radRoleOf(edge.tail)) : null
  const accent: AccentUse | null = swatch ? { swatch, line: true, fill: null, text: null } : null
  const style = custom ? layout.style : { ...layout.style, lineColor: RAD_INK }
  return { ...layout, style, data: { strokeWidth: layout.data?.strokeWidth ?? 1.5, accent } }
}

export const stateLineNotation: EdgeNotation<RadEdgeData> = {
  connectKind: 'RADStateLine',
  layout(edge: EdgeView, ctx) {
    const points = routeStateLine(edge, ctx)
    const loop = edge.model?.['loopBack'] === true
    const arrow = loop && edge.model?.['showArrow'] !== false
    const lines = radLookOf(ctx).g.lines
    const laid = buildEdgeLayout<RadEdgeData>(edge, ctx, {
      dash: 'solid',
      tailEnd: { style: 'flat' },
      headEnd: { style: arrow ? 'stickArrow' : 'flat' },
      zIndex: -0.5,
      labels: [],
      data: { strokeWidth: loop ? lines.loopBack : lines.thread },
      ...(points ? { routed: { points, lineStyle: LineStyle.Rectilinear } } : {})
    })
    // Thread lines carry no text in RAD.
    return { ...styled(laid, edge, ctx, true), nameless: true }
  },
  Render: StateLineEdge
}

export const interactionLinkNotation: EdgeNotation<RadEdgeData> = {
  connectKind: 'RADInteractionLink',
  layout(edge: EdgeView, ctx) {
    const points = routeInteractionLink(edge, ctx)
    const arrow = edge.model?.['showDirection'] === true
    const laid = buildEdgeLayout<RadEdgeData>(edge, ctx, {
      dash: 'solid',
      tailEnd: { style: 'flat' },
      headEnd: { style: arrow ? 'stickArrow' : 'flat' },
      zIndex: 1,
      labels: [],
      data: { strokeWidth: radLookOf(ctx).g.lines.interaction },
      ...(points ? { routed: { points, lineStyle: LineStyle.Oblique } } : {})
    })
    // Interaction lines carry no text in RAD.
    return { ...styled(laid, edge, ctx, false), nameless: true }
  },
  Render: InteractionLinkEdge
}
