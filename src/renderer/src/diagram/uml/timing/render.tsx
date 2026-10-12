/** SVG drawing of timing diagram nodes (from their layouts only). */
import type React from 'react'
import { fmt } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { FrameLabel } from '../../render/generic'
import { StyledRect, SvgText } from '../../render/primitives'
import type { DurationConstraintData, TimeConstraintData, TimeSegmentData, TimeTickData, TimingFrameData, TimingLifelineData, TimingStateData } from './layout'

function Line({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }): React.JSX.Element {
  return <line x1={fmt(x1)} y1={fmt(y1)} x2={fmt(x2)} y2={fmt(y2)} stroke={color} strokeWidth={1} />
}

export function TimingFrameNode({ layout }: { layout: NodeLayout<TimingFrameData> }): React.JSX.Element {
  const { box, style } = layout
  return (
    <g>
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill="none" stroke={style.lineColor} strokeWidth={1} />
      <FrameLabel label={layout.data.label} fill={style.fillColor} line={style.lineColor} color={style.fontColor} />
    </g>
  )
}

export function TimingLifelineNode({ layout }: { layout: NodeLayout<TimingLifelineData> }): React.JSX.Element {
  const { box, style, data } = layout
  const nb = data.nameBox
  const cx = nb.left + nb.width / 2
  const cy = nb.top + nb.height / 2
  return (
    <g>
      <StyledRect r={box} style={{ ...style, fillColor: 'none' }} />
      <Line x1={box.left} y1={box.top + box.height} x2={box.left + box.width} y2={box.top + box.height} color={style.lineColor} />
      <g transform={`rotate(-90 ${fmt(cx)} ${fmt(cy)})`}>
        <SvgText line={data.name} color={style.fontColor} />
      </g>
    </g>
  )
}

export function TimingStateNode({ layout }: { layout: NodeLayout<TimingStateData> }): React.JSX.Element {
  return <SvgText line={layout.data.label} color={layout.style.fontColor} />
}

export function TimeSegmentNode({ layout }: { layout: NodeLayout<TimeSegmentData> }): React.JSX.Element {
  const { box, style, data } = layout
  const y = data.centerY
  return (
    <g>
      {data.step && <Line x1={data.step.x} y1={data.step.fromY} x2={data.step.x} y2={data.step.toY} color={style.lineColor} />}
      <Line x1={box.left} y1={y} x2={box.left + box.width + 1} y2={y} color={style.lineColor} />
    </g>
  )
}

export function TimeTickNode({ layout }: { layout: NodeLayout<TimeTickData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Line x1={box.left} y1={box.top} x2={box.left} y2={box.top + box.height} color={style.lineColor} />
      <SvgText line={data.text} color={style.fontColor} />
    </g>
  )
}

const ARROW_LENGTH = 8
const ARROW_HALF_WIDTH = 4

export function DurationConstraintNode({ layout }: { layout: NodeLayout<DurationConstraintData> }): React.JSX.Element {
  const { box, style, data } = layout
  const c = style.lineColor
  const right = box.left + box.width
  const bottom = box.top + box.height
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  if (data.horizontal) {
    const head = (x: number, dir: 1 | -1): string => `M${fmt(x)} ${fmt(cy)} L${fmt(x + dir * ARROW_LENGTH)} ${fmt(cy - ARROW_HALF_WIDTH)} L${fmt(x + dir * ARROW_LENGTH)} ${fmt(cy + ARROW_HALF_WIDTH)} Z`
    return (
      <g>
        <Line x1={box.left} y1={box.top} x2={box.left} y2={bottom} color={c} />
        <Line x1={right} y1={box.top} x2={right} y2={bottom} color={c} />
        <Line x1={box.left} y1={cy} x2={right} y2={cy} color={c} />
        <path d={head(box.left, 1)} fill={c} stroke={c} strokeWidth={1} />
        <path d={head(right, -1)} fill={c} stroke={c} strokeWidth={1} />
        <SvgText line={data.label} color={style.fontColor} />
      </g>
    )
  }
  const head = (y: number, dir: 1 | -1): string => `M${fmt(cx)} ${fmt(y)} L${fmt(cx - ARROW_HALF_WIDTH)} ${fmt(y + dir * ARROW_LENGTH)} L${fmt(cx + ARROW_HALF_WIDTH)} ${fmt(y + dir * ARROW_LENGTH)} Z`
  return (
    <g>
      <Line x1={box.left} y1={box.top} x2={right} y2={box.top} color={c} />
      <Line x1={box.left} y1={bottom} x2={right} y2={bottom} color={c} />
      <Line x1={cx} y1={box.top} x2={cx} y2={bottom} color={c} />
      <path d={head(box.top, 1)} fill={c} stroke={c} strokeWidth={1} />
      <path d={head(bottom, -1)} fill={c} stroke={c} strokeWidth={1} />
      <SvgText line={data.label} color={style.fontColor} />
    </g>
  )
}

export function TimeConstraintNode({ layout }: { layout: NodeLayout<TimeConstraintData> }): React.JSX.Element {
  return <SvgText line={layout.data.line} color={layout.style.fontColor} />
}
