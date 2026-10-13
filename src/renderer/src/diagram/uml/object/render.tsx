/** SVG drawing of object-diagram nodes (from their layouts only). */
import type React from 'react'
import { SPACING, fmt, polygonPath, type Rect } from '../../core'
import type { NodeLayout, ViewStyle } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { InstanceData } from './layout'

function Line({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }): React.JSX.Element {
  return <line x1={fmt(x1)} y1={fmt(y1)} x2={fmt(x2)} y2={fmt(y2)} stroke={color} strokeWidth={1} />
}

/** Page glyph: a rectangle with a folded top-right corner. */
function PageIcon({ rect, style }: { rect: Rect; style: ViewStyle }): React.JSX.Element {
  const fold = Math.min(rect.width, rect.height) / 3
  const r = rect.left + rect.width
  const b = rect.top + rect.height
  return (
    <g>
      <path
        d={polygonPath([
          { x: rect.left, y: rect.top },
          { x: r - fold, y: rect.top },
          { x: r, y: rect.top + fold },
          { x: r, y: b },
          { x: rect.left, y: b }
        ])}
        fill={style.fillColor}
        stroke={style.lineColor}
        strokeWidth={1}
      />
      <path d={`M${fmt(r - fold)} ${fmt(rect.top)} V${fmt(rect.top + fold)} H${fmt(r)}`} fill="none" stroke={style.lineColor} strokeWidth={1} />
    </g>
  )
}

export function InstanceNode({ layout }: { layout: NodeLayout<InstanceData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.iconic && data.pageIcon) {
    return (
      <g>
        <PageIcon rect={data.pageIcon} style={style} />
        <SvgLines lines={data.nameLines} color={style.fontColor} />
      </g>
    )
  }
  const body = data.body
  const right = box.left + box.width
  const inset = SPACING.activeClassBarInset
  const outline = data.faces.length > 0 ? `${rectPath(body)} ${data.faces.map((f) => polygonPath(f)).join(' ')}` : rectPath(box)
  return (
    <g>
      <Shadow d={outline} show={style.showShadow} />
      <StyledRect r={body} style={style} />
      {data.faces.map((f, i) => (
        <path key={i} d={polygonPath(f)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      ))}
      {data.tabs.map((t, i) => (
        <StyledRect key={i} r={t} style={style} />
      ))}
      {data.active && (
        <>
          <Line x1={box.left + inset} y1={box.top} x2={box.left + inset} y2={box.top + box.height} color={style.lineColor} />
          <Line x1={right - inset} y1={box.top} x2={right - inset} y2={box.top + box.height} color={style.lineColor} />
        </>
      )}
      {data.pageIcon && <PageIcon rect={data.pageIcon} style={style} />}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      {data.slots && (
        <g>
          <Line x1={data.slots.rect.left} y1={data.slots.rect.top} x2={data.slots.rect.left + data.slots.rect.width} y2={data.slots.rect.top} color={style.lineColor} />
          <SvgLines lines={data.slots.rows} color={style.fontColor} />
        </g>
      )}
    </g>
  )
}
