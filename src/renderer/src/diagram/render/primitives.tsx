/**
 * SVG drawing primitives shared by all notations: text lines, shadows, the standard edge drawing
 * and edge labels. Components here are pure (no hooks) so they also render to static markup for
 * SVG export.
 */
import type React from 'react'
import {
  DASH,
  SHADOW,
  cssFontFamily,
  dashArray,
  edgeEndShapes,
  edgePath,
  endShapePath,
  fmt,
  isBold,
  isItalic,
  type EndShape,
  type Font,
  type Rect
} from '../core'
import type { EdgeLabelLayout, EdgeLayout, TextLine, ViewStyle } from '../layout/types'

/** SVG presentation attributes for a font. */
export function fontAttrs(font: Font): React.SVGProps<SVGTextElement> {
  return {
    fontFamily: cssFontFamily(font.face),
    fontSize: font.size,
    ...(isBold(font) ? { fontWeight: 'bold' } : {}),
    ...(isItalic(font) ? { fontStyle: 'italic' } : {})
  }
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const

/** One line of text, vertically centered in its box. */
export function SvgText({ line, color }: { line: TextLine; color: string }): React.JSX.Element | null {
  if (!line.text) return null
  const x = line.align === 'left' ? line.box.left : line.align === 'right' ? line.box.left + line.box.width : line.box.left + line.box.width / 2
  return (
    <text
      x={fmt(x)}
      y={fmt(line.box.top + line.box.height / 2)}
      dominantBaseline="central"
      textAnchor={ANCHOR[line.align]}
      fill={color}
      xmlSpace="preserve"
      {...(line.underline ? { textDecoration: 'underline' } : {})}
      {...fontAttrs(line.font)}
    >
      {line.text}
    </text>
  )
}

export function SvgLines({ lines, color }: { lines: readonly TextLine[]; color: string }): React.JSX.Element {
  return (
    <>
      {lines.map((line, i) => (
        <SvgText key={i} line={line} color={color} />
      ))}
    </>
  )
}

/** A straight 1-unit line segment, optionally dashed. */
export function SvgLine({ x1, y1, x2, y2, color, dash }: { x1: number; y1: number; x2: number; y2: number; color: string; dash?: readonly number[] }): React.JSX.Element {
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

/** Translucent offset shadow of a shape given as path data (spec 03 §2.2). */
export function Shadow({ d, show }: { d: string; show: boolean }): React.JSX.Element | null {
  if (!show || !d) return null
  return (
    <path
      d={d}
      transform={`translate(${SHADOW.offsetX} ${SHADOW.offsetY})`}
      fill={SHADOW.color}
      fillOpacity={SHADOW.alpha}
      stroke="none"
    />
  )
}

/** Rectangle path data. */
export function rectPath(r: Rect): string {
  const x1 = r.left + r.width
  const y1 = r.top + r.height
  return `M${fmt(r.left)} ${fmt(r.top)} L${fmt(x1)} ${fmt(r.top)} L${fmt(x1)} ${fmt(y1)} L${fmt(r.left)} ${fmt(y1)} Z`
}

/** Filled and stroked rectangle with the view style. */
export function StyledRect({ r, style, fill = true }: { r: Rect; style: ViewStyle; fill?: boolean }): React.JSX.Element {
  return (
    <rect
      x={fmt(r.left)}
      y={fmt(r.top)}
      width={fmt(Math.max(0, r.width))}
      height={fmt(Math.max(0, r.height))}
      fill={fill ? style.fillColor : 'none'}
      stroke={style.lineColor}
      strokeWidth={1}
    />
  )
}

function endFill(shape: EndShape, lineColor: string): string {
  if (shape.type === 'polyline') return 'none'
  return shape.fill === 'line' ? lineColor : shape.fill === 'background' ? '#ffffff' : 'none'
}

/** End decorations of an edge. */
export function EndDecorations({ shapes, lineColor }: { shapes: readonly EndShape[]; lineColor: string }): React.JSX.Element {
  return (
    <>
      {shapes.map((shape, i) => (
        <path key={i} d={endShapePath(shape)} fill={endFill(shape, lineColor)} stroke={lineColor} strokeWidth={1} strokeLinejoin="miter" />
      ))}
    </>
  )
}

/** One edge label: an opaque box (hides the line) with one line of text. */
export function EdgeLabel({ label }: { label: EdgeLabelLayout }): React.JSX.Element | null {
  if (!label.text) return null
  const b = label.box
  return (
    <g>
      <rect x={fmt(b.left)} y={fmt(b.top)} width={fmt(b.width)} height={fmt(b.height)} fill={label.fillColor} stroke="none" />
      <SvgText
        line={{ text: label.text, box: b, font: label.font, align: 'center', underline: label.underline }}
        color={label.fontColor}
      />
    </g>
  )
}

/** The edge line (in its line style and dash) without decorations. */
export function EdgeLine({ layout }: { layout: EdgeLayout }): React.JSX.Element | null {
  if (layout.points.length < 2) return null
  const dash = dashArray(layout.dash)
  return (
    <path
      d={edgePath(layout.points, layout.lineStyle)}
      fill="none"
      stroke={layout.style.lineColor}
      strokeWidth={1}
      {...(dash.length > 0 ? { strokeDasharray: dash.join(' ') } : {})}
    />
  )
}

/** Standard edge drawing: line, end decorations, labels. */
export function EdgeShape({ layout, children }: { layout: EdgeLayout; children?: React.ReactNode }): React.JSX.Element {
  const ends = edgeEndShapes(layout.points, layout.tailEnd, layout.headEnd)
  return (
    <g>
      <EdgeLine layout={layout} />
      <EndDecorations shapes={ends.tail} lineColor={layout.style.lineColor} />
      <EndDecorations shapes={ends.head} lineColor={layout.style.lineColor} />
      {children}
      {layout.labels.map((label, i) => (
        <EdgeLabel key={label.viewId ?? i} label={label} />
      ))}
    </g>
  )
}

export const SELECTION_DASH = DASH.selection.join(' ')
