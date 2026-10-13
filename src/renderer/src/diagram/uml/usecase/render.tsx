/** SVG drawing of use case diagram nodes (from their layouts only). */
import type React from 'react'
import { ellipsePath, fmt, type Rect } from '../../core'
import type { NodeLayout, ViewStyle } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import { stickFigure, type ActorData, type SubjectData, type UseCaseCompartmentLayout, type UseCaseData } from './layout'

function Segment({ s, color }: { s: readonly [number, number, number, number]; color: string }): React.JSX.Element {
  return <line x1={fmt(s[0])} y1={fmt(s[1])} x2={fmt(s[2])} y2={fmt(s[3])} stroke={color} strokeWidth={1} />
}

/** Stick figure (spec 03 §4.3): head filled with the fill color, body, arms and legs. */
function StickFigure({ rect, style }: { rect: Rect; style: ViewStyle }): React.JSX.Element {
  const g = stickFigure(rect)
  const c = style.lineColor
  return (
    <g>
      <path d={ellipsePath(g.head)} fill={style.fillColor} stroke={c} strokeWidth={1} />
      <Segment s={g.body} color={c} />
      <Segment s={g.arms} color={c} />
      <Segment s={g.leftLeg} color={c} />
      <Segment s={g.rightLeg} color={c} />
    </g>
  )
}

/** List compartments, each with a separator line at its top. */
function Compartments({ compartments, style }: { compartments: readonly UseCaseCompartmentLayout[]; style: ViewStyle }): React.JSX.Element {
  return (
    <>
      {compartments.map((c) => (
        <g key={c.kind}>
          <line
            x1={fmt(c.rect.left)}
            y1={fmt(c.rect.top)}
            x2={fmt(c.rect.left + c.rect.width)}
            y2={fmt(c.rect.top)}
            stroke={style.lineColor}
            strokeWidth={1}
          />
          <SvgLines lines={c.rows} color={style.fontColor} />
        </g>
      ))}
    </>
  )
}

export function UseCaseNode({ layout }: { layout: NodeLayout<UseCaseData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.form === 'box') {
    return (
      <g>
        <Shadow d={rectPath(box)} show={style.showShadow} />
        <StyledRect r={box} style={style} />
        <path d={ellipsePath(data.ellipse)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
        <SvgLines lines={data.nameLines} color={style.fontColor} />
        <Compartments compartments={data.compartments} style={style} />
      </g>
    )
  }
  const d = ellipsePath(data.ellipse)
  return (
    <g>
      <Shadow d={d} show={style.showShadow} />
      <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      <Compartments compartments={data.compartments} style={style} />
    </g>
  )
}

export function ActorNode({ layout }: { layout: NodeLayout<ActorData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.form === 'box') {
    return (
      <g>
        <Shadow d={rectPath(box)} show={style.showShadow} />
        <StyledRect r={box} style={style} />
        <StickFigure rect={data.figure} style={style} />
        <SvgLines lines={data.nameLines} color={style.fontColor} />
        <Compartments compartments={data.compartments} style={style} />
      </g>
    )
  }
  // The stick figure form has no shadow (spec 03 §4.3).
  return (
    <g>
      <StickFigure rect={data.figure} style={style} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

export function SubjectNode({ layout }: { layout: NodeLayout<SubjectData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}
