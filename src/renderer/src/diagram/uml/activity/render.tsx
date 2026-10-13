/** SVG drawing of activity-diagram nodes (from their layouts only). */
import type React from 'react'
import { SPACING, SWIMLANE_LINE_WIDTH, diamondPoints, ellipsePath, fmt, polygonPath, polylinePath, roundedRectPath, type Point, type Rect } from '../../core'
import type { NodeLayout, TextLine } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, fontAttrs, rectPath } from '../../render/primitives'
import type { ActionData, ControlNodeData, ObjectNodeData, PinData, SwimlaneData } from './layout'

function Stroke({ points, color, width = 1 }: { points: readonly Point[]; color: string; width?: number }): React.JSX.Element {
  return <path d={polylinePath(points)} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" />
}

/** Hourglass: two triangles meeting at the center of `r`. */
function hourglassPath(r: Rect): string {
  const right = r.left + r.width
  const bottom = r.top + r.height
  return polygonPath([
    { x: r.left, y: r.top },
    { x: right, y: r.top },
    { x: r.left, y: bottom },
    { x: right, y: bottom }
  ])
}

export function ActionNode({ layout }: { layout: NodeLayout<ActionData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.shape === 'timeEvent' && data.icon) {
    const d = hourglassPath(data.icon)
    return (
      <g>
        <Shadow d={d} show={style.showShadow} />
        <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} strokeLinejoin="miter" />
        <SvgLines lines={data.nameLines} color={style.fontColor} />
      </g>
    )
  }
  const d = data.polygon.length > 0 ? polygonPath(data.polygon) : roundedRectPath(box, data.cornerRadius)
  return (
    <g>
      <Shadow d={d} show={style.showShadow} />
      <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      {data.rake.map((pts, i) => (
        <Stroke key={i} points={pts} color={style.lineColor} />
      ))}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

export function ObjectNode({ layout }: { layout: NodeLayout<ObjectNodeData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      <SvgLines lines={data.lines} color={style.fontColor} />
    </g>
  )
}

export function ControlNode({ layout }: { layout: NodeLayout<ControlNodeData> }): React.JSX.Element {
  const { box, style, data } = layout
  switch (data.shape) {
    case 'initial': {
      const d = ellipsePath(box)
      return (
        <g>
          <Shadow d={d} show={style.showShadow} />
          <path d={d} fill={style.lineColor} stroke={style.lineColor} strokeWidth={1} />
        </g>
      )
    }
    case 'activityFinal': {
      const inset = SPACING.activityFinalInset
      const inner = { left: box.left + inset, top: box.top + inset, width: box.width - inset * 2, height: box.height - inset * 2 }
      return (
        <g>
          <Shadow d={ellipsePath(box)} show={style.showShadow} />
          <path d={ellipsePath(box)} fill="none" stroke={style.lineColor} strokeWidth={1} />
          <path d={ellipsePath(inner)} fill={style.lineColor} stroke={style.lineColor} strokeWidth={1} />
        </g>
      )
    }
    case 'flowFinal': {
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const h = Math.round((Math.SQRT2 * box.width) / 4)
      const v = Math.round((Math.SQRT2 * box.height) / 4)
      return (
        <g>
          <Shadow d={ellipsePath(box)} show={style.showShadow} />
          <path d={ellipsePath(box)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
          <Stroke points={[{ x: cx - h, y: cy - v }, { x: cx + h, y: cy + v }]} color={style.lineColor} />
          <Stroke points={[{ x: cx + h, y: cy - v }, { x: cx - h, y: cy + v }]} color={style.lineColor} />
        </g>
      )
    }
    case 'decision': {
      const d = polygonPath(diamondPoints(box))
      return (
        <g>
          <Shadow d={d} show={style.showShadow} />
          <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} strokeLinejoin="miter" />
        </g>
      )
    }
    case 'fork': {
      const d = roundedRectPath(box, SPACING.forkJoinCornerRadius)
      return (
        <g>
          <Shadow d={d} show={style.showShadow} />
          <path d={d} fill={style.lineColor} stroke={style.lineColor} strokeWidth={1} />
        </g>
      )
    }
  }
}

export function PinNode({ layout }: { layout: NodeLayout<PinData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      {data.arrow && (
        <>
          <Stroke points={data.arrow.shaft} color={style.lineColor} />
          <Stroke points={data.arrow.head} color={style.lineColor} />
        </>
      )}
      <SvgLines lines={data.labels} color={style.fontColor} />
    </g>
  )
}

/** A text line rotated −90° about its box center (reads bottom to top). */
function RotatedText({ line, color }: { line: TextLine; color: string }): React.JSX.Element {
  const cx = line.box.left + line.box.width / 2
  const cy = line.box.top + line.box.height / 2
  return (
    <text
      x={fmt(cx)}
      y={fmt(cy)}
      transform={`rotate(-90 ${fmt(cx)} ${fmt(cy)})`}
      dominantBaseline="central"
      textAnchor="middle"
      fill={color}
      xmlSpace="preserve"
      {...fontAttrs(line.font)}
    >
      {line.text}
    </text>
  )
}

export function SwimlaneNode({ layout }: { layout: NodeLayout<SwimlaneData> }): React.JSX.Element {
  const { style, data } = layout
  const h = data.header
  return (
    <g>
      <rect x={fmt(h.left)} y={fmt(h.top)} width={fmt(h.width)} height={fmt(h.height)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SWIMLANE_LINE_WIDTH} />
      <Stroke points={data.border} color={style.lineColor} width={SWIMLANE_LINE_WIDTH} />
      {data.name && (data.vertical ? <SvgLines lines={[data.name]} color={style.fontColor} /> : <RotatedText line={data.name} color={style.fontColor} />)}
    </g>
  )
}
