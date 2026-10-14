/** Red pulsing outline of the views highlighted from the Model Explorer (screen only, never exported). */
import type React from 'react'
import { useSyncExternalStore } from 'react'
import type { DiagramLayout } from '../layout/types'
import { highlightedViewIds, subscribeHighlight } from './highlight'

const PAD = 6

export function HighlightOverlay({ layout, zoom }: { layout: DiagramLayout | null; zoom: number }): React.JSX.Element | null {
  const viewIds = useSyncExternalStore(subscribeHighlight, highlightedViewIds, highlightedViewIds)
  if (!layout || viewIds.length === 0) return null
  const pad = PAD / zoom
  const width = 3 / zoom
  return (
    <g className="view-highlight" pointerEvents="none" data-highlight="true">
      {viewIds.map((id) => {
        const node = layout.nodes.get(id)
        if (node) {
          const b = node.box
          return (
            <rect
              key={id}
              x={b.left - pad}
              y={b.top - pad}
              width={b.width + 2 * pad}
              height={b.height + 2 * pad}
              rx={4 / zoom}
              fill="none"
              strokeWidth={width}
            />
          )
        }
        const edge = layout.edges.get(id)
        if (!edge || edge.points.length < 2) return null
        return <polyline key={id} points={edge.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={width * 2} />
      })}
    </g>
  )
}
