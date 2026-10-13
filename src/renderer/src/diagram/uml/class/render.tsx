/** SVG drawing of class-diagram nodes (from their layouts only). */
import type React from 'react'
import { SPACING, ellipsePath, type Rect } from '../../core'
import type { NodeLayout, ViewStyle } from '../../layout/types'
import { Shadow, StyledRect, SvgLine, SvgLines, rectPath } from '../../render/primitives'
import type { ClassifierData, PackageData } from './layout'

/** Stereotype icon: interface ball, or the generic placeholder (rectangle with both diagonals). */
export function ClassifierIcon({ kind, rect, style, inset = 0 }: { kind: 'interface' | 'placeholder'; rect: Rect; style: ViewStyle; inset?: number }): React.JSX.Element {
  const r = { left: rect.left + inset, top: rect.top + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 }
  if (kind === 'interface') return <path d={ellipsePath(r)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
  const right = r.left + r.width
  const bottom = r.top + r.height
  return (
    <g>
      <StyledRect r={r} style={style} />
      <SvgLine x1={r.left} y1={r.top} x2={right} y2={bottom} color={style.lineColor} />
      <SvgLine x1={right} y1={r.top} x2={r.left} y2={bottom} color={style.lineColor} />
    </g>
  )
}

export function ClassifierNode({ layout }: { layout: NodeLayout<ClassifierData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.form === 'icon') {
    const icon = data.icon
    return (
      <g>
        {icon && icon.kind === 'interface' && <Shadow d={ellipsePath(icon.rect)} show={style.showShadow} />}
        {icon && <ClassifierIcon kind={icon.kind} rect={icon.rect} style={style} />}
        <SvgLines lines={data.nameLines} color={style.fontColor} />
      </g>
    )
  }
  const right = box.left + box.width
  const inset = SPACING.activeClassBarInset
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      {data.active && (
        <>
          <SvgLine x1={box.left + inset} y1={box.top} x2={box.left + inset} y2={box.top + box.height} color={style.lineColor} />
          <SvgLine x1={right - inset} y1={box.top} x2={right - inset} y2={box.top + box.height} color={style.lineColor} />
        </>
      )}
      {data.icon && <ClassifierIcon kind={data.icon.kind} rect={data.icon.rect} style={style} inset={data.icon.kind === 'interface' ? 3 : 0} />}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      {data.compartments.map((c) => (
        <g key={c.kind}>
          <SvgLine x1={c.rect.left} y1={c.rect.top} x2={c.rect.left + c.rect.width} y2={c.rect.top} color={style.lineColor} />
          <SvgLines lines={c.rows} color={style.fontColor} />
        </g>
      ))}
    </g>
  )
}

export function PackageNode({ layout }: { layout: NodeLayout<PackageData> }): React.JSX.Element {
  const { style, data } = layout
  return (
    <g>
      <Shadow d={`${rectPath(data.tab)} ${rectPath(data.body)}`} show={style.showShadow} />
      <StyledRect r={data.tab} style={style} />
      <StyledRect r={data.body} style={style} />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
    </g>
  )
}
