/**
 * Draws a laid-out diagram (all top-level views in paint order). Used by the editor and by the
 * SVG/PNG exporters, so both produce the same drawing. View components are memoized on their
 * layout object, which the layout pass reuses while a view is unchanged. Layouts hold light canvas
 * colors; they are painted here for the canvas of the surrounding `CanvasContext`.
 */
import { memo } from 'react'
import type React from 'react'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../layout/types'
import { useCanvasPalette } from './canvasContext'
import { paintEdge, paintNode } from './paintLayout'
import { EdgeShape } from './primitives'
import { edgeRendererFor, nodeRendererFor } from './registry'

export const NodeItem = memo(function NodeItem({ layout }: { layout: NodeLayout }): React.JSX.Element {
  const Render = nodeRendererFor(layout.viewType)
  return (
    <g data-view-id={layout.viewId}>
      <Render layout={layout} />
    </g>
  )
})

export const EdgeItem = memo(function EdgeItem({ layout }: { layout: EdgeLayout }): React.JSX.Element {
  const Render = edgeRendererFor(layout.viewType)
  return <g data-view-id={layout.viewId}>{Render ? <Render layout={layout} /> : <EdgeShape layout={layout} />}</g>
})

export function DiagramContent({ layout }: { layout: DiagramLayout }): React.JSX.Element {
  const { mode } = useCanvasPalette()
  return (
    <g>
      {layout.order.map((id) => {
        const node = layout.nodes.get(id)
        if (node) return <NodeItem key={id} layout={paintNode(node, mode)} />
        const edge = layout.edges.get(id)
        return edge ? <EdgeItem key={id} layout={paintEdge(edge, mode)} /> : null
      })}
    </g>
  )
}
