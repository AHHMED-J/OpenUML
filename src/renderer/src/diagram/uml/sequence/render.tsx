/** SVG drawing of sequence-diagram nodes (from their layouts only). */
import type React from 'react'
import { DASH, fmt, roundedRectPath, type Rect } from '../../core'
import type { NodeLayout, ViewStyle } from '../../layout/types'
import { FrameLabel } from '../../render/generic'
import { Shadow, StyledRect, SvgLine, SvgLines, SvgText, rectPath } from '../../render/primitives'
import { DESTRUCTION_HALF, type EndpointData, type FragmentData, type InteractionUseData, type LifelineData, type OrphanKind, type RoundedBoxData } from './layout'

/** Stick figure fitted into `r` (actor-typed lifelines). */
function ActorFigure({ r, style }: { r: Rect; style: ViewStyle }): React.JSX.Element {
  const cx = r.left + r.width / 2
  const head = r.height / 5
  const neck = r.top + head * 2
  const hip = r.top + r.height * 0.62
  const c = style.lineColor
  return (
    <g>
      <circle cx={fmt(cx)} cy={fmt(r.top + head)} r={fmt(head)} fill={style.fillColor} stroke={c} strokeWidth={1} />
      <SvgLine x1={cx} y1={neck} x2={cx} y2={hip} color={c} />
      <SvgLine x1={r.left} y1={neck + head * 0.6} x2={r.left + r.width} y2={neck + head * 0.6} color={c} />
      <SvgLine x1={cx} y1={hip} x2={r.left} y2={r.top + r.height} color={c} />
      <SvgLine x1={cx} y1={hip} x2={r.left + r.width} y2={r.top + r.height} color={c} />
    </g>
  )
}

export function LifelineNode({ layout }: { layout: NodeLayout<LifelineData> }): React.JSX.Element {
  const { style, data } = layout
  const h = data.header
  const x = data.lineX
  return (
    <g>
      <SvgLine x1={x} y1={data.lineTop + 1} x2={x} y2={data.lineBottom} color={style.lineColor} dash={DASH.dot} />
      {data.form === 'box' ? (
        <>
          <Shadow d={rectPath(h)} show={style.showShadow} />
          {data.multiInstance && <StyledRect r={{ ...h, left: h.left + 5, top: h.top + 5 }} style={style} />}
          <StyledRect r={h} style={style} />
          {data.active && (
            <>
              <SvgLine x1={h.left + 3} y1={h.top} x2={h.left + 3} y2={h.top + h.height} color={style.lineColor} />
              <SvgLine x1={h.left + h.width - 3} y1={h.top} x2={h.left + h.width - 3} y2={h.top + h.height} color={style.lineColor} />
            </>
          )}
        </>
      ) : (
        data.icon && <ActorFigure r={data.icon} style={style} />
      )}
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      {data.activations.map((a) => (
        <g key={a.messageId}>
          <Shadow d={rectPath(a.rect)} show={style.showShadow} />
          <StyledRect r={a.rect} style={style} />
        </g>
      ))}
      {data.destroyedAt !== null && (
        <>
          <SvgLine x1={x - DESTRUCTION_HALF} y1={data.destroyedAt - DESTRUCTION_HALF} x2={x + DESTRUCTION_HALF} y2={data.destroyedAt + DESTRUCTION_HALF} color={style.lineColor} />
          <SvgLine x1={x + DESTRUCTION_HALF} y1={data.destroyedAt - DESTRUCTION_HALF} x2={x - DESTRUCTION_HALF} y2={data.destroyedAt + DESTRUCTION_HALF} color={style.lineColor} />
        </>
      )}
    </g>
  )
}

export function CombinedFragmentNode({ layout }: { layout: NodeLayout<FragmentData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill="none" stroke={style.lineColor} strokeWidth={1} />
      <FrameLabel label={data.label} fill={style.fillColor} line={style.lineColor} color={style.fontColor} />
      {data.operands.map((o) => (
        <g key={o.viewId}>
          {o.separator && <SvgLine x1={o.rect.left} y1={o.rect.top} x2={o.rect.left + o.rect.width} y2={o.rect.top} color={style.lineColor} dash={DASH.operandSeparator} />}
          {o.guard && <SvgText line={o.guard} color={style.fontColor} />}
        </g>
      ))}
    </g>
  )
}

export function MessageEndpointNode({ layout }: { layout: NodeLayout<EndpointData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.kind === 'gate') return <StyledRect r={box} style={style} />
  return <circle cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} r={fmt(Math.min(box.width, box.height) / 2)} fill={style.lineColor} stroke={style.lineColor} strokeWidth={1} />
}

export function InteractionUseNode({ layout }: { layout: NodeLayout<InteractionUseData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Shadow d={rectPath(box)} show={style.showShadow} />
      <StyledRect r={box} style={style} />
      <FrameLabel label={data.label} fill={style.fillColor} line={style.lineColor} color={style.fontColor} />
      <SvgText line={data.nameLine} color={style.fontColor} />
    </g>
  )
}

export function RoundedLabelBoxNode({ layout }: { layout: NodeLayout<RoundedBoxData> }): React.JSX.Element {
  const { box, style, data } = layout
  const d = roundedRectPath(box, data.radius)
  return (
    <g>
      <Shadow d={d} show={style.showShadow} />
      <path d={d} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <SvgText line={data.line} color={style.fontColor} />
    </g>
  )
}

export function OrphanSubViewNode({ layout }: { layout: NodeLayout<{ readonly kind: OrphanKind }> }): React.JSX.Element {
  const { box, style, data } = layout
  if (data.kind === 'activation') return <StyledRect r={box} style={style} />
  if (data.kind === 'line') {
    const x = box.left + box.width / 2
    return <SvgLine x1={x} y1={box.top} x2={x} y2={box.top + box.height} color={style.lineColor} dash={DASH.dot} />
  }
  return <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill="none" stroke={style.lineColor} strokeDasharray={DASH.operandSeparator.join(' ')} />
}
