/** SVG drawing of IDEF0 nodes and arrows, from their layouts only (also used by export). */
import type React from 'react'
import { edgeEndShapes, fmt, polylinePath, roundedPolylinePath } from '../core'
import type { EdgeLayout, NodeLayout } from '../layout/types'
import { EdgeLabel, EndDecorations, SvgLines, SvgText } from '../render/primitives'
import type { ArrowData } from './edges'
import { PENDING_HANDLE, type FrameData, type FunctionData, type NoteData, type PortData } from './layout'
import { IDEF0_STYLE } from './geometry'

/** Color of a boundary port that stands for no parent arrow. */
const UNLINKED_COLOR = '#d97706'

export function FunctionNode({ layout }: { layout: NodeLayout<FunctionData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <rect
        x={fmt(box.left)}
        y={fmt(box.top)}
        width={fmt(box.width)}
        height={fmt(box.height)}
        fill={style.fillColor}
        stroke={style.lineColor}
        strokeWidth={data.lineWidth}
      />
      <SvgLines lines={data.nameLines} color={style.fontColor} />
      <SvgText line={data.numberLine} color={style.fontColor} />
      {data.dreLine && <SvgText line={data.dreLine} color={style.fontColor} />}
    </g>
  )
}

export function PortNode({ layout }: { layout: NodeLayout<PortData> }): React.JSX.Element {
  const { style, data } = layout
  const color = data.unlinked ? UNLINKED_COLOR : style.lineColor
  const stub = data.pending
  return (
    <g>
      {stub && (
        // A pending arrow: dashed stub from the frame edge, round handle at its free end, parent arrow name beside it.
        <g className="idef0-pending">
          <line x1={fmt(data.anchor.x)} y1={fmt(data.anchor.y)} x2={fmt(stub.handle.x)} y2={fmt(stub.handle.y)} stroke={stub.color} strokeWidth={IDEF0_STYLE.arrowLine} strokeDasharray="5 3" />
          <circle cx={fmt(stub.handle.x)} cy={fmt(stub.handle.y)} r={PENDING_HANDLE} fill="#ffffff" stroke={stub.color} strokeWidth={1.5} />
          {stub.label && <SvgText line={stub.label} color={stub.color} />}
        </g>
      )}
      <rect x={fmt(data.anchor.x - 2)} y={fmt(data.anchor.y - 2)} width={4} height={4} fill={stub ? stub.color : color} stroke="none" />
      {data.codeLine && <SvgText line={data.codeLine} color={stub ? stub.color : style.fontColor} />}
    </g>
  )
}

export function NoteNode({ layout }: { layout: NodeLayout<NoteData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <SvgText line={data.text} color={style.fontColor} />
    </g>
  )
}

export function FrameNode({ layout }: { layout: NodeLayout<FrameData> }): React.JSX.Element {
  const { style, data } = layout
  const line = style.lineColor
  const r = data.sheet
  return (
    <g>
      <rect x={fmt(r.left)} y={fmt(r.top)} width={fmt(r.width)} height={fmt(r.height)} fill="none" stroke={line} strokeWidth={1} />
      {data.bands.map((b) => (
        <rect key={b.top} x={fmt(b.left)} y={fmt(b.top)} width={fmt(b.width)} height={fmt(b.height)} fill="none" stroke={line} strokeWidth={1} />
      ))}
      {data.cells.map((c, i) => (
        <g key={i}>
          {i > 0 && <line x1={fmt(c.rect.left)} y1={fmt(c.rect.top)} x2={fmt(c.rect.left)} y2={fmt(c.rect.top + c.rect.height)} stroke={line} strokeWidth={1} />}
          <SvgText line={c.caption} color={style.fontColor} />
          {c.value && <SvgText line={c.value} color={style.fontColor} />}
        </g>
      ))}
      {data.stages.map((s) => (
        <g key={s.line.text}>
          {s.current && <rect x={fmt(s.rect.left)} y={fmt(s.rect.top)} width={fmt(s.rect.width)} height={fmt(s.rect.height)} fill="none" stroke={line} strokeWidth={1} />}
          <SvgText line={s.line} color={style.fontColor} />
        </g>
      ))}
      {data.contextTop && <SvgText line={data.contextTop} color={style.fontColor} />}
      {data.thumbnail && (
        <g>
          <rect x={fmt(data.thumbnail.rect.left)} y={fmt(data.thumbnail.rect.top)} width={fmt(data.thumbnail.rect.width)} height={fmt(data.thumbnail.rect.height)} fill="none" stroke={line} strokeWidth={0.5} strokeDasharray="2 2" />
          {data.thumbnail.boxes.map((b, i) => (
            <rect key={i} x={fmt(b.left)} y={fmt(b.top)} width={fmt(b.width)} height={fmt(b.height)} fill="none" stroke={line} strokeWidth={0.75} />
          ))}
          {data.thumbnail.highlight && (
            <rect x={fmt(data.thumbnail.highlight.left)} y={fmt(data.thumbnail.highlight.top)} width={fmt(data.thumbnail.highlight.width)} height={fmt(data.thumbnail.highlight.height)} fill={line} fillOpacity={0.35} stroke={line} strokeWidth={0.75} />
          )}
        </g>
      )}
      <SvgLines lines={data.purposeLines} color={style.fontColor} />
    </g>
  )
}

/**
 * An arrow. The class names let the editor's style sheet highlight the line while the pointer is
 * over the label (`.idef0-arrow:has(.idef0-arrow-label:hover)`); exported files carry no style.
 */
export function ArrowEdge({ layout }: { layout: EdgeLayout<ArrowData> }): React.JSX.Element {
  const { points, data, style } = layout
  const ends = edgeEndShapes(points, layout.tailEnd, layout.headEnd)
  return (
    <g className="idef0-arrow">
      {points.length >= 2 && (
        <path className="idef0-arrow-line" d={roundedPolylinePath(points, IDEF0_STYLE.bendRadius)} fill="none" stroke={style.lineColor} strokeWidth={data.lineWidth} />
      )}
      <EndDecorations shapes={ends.tail} lineColor={style.lineColor} />
      <EndDecorations shapes={ends.head} lineColor={style.lineColor} />
      {data.tunnels.flatMap((t, i) => t.paths.map((d, j) => <path key={`${i}-${j}`} d={d} fill="none" stroke={style.lineColor} strokeWidth={data.lineWidth} />))}
      {data.squiggle && <path d={polylinePath(data.squiggle)} fill="none" stroke={style.lineColor} strokeWidth={1} />}
      {layout.labels.map((label, i) => (
        <g key={label.viewId ?? i} className="idef0-arrow-label">
          <EdgeLabel label={label} />
        </g>
      ))}
    </g>
  )
}
