/**
 * Pure SVG components of the RAD symbols (spec 10 section 6.3). They draw only from their layout;
 * colours come from the view style. Warning underlines are marked with the class `rad-warning`
 * so exports can leave them out.
 */
import type React from 'react'
import { edgeEndShapes, edgePath, fmt, roundedRectPath, type Point, type Rect } from '../core'
import type { EdgeLayout, NodeLayout, TextLine } from '../layout/types'
import { EndDecorations, fontAttrs } from '../render/primitives'
import type {
  ActivityData,
  BranchData,
  MarkerData,
  RefinementData,
  RoleData,
  RoleStartData,
  Segment,
  SymbolData,
  Warned,
  WaitData
} from './layout'

const SW = 1.5
const THICK = 3
export const WARNING_COLOR = '#e08a00'

export interface RadEdgeData {
  readonly strokeWidth: number
}

/** Label lines; a halo in the container colour keeps text readable where a thread crosses it. */
function Labels({ lines, color, halo }: { lines: readonly TextLine[]; color: string; halo: string | null }): React.JSX.Element {
  return (
    <>
      {lines.map((line, i) => {
        if (!line.text) return null
        const x = line.align === 'center' ? line.box.left + line.box.width / 2 : line.box.left
        return (
          <text
            key={i}
            x={fmt(x)}
            y={fmt(line.box.top + line.box.height / 2)}
            dominantBaseline="central"
            textAnchor={line.align === 'center' ? 'middle' : 'start'}
            fill={color}
            xmlSpace="preserve"
            {...(halo ? { stroke: halo, strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {})}
            {...fontAttrs(line.font)}
          >
            {line.text}
          </text>
        )
      })}
    </>
  )
}

/** Orange dotted underline of the offending name, with the warning as tooltip. */
function WarningMarks({ data }: { data: Warned }): React.JSX.Element | null {
  if (data.warnLines.length === 0) return null
  return (
    <g className="rad-warning">
      <title>{data.warnTitle}</title>
      {data.warnLines.map((r, i) => (
        <line key={i} x1={fmt(r.left)} y1={fmt(r.top + 1)} x2={fmt(r.left + r.width)} y2={fmt(r.top + 1)} stroke={WARNING_COLOR} strokeWidth={1.4} strokeDasharray="1 2.5" />
      ))}
    </g>
  )
}

function Line({ s, color, width = SW }: { s: Segment; color: string; width?: number }): React.JSX.Element {
  return <line x1={fmt(s.x1)} y1={fmt(s.y)} x2={fmt(s.x2)} y2={fmt(s.y)} stroke={color} strokeWidth={width} />
}

/** Open arrowhead pointing right with its tip at `(x, y)`. */
function ArrowRight({ x, y, color }: { x: number; y: number; color: string }): React.JSX.Element {
  return <path d={`M${fmt(x - 9)} ${fmt(y - 4.5)} L${fmt(x)} ${fmt(y)} L${fmt(x - 9)} ${fmt(y + 4.5)}`} fill="none" stroke={color} strokeWidth={SW} strokeLinejoin="miter" />
}

function labelsOf(layout: NodeLayout<SymbolData>, halo = true): React.JSX.Element {
  return <Labels lines={layout.data.lines} color={layout.style.fontColor} halo={halo ? layout.data.halo : null} />
}

// ---------------------------------------------------------------------------------------------
// Role

export function RoleNode({ layout }: { layout: NodeLayout<RoleData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <path d={roundedRectPath(box, data.radius)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      <Labels lines={data.titleLines} color={style.fontColor} halo={null} />
      <Labels lines={data.goalLines} color={style.fontColor} halo={null} />
      <WarningMarks data={data} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Symbols on the threads

export function ActivityNode({ layout }: { layout: NodeLayout<ActivityData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      {data.stub ? <Line s={data.stub} color={style.lineColor} width={THICK} /> : null}
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      {labelsOf(layout)}
      <Labels lines={data.caption} color={style.fontColor} halo={data.halo} />
      <WarningMarks data={data} />
    </g>
  )
}

export function UndefinedProcessNode({ layout }: { layout: NodeLayout<SymbolData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <ellipse cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} rx={fmt(box.width / 2)} ry={fmt(box.height / 2)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

export function StateMarkerNode({ layout }: { layout: NodeLayout<MarkerData> }): React.JSX.Element {
  const { box, style, data } = layout
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return (
    <g>
      <ellipse cx={fmt(cx)} cy={fmt(cy)} rx={fmt(box.width / 2)} ry={fmt(box.height / 2)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      <ellipse cx={fmt(cx)} cy={fmt(cy)} rx={fmt(box.width / 2 - 6)} ry={fmt(box.height / 2 - 4)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

export function WaitNode({ layout }: { layout: NodeLayout<WaitData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      <Line s={data.stub} color={style.lineColor} />
      <ArrowRight x={data.stub.x2} y={data.stub.y} color={style.lineColor} />
      <circle cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} r={fmt(box.width / 2)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

/** Pentagon pointing right: flat left half, the right half converges to a tip at mid height. */
export function pentagonPath(box: Rect): string {
  const { left, top, width, height } = box
  const mid = left + width / 2
  return `M${fmt(left)} ${fmt(top)} H${fmt(mid)} L${fmt(left + width)} ${fmt(top + height / 2)} L${fmt(mid)} ${fmt(top + height)} H${fmt(left)} Z`
}

export function RoleStartNode({ layout }: { layout: NodeLayout<RoleStartData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      {data.tip ? (
        <>
          <Line s={data.tip} color={style.lineColor} />
          <ArrowRight x={data.tip.x2} y={data.tip.y} color={style.lineColor} />
        </>
      ) : null}
      <path d={pentagonPath(box)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} strokeLinejoin="miter" />
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Refinements and branches

export function RefinementNode({ layout }: { layout: NodeLayout<RefinementData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      {data.bars.map((s, i) => (
        <Line key={i} s={s} color={style.lineColor} />
      ))}
      <circle cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} r={fmt(box.width / 2)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

/** Upward-pointing triangle (apex up) filling `box`. */
export function trianglePath(box: Rect): string {
  const cx = box.left + box.width / 2
  return `M${fmt(cx)} ${fmt(box.top)} L${fmt(box.left + box.width)} ${fmt(box.top + box.height)} L${fmt(box.left)} ${fmt(box.top + box.height)} Z`
}

export function BranchNode({ layout }: { layout: NodeLayout<BranchData> }): React.JSX.Element {
  const { box, style, data } = layout
  return (
    <g>
      {data.part ? (
        <path d={trianglePath(box)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} strokeLinejoin="miter" />
      ) : (
        <circle cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} r={fmt(box.width / 2)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={SW} />
      )}
      {labelsOf(layout)}
      <WarningMarks data={data} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Edges

function RadEdge({ layout }: { layout: EdgeLayout<RadEdgeData> }): React.JSX.Element {
  const ends = edgeEndShapes(layout.points, layout.tailEnd, layout.headEnd)
  const width = layout.data?.strokeWidth ?? SW
  return (
    <g>
      {layout.points.length >= 2 ? (
        <path d={edgePath(layout.points as readonly Point[], layout.lineStyle)} fill="none" stroke={layout.style.lineColor} strokeWidth={width} strokeLinejoin="miter" />
      ) : null}
      <EndDecorations shapes={ends.head} lineColor={layout.style.lineColor} />
      <EndDecorations shapes={ends.tail} lineColor={layout.style.lineColor} />
    </g>
  )
}

export const StateLineEdge = RadEdge
export const InteractionLinkEdge = RadEdge
