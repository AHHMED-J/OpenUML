/** SVG drawing of state machine nodes (from their layouts only). */
import type React from 'react'
import { DASH, SPACING, fmt, polygonPath, roundedRectPath } from '../../core'
import type { NodeLayout } from '../../layout/types'
import { Shadow, SvgLines, SvgText } from '../../render/primitives'
import type { ConnectionPointData, FinalStateData, PseudostateData, StateData } from './layout'

function Line({ x1, y1, x2, y2, color, dash }: { x1: number; y1: number; x2: number; y2: number; color: string; dash?: readonly number[] }): React.JSX.Element {
  return (
    <line
      x1={fmt(x1)}
      y1={fmt(y1)}
      x2={fmt(x2)}
      y2={fmt(y2)}
      stroke={color}
      strokeWidth={1}
      {...(dash && dash.length > 0 ? { strokeDasharray: dash.join(' ') } : {})}
    />
  )
}

export function StateNode({ layout }: { layout: NodeLayout<StateData> }): React.JSX.Element {
  const { box, style, data } = layout
  const d = roundedRectPath(box, data.cornerRadius)
  const right = box.left + box.width
  const mark = data.submachineMark
  return (
    <g>
      <Shadow d={d} show={style.showShadow} />
      <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      {data.separators.map((y) => (
        <Line key={y} x1={box.left} y1={y} x2={right} y2={y} color={style.lineColor} />
      ))}
      <SvgLines lines={data.activityLines} color={style.fontColor} />
      <SvgLines lines={data.transitionLines} color={style.fontColor} />
      {data.regions
        .filter((r) => r.dashedTop)
        .map((r) => (
          <Line key={r.elementId} x1={r.rect.left} y1={r.rect.top} x2={r.rect.left + r.rect.width} y2={r.rect.top} color={style.lineColor} dash={DASH.operandSeparator} />
        ))}
      {mark && (
        <g>
          <circle cx={fmt(mark.left.cx)} cy={fmt(mark.left.cy)} r={mark.radius} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
          <circle cx={fmt(mark.right.cx)} cy={fmt(mark.right.cy)} r={mark.radius} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
          <Line x1={mark.lineFrom.x} y1={mark.lineFrom.y} x2={mark.lineTo.x} y2={mark.lineTo.y} color={style.lineColor} />
        </g>
      )}
    </g>
  )
}

export function PseudostateNode({ layout }: { layout: NodeLayout<PseudostateData> }): React.JSX.Element {
  const { box, style, data } = layout
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const r = Math.min(box.width, box.height) / 2
  const line = style.lineColor
  const circleShadow = <Shadow d={`M${fmt(cx - r)} ${fmt(cy)} a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`} show={style.showShadow} />
  switch (data.shape) {
    case 'initial':
      return (
        <g>
          {circleShadow}
          <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={line} stroke={line} strokeWidth={1} />
        </g>
      )
    case 'junction':
      return (
        <g>
          {circleShadow}
          <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={line} stroke={line} strokeWidth={1} />
        </g>
      )
    case 'history':
      return (
        <g>
          {circleShadow}
          <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={style.fillColor} stroke={line} strokeWidth={1} />
          {data.text && <SvgText line={data.text} color={style.fontColor} />}
        </g>
      )
    case 'entryPoint':
      return (
        <g>
          {circleShadow}
          <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={style.fillColor} stroke={line} strokeWidth={1} />
        </g>
      )
    case 'exitPoint':
      return (
        <g>
          {circleShadow}
          <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={style.fillColor} stroke={line} strokeWidth={1} />
          <Cross cx={cx} cy={cy} arm={data.arm} color={line} />
        </g>
      )
    case 'terminate':
      return <Cross cx={cx} cy={cy} arm={data.arm} color={line} />
    case 'choice': {
      const pts = [
        { x: cx, y: box.top },
        { x: box.left + box.width, y: cy },
        { x: cx, y: box.top + box.height },
        { x: box.left, y: cy }
      ]
      const d = polygonPath(pts)
      return (
        <g>
          <Shadow d={d} show={style.showShadow} />
          <path d={d} fill={style.fillColor} stroke={line} strokeWidth={1} />
        </g>
      )
    }
    case 'bar': {
      const d = roundedRectPath(box, SPACING.forkJoinCornerRadius)
      return (
        <g>
          <Shadow d={d} show={style.showShadow} />
          <path d={d} fill={line} stroke={line} strokeWidth={1} />
        </g>
      )
    }
    default:
      return <g />
  }
}

function Cross({ cx, cy, arm, color }: { cx: number; cy: number; arm: number; color: string }): React.JSX.Element {
  return (
    <g>
      <Line x1={cx - arm} y1={cy - arm} x2={cx + arm} y2={cy + arm} color={color} />
      <Line x1={cx + arm} y1={cy - arm} x2={cx - arm} y2={cy + arm} color={color} />
    </g>
  )
}

export function FinalStateNode({ layout }: { layout: NodeLayout<FinalStateData> }): React.JSX.Element {
  const { box, style, data } = layout
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const r = Math.min(box.width, box.height) / 2
  return (
    <g>
      <Shadow d={`M${fmt(cx - r)} ${fmt(cy)} a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0 a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0`} show={style.showShadow} />
      <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(data.innerRadius)} fill={style.lineColor} stroke={style.lineColor} strokeWidth={1} />
    </g>
  )
}

export function ConnectionPointNode({ layout }: { layout: NodeLayout<ConnectionPointData> }): React.JSX.Element {
  const { box, style, data } = layout
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const r = Math.min(box.width, box.height) / 2
  const arm = Math.round((Math.SQRT2 * box.width) / 4)
  return (
    <g>
      <circle cx={fmt(cx)} cy={fmt(cy)} r={fmt(r)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      {data.hasExit && <Cross cx={cx} cy={cy} arm={arm} color={style.lineColor} />}
      {data.label && <SvgText line={data.label} color={style.fontColor} />}
    </g>
  )
}

export function EmptyNode(): React.JSX.Element {
  return <g />
}
