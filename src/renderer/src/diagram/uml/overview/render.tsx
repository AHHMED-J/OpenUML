/** SVG drawing of interaction overview nodes (from their layouts only). */
import type React from 'react'
import { fmt } from '../../core'
import type { DiagramLayout, NodeLayout } from '../../layout/types'
import { DiagramContent } from '../../render/DiagramContent'
import { FrameLabel } from '../../render/generic'
import { SvgText } from '../../render/primitives'
import type { OverviewInlineData, PreviewData } from './layout'

/** The previewed diagram rebuilt from its plain-data copy. */
function previewLayout(p: PreviewData): DiagramLayout {
  return {
    diagramId: 'preview',
    nodes: new Map(p.nodes.map((n) => [n.viewId, n])),
    edges: new Map(p.edges.map((e) => [e.viewId, e])),
    order: p.order,
    bounds: null
  }
}

export function OverviewInlineNode({ layout }: { layout: NodeLayout<OverviewInlineData> }): React.JSX.Element {
  const { box, style, data } = layout
  const p = data.preview
  return (
    <g>
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <FrameLabel label={data.label} fill={style.fillColor} line={style.lineColor} color={style.fontColor} />
      {p && (
        <g transform={`translate(${fmt(p.offset.x)} ${fmt(p.offset.y)}) scale(${p.scale}) translate(${fmt(-p.origin.x)} ${fmt(-p.origin.y)})`} pointerEvents="none">
          <DiagramContent layout={previewLayout(p)} />
        </g>
      )}
      {data.placeholder && <SvgText line={data.placeholder} color={style.fontColor} />}
    </g>
  )
}
