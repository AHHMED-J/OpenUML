/**
 * Edge notations of the RAD family: the thin state line (thread) and the thick interaction link.
 * Both are routed from the positions of their ends on every layout (stored points are a cache).
 */
import type { EdgeView } from '../../model'
import { LineStyle } from '../core'
import { buildEdgeLayout } from '../layout/edges'
import type { EdgeNotation } from '../render/registry'
import { InteractionLinkEdge, StateLineEdge, type RadEdgeData } from './render'
import { routeInteractionLink, routeStateLine } from './routing'

/** State line (thread) width, loop-back width and interaction link width. */
const RAD_LINE_WIDTH = { thread: 1.5, loopBack: 1.8, interaction: 3 } as const

export const stateLineNotation: EdgeNotation<RadEdgeData> = {
  connectKind: 'RADStateLine',
  layout(edge: EdgeView, ctx) {
    const points = routeStateLine(edge, ctx)
    const loop = edge.model?.['loopBack'] === true
    const arrow = loop && edge.model?.['showArrow'] !== false
    return buildEdgeLayout<RadEdgeData>(edge, ctx, {
      dash: 'solid',
      tailEnd: { style: 'flat' },
      headEnd: { style: arrow ? 'stickArrow' : 'flat' },
      zIndex: -0.5,
      labels: [],
      data: { strokeWidth: loop ? RAD_LINE_WIDTH.loopBack : RAD_LINE_WIDTH.thread },
      ...(points ? { routed: { points, lineStyle: LineStyle.Rectilinear } } : {})
    })
  },
  Render: StateLineEdge
}

export const interactionLinkNotation: EdgeNotation<RadEdgeData> = {
  connectKind: 'RADInteractionLink',
  layout(edge: EdgeView, ctx) {
    const points = routeInteractionLink(edge, ctx)
    const arrow = edge.model?.['showDirection'] === true
    return buildEdgeLayout<RadEdgeData>(edge, ctx, {
      dash: 'solid',
      tailEnd: { style: 'flat' },
      headEnd: { style: arrow ? 'stickArrow' : 'flat' },
      zIndex: 1,
      labels: [],
      data: { strokeWidth: RAD_LINE_WIDTH.interaction },
      ...(points ? { routed: { points, lineStyle: LineStyle.Oblique } } : {})
    })
  },
  Render: InteractionLinkEdge
}
