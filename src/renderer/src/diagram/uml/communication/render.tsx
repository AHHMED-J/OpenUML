/** SVG drawing of communication-diagram nodes (from their layouts only). */
import type React from 'react'
import { dashArray, edgeEndShapes, fmt } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { EdgeLabel, EndDecorations, Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { CommLifelineData, CommMessageData } from './layout'

export function CommLifelineNode({ layout }: { layout: NodeLayout<CommLifelineData> }): React.JSX.Element {
  const { box, style, data } = layout
  const inset = 3
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      {data.multiInstance && <StyledRect r={{ ...box, left: box.left + 5, top: box.top + 5 }} style={style} />}
      <StyledRect r={box} style={style} />
      {data.active && (
        <>
          <line x1={fmt(box.left + inset)} y1={fmt(box.top)} x2={fmt(box.left + inset)} y2={fmt(box.top + box.height)} stroke={style.lineColor} strokeWidth={1} />
          <line x1={fmt(box.left + box.width - inset)} y1={fmt(box.top)} x2={fmt(box.left + box.width - inset)} y2={fmt(box.top + box.height)} stroke={style.lineColor} strokeWidth={1} />
        </>
      )}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

export function CommMessageNode({ layout }: { layout: NodeLayout<CommMessageData> }): React.JSX.Element {
  const { style, data } = layout
  const dash = dashArray(data.dash)
  const ends = edgeEndShapes([data.tail, data.head], { style: 'flat' }, data.headEnd)
  return (
    <g>
      <line
        x1={fmt(data.tail.x)}
        y1={fmt(data.tail.y)}
        x2={fmt(data.head.x)}
        y2={fmt(data.head.y)}
        stroke={style.lineColor}
        strokeWidth={1}
        {...(dash.length > 0 ? { strokeDasharray: dash.join(' ') } : {})}
      />
      <EndDecorations shapes={ends.head} lineColor={style.lineColor} />
      {data.labels.map((label, i) => (
        <EdgeLabel key={label.viewId ?? i} label={label} />
      ))}
    </g>
  )
}
