/** SVG drawing of component and artifact nodes (from their layouts only). */
import type React from 'react'
import { fmt, polygonPath, type Rect } from '../../core'
import type { NodeLayout, ViewStyle } from '../../layout/types'
import { Shadow, StyledRect, SvgLines, rectPath } from '../../render/primitives'
import type { ArtifactData, ComponentData } from './layout'

function Divider({ rect, color }: { rect: Rect; color: string }): React.JSX.Element {
  return <line x1={fmt(rect.left)} y1={fmt(rect.top)} x2={fmt(rect.left + rect.width)} y2={fmt(rect.top)} stroke={color} strokeWidth={1} />
}

export function ComponentNode({ layout }: { layout: NodeLayout<ComponentData> }): React.JSX.Element {
  const { style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(data.main)} show={style.showShadow} />
      <StyledRect r={data.main} style={style} />
      {data.tabs.map((tab, i) => (
        <StyledRect key={i} r={tab} style={style} />
      ))}
      {data.glyph && <GlyphDrawing glyph={data.glyph} style={style} />}
      {data.compartments.map((c) => (
        <g key={c.kind}>
          <Divider rect={c.rect} color={style.lineColor} />
          <SvgLines lines={c.rows} color={style.fontColor} />
        </g>
      ))}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}

function GlyphDrawing({ glyph, style }: { glyph: NonNullable<ComponentData['glyph']>; style: ViewStyle }): React.JSX.Element {
  return (
    <g>
      <StyledRect r={glyph.main} style={style} />
      {glyph.tabs.map((tab, i) => (
        <StyledRect key={i} r={tab} style={style} />
      ))}
    </g>
  )
}

export function ArtifactNode({ layout }: { layout: NodeLayout<ArtifactData> }): React.JSX.Element {
  const { box, style, data } = layout
  const page = data.page && (
    <g>
      <path d={polygonPath(data.pagePolygon)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <path d={polygonPath(data.pageFold)} fill="none" stroke={style.lineColor} strokeWidth={1} />
    </g>
  )
  if (data.form === 'icon') {
    return (
      <g>
        {data.pagePolygon.length > 0 && <Shadow d={polygonPath(data.pagePolygon)} show={style.showShadow} />}
        {page}
        <SvgLines lines={data.nameLines} color={style.fontColor} />
      </g>
    )
  }
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      {page}
      {data.compartments.map((c) => (
        <g key={c.kind}>
          <Divider rect={c.rect} color={style.lineColor} />
          <SvgLines lines={c.rows} color={style.fontColor} />
        </g>
      ))}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}
