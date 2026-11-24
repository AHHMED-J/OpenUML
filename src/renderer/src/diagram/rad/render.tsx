/**
 * Pure SVG components of the RAD symbols (spec 10 section 6.3) in the two diagram styles (see
 * `look.ts`). They draw only from their layout: neutral colors come from the view style (the dark
 * canvas converts them), a Colorful role's color comes from its swatch for the canvas in use.
 * Warning underlines are marked with the class `rad-warning` so exports can leave them out.
 */
import type React from 'react'
import { edgeEndShapes, edgePath, fmt, roundedRectPath, type Point, type Rect } from '../core'
import type { EdgeLayout, NodeLayout, TextLine, ViewStyle } from '../layout/types'
import { useCanvasPalette } from '../render/canvasContext'
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
import { accentColors, type AccentUse } from './look'

const SW = 1.5
const WARNING_COLOR = '#e08a00'

export interface RadEdgeData {
  readonly strokeWidth: number
  /** Colorful: a thread takes the color of its role. */
  readonly accent?: AccentUse | null
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

/** Small filled arrowhead pointing right with its tip at `(x, y)`. */
function ArrowRight({ x, y, color }: { x: number; y: number; color: string }): React.JSX.Element {
  return <path d={`M${fmt(x - 7)} ${fmt(y - 3.5)} L${fmt(x)} ${fmt(y)} L${fmt(x - 7)} ${fmt(y + 3.5)} Z`} fill={color} stroke="none" />
}

/** The colors of a symbol on the canvas in use. */
function useInk(layout: NodeLayout<SymbolData>): { fill: string; line: string; text: string } {
  const { mode } = useCanvasPalette()
  return accentColors(layout.data.accent, mode, layout.style)
}

/** Circle inscribed in a box (waits, refinements, case branches). */
function CircleIn({ box, fill, line }: { box: Rect; fill: string; line: string }): React.JSX.Element {
  return <circle cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} r={fmt(box.width / 2)} fill={fill} stroke={line} strokeWidth={SW} />
}

function SymbolLabels({ layout, color }: { layout: NodeLayout<SymbolData>; color: string }): React.JSX.Element {
  const { data } = layout
  // Text inside a card needs no halo; text beside a symbol takes its own color (see `label`).
  const beside = !data.card && !data.accent?.text
  return <Labels lines={data.lines} color={beside ? data.label.fontColor : color} halo={data.card ? null : data.halo} />
}

/** A Colorful card (or pill) with its name inside. */
function Card({ box, fill, line, radius, dashed = false, filled = false }: { box: Rect; fill: string; line: string; radius: number; dashed?: boolean; filled?: boolean }): React.JSX.Element {
  // Inset by half the stroke so the outline stays inside the box, like the design.
  const r = filled ? box : { left: box.left + 0.75, top: box.top + 0.75, width: box.width - 1.5, height: box.height - 1.5 }
  return (
    <rect
      x={fmt(r.left)}
      y={fmt(r.top)}
      width={fmt(r.width)}
      height={fmt(r.height)}
      rx={fmt(Math.min(radius, r.height / 2))}
      fill={fill}
      stroke={filled ? 'none' : line}
      strokeWidth={SW}
      {...(dashed ? { strokeDasharray: '3 3' } : {})}
    />
  )
}

// ---------------------------------------------------------------------------------------------
// Role

export function RoleNode({ layout }: { layout: NodeLayout<RoleData> }): React.JSX.Element {
  const { box, style, data } = layout
  const { mode } = useCanvasPalette()
  return (
    <g>
      <path d={roundedRectPath(box, data.radius)} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      {data.separator ? <line x1={fmt(box.left)} y1={fmt(data.separator.y)} x2={fmt(box.left + box.width)} y2={fmt(data.separator.y)} stroke={data.separator.lineColor} strokeWidth={1} /> : null}
      {data.dot ? <circle cx={fmt(data.dot.cx)} cy={fmt(data.dot.cy)} r={fmt(data.dot.r)} fill={data.dot.swatch[mode].accent} /> : null}
      <Labels lines={data.titleLines} color={style.fontColor} halo={null} />
      <Labels lines={data.goalLines} color={style.fontColor} halo={null} />
      {data.lock ? <LockMark r={data.lock} /> : null}
      <WarningMarks data={data} />
    </g>
  )
}

/** Padlock beside a locked role's title; an editor mark, left out of exports. */
function LockMark({ r }: { r: Rect }): React.JSX.Element {
  const { lock, lockHole } = useCanvasPalette()
  const body = { left: r.left, top: r.top + r.height * 0.45, width: r.width, height: r.height * 0.55 }
  const cx = r.left + r.width / 2
  const shackle = `M${fmt(r.left + 2)} ${fmt(body.top)} V${fmt(r.top + 3)} A${fmt(r.width / 2 - 2)} ${fmt(r.width / 2 - 2)} 0 0 1 ${fmt(r.left + r.width - 2)} ${fmt(r.top + 3)} V${fmt(body.top)}`
  return (
    <g className="editor-only" aria-label="Locked">
      <path d={shackle} fill="none" stroke={lock} strokeWidth={1.4} />
      <rect x={fmt(body.left)} y={fmt(body.top)} width={fmt(body.width)} height={fmt(body.height)} rx={1.5} fill={lock} />
      <circle cx={fmt(cx)} cy={fmt(body.top + body.height / 2)} r={1} fill={lockHole} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Symbols on the threads

export function ActivityNode({ layout }: { layout: NodeLayout<ActivityData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  return (
    <g>
      {data.stub ? <Line s={data.stub} color={layout.style.lineColor} width={data.stubWidth} /> : null}
      {data.card ? (
        <Card box={box} fill={ink.fill} line={ink.line} radius={5} filled={!data.interaction && data.accent?.fill === 'accent'} />
      ) : (
        <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill={ink.fill} stroke={ink.line} strokeWidth={SW} />
      )}
      <SymbolLabels layout={layout} color={ink.text} />
      <Labels lines={data.caption} color={data.muted.fontColor} halo={data.halo} />
      <WarningMarks data={data} />
    </g>
  )
}

export function UndefinedProcessNode({ layout }: { layout: NodeLayout<SymbolData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  return (
    <g>
      {data.card ? (
        <Card box={box} fill={ink.fill} line={ink.line} radius={box.height / 2} dashed />
      ) : (
        <ellipse cx={fmt(box.left + box.width / 2)} cy={fmt(box.top + box.height / 2)} rx={fmt(box.width / 2)} ry={fmt(box.height / 2)} fill={ink.fill} stroke={ink.line} strokeWidth={SW} />
      )}
      <SymbolLabels layout={layout} color={ink.text} />
      <WarningMarks data={data} />
    </g>
  )
}

export function StateMarkerNode({ layout }: { layout: NodeLayout<MarkerData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  if (data.card) {
    return (
      <g>
        <Card box={box} fill={ink.fill} line={ink.line} radius={box.height / 2} filled={data.accent?.fill === 'accent'} />
        <SymbolLabels layout={layout} color={ink.text} />
        <WarningMarks data={data} />
      </g>
    )
  }
  const innerW = Math.min(13, box.width - 11) / 2
  const innerH = Math.min(6, box.height - 9) / 2
  return (
    <g>
      <ellipse cx={fmt(cx)} cy={fmt(cy)} rx={fmt(box.width / 2)} ry={fmt(box.height / 2)} fill={ink.fill} stroke={ink.line} strokeWidth={SW} />
      <ellipse cx={fmt(cx)} cy={fmt(cy)} rx={fmt(innerW)} ry={fmt(innerH)} fill={data.inner.fillColor} stroke={ink.line} strokeWidth={SW} />
      <SymbolLabels layout={layout} color={ink.text} />
      <WarningMarks data={data} />
    </g>
  )
}

export function WaitNode({ layout }: { layout: NodeLayout<WaitData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  return (
    <g>
      <Line s={{ ...data.stub, x2: data.stub.x2 - 6 }} color={ink.line} />
      <ArrowRight x={data.stub.x2} y={data.stub.y} color={ink.line} />
      <CircleIn box={box} fill={ink.fill} line={ink.line} />
      {data.look === 'colorful' ? (
        <path d={`M${fmt(cx)} ${fmt(cy - box.height * 0.3)} V${fmt(cy)} H${fmt(cx + box.width * 0.25)}`} fill="none" stroke={ink.line} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      <SymbolLabels layout={layout} color={ink.text} />
      <WarningMarks data={data} />
    </g>
  )
}

/** Pentagon pointing right: flat left half, the right half converges to a tip at mid height. */
function pentagonPath(box: Rect): string {
  const { left, top, width, height } = box
  const mid = left + width / 2
  return `M${fmt(left)} ${fmt(top)} H${fmt(mid)} L${fmt(left + width)} ${fmt(top + height / 2)} L${fmt(mid)} ${fmt(top + height)} H${fmt(left)} Z`
}

export function RoleStartNode({ layout }: { layout: NodeLayout<RoleStartData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  const filled = data.accent?.fill === 'accent'
  return (
    <g>
      {data.tip ? (
        <>
          <Line s={{ ...data.tip, x2: data.tip.x2 - 6 }} color={ink.line} />
          <ArrowRight x={data.tip.x2} y={data.tip.y} color={ink.line} />
          <Labels lines={data.external} color={data.muted.fontColor} halo={data.halo} />
        </>
      ) : null}
      <path d={pentagonPath(box)} fill={filled ? ink.line : ink.fill} stroke={ink.line} strokeWidth={SW} strokeLinejoin="miter" />
      <SymbolLabels layout={layout} color={layout.style.fontColor} />
      <WarningMarks data={data} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Refinements and branches

export function RefinementNode({ layout }: { layout: NodeLayout<RefinementData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  return (
    <g>
      {data.bars.map((s, i) => (
        <Line key={i} s={s} color={ink.line} />
      ))}
      <CircleIn box={box} fill={ink.fill} line={ink.line} />
      <SymbolLabels layout={layout} color={ink.text} />
      <WarningMarks data={data} />
    </g>
  )
}

/** Upward-pointing triangle (apex up) filling `box`. */
function trianglePath(box: Rect): string {
  const cx = box.left + box.width / 2
  return `M${fmt(cx)} ${fmt(box.top)} L${fmt(box.left + box.width)} ${fmt(box.top + box.height)} L${fmt(box.left)} ${fmt(box.top + box.height)} Z`
}

export function BranchNode({ layout }: { layout: NodeLayout<BranchData> }): React.JSX.Element {
  const { box, data } = layout
  const ink = useInk(layout)
  return (
    <g>
      {data.part ? <path d={trianglePath(box)} fill={ink.fill} stroke={ink.line} strokeWidth={SW} strokeLinejoin="miter" /> : <CircleIn box={box} fill={ink.fill} line={ink.line} />}
      <SymbolLabels layout={layout} color={ink.text} />
      <WarningMarks data={data} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------------
// Edges

function RadEdge({ layout }: { layout: EdgeLayout<RadEdgeData> }): React.JSX.Element {
  const { mode } = useCanvasPalette()
  const ends = edgeEndShapes(layout.points, layout.tailEnd, layout.headEnd)
  const width = layout.data?.strokeWidth ?? SW
  const color = accentColors(layout.data?.accent ?? null, mode, layout.style as ViewStyle).line
  return (
    <g>
      {layout.points.length >= 2 ? <path d={edgePath(layout.points as readonly Point[], layout.lineStyle)} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" /> : null}
      <EndDecorations shapes={ends.head} lineColor={color} />
      <EndDecorations shapes={ends.tail} lineColor={color} />
    </g>
  )
}

export const StateLineEdge = RadEdge
export const InteractionLinkEdge = RadEdge
