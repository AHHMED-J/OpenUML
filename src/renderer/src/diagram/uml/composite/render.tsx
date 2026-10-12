/** SVG drawing of composite-structure nodes (from their layouts only). */
import type React from 'react'
import { ellipsePath } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { CollaborationData, PartData, PortData } from './layout'

/** Dash pattern of parts (non-composite), collaborations and collaboration uses: 5 on / 5 off. */
const DASHED = '5 5'

export function PortNode({ layout }: { layout: NodeLayout<PortData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <StyledRect r={box} style={style} />
      <SvgLines lines={data.labels} color={style.fontColor} />
    </g>
  )
}

export function PartNode({ layout }: { layout: NodeLayout<PartData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <rect
        x={box.left}
        y={box.top}
        width={box.width}
        height={box.height}
        fill={style.fillColor}
        stroke={style.lineColor}
        strokeWidth={1}
        {...(data.composite ? {} : { strokeDasharray: DASHED })}
      />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

export function CollaborationNode({ layout }: { layout: NodeLayout<CollaborationData> }): React.JSX.Element {
  const { box, style, data } = layout
  const d = data.form === 'box' ? rectPath(box) : ellipsePath(box)
  return (
    <g>
      <Shadow d={d} show={style.showShadow} />
      <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} strokeDasharray={DASHED} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}
