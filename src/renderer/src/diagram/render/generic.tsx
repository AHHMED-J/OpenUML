/**
 * Notations shared by every diagram: annotations (note, text, note link), the diagram frame,
 * package containment lines, and the fallback box/line used for view types without a notation.
 */
import type React from 'react'
import { isKindOf, type Diagram, type EdgeView, type Elem, type NodeView, type UMLCustomTextView } from '../../model'
import {
  SPACING,
  fmt,
  guillemets,
  layoutText,
  polygonPath,
  relationshipNotation,
  withFontStyle,
  type Font,
  type Point,
  type Rect,
  type RelationshipKind,
  type TextMeasurer
} from '../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../layout/edges'
import {
  arrangeNameCompartment,
  braceList,
  measureNameCompartment,
  nameEditText,
  nameOf,
  tagStrings,
  nodeLayout,
  stereotypeName,
  styleOf
} from '../layout/helpers'
import type { EdgeLayout, LayoutContext, NodeLayout, TextLine } from '../layout/types'
import { EdgeShape, Shadow, StyledRect, SvgLines, SvgText, rectPath } from './primitives'
import { registerEdgeNotation, registerNodeNotation, setFallbackNotations, type EdgeNotation, type NodeNotation } from './registry'

// =============================================================================================
// Fallback node: a box with the element's name

interface BoxData {
  readonly lines: readonly TextLine[]
}

function layoutFallbackNode(view: NodeView, ctx: LayoutContext): NodeLayout<BoxData> {
  const style = styleOf(view)
  const name = nameOf(view.model)
  const m = measureNameCompartment({ name, stereotype: stereotypeName(view.model), font: style.font }, ctx.measurer)
  return nodeLayout(view, {
    minWidth: name ? m.width : 10,
    minHeight: name ? m.height : 10,
    style,
    data: (box) => ({ lines: name ? arrangeNameCompartment(m, box) : [] }),
    regions: (box) =>
      view.model && name !== undefined
        ? [{ box: { ...box, height: m.height }, target: { kind: 'name', elementId: view.model._id }, text: name, font: style.font }]
        : []
  })
}

function FallbackNode({ layout }: { layout: NodeLayout<BoxData> }): React.JSX.Element {
  return (
    <g>
      <StyledRect r={layout.box} style={layout.style} />
      <SvgLines lines={layout.data.lines} color={layout.style.fontColor} />
    </g>
  )
}

export const fallbackNodeNotation: NodeNotation<BoxData> = { layout: layoutFallbackNode, Render: FallbackNode }

// =============================================================================================
// Generic relationship edges

/**
 * A ready-made edge notation for a relationship kind of `relationshipNotation` (solid/dotted line
 * and end decorations) with the standard name, stereotype and property labels. Use it to register
 * simple relationships, e.g. `registerEdgeNotation('UMLIncludeView', relationshipEdgeNotation('include', 'Include'))`.
 */
export function relationshipEdgeNotation(kind: RelationshipKind, connectKind?: EdgeNotation['connectKind']): EdgeNotation {
  return {
    connectKind,
    layout(edge, ctx) {
      const n = relationshipNotation(kind)
      return buildEdgeLayout(edge, ctx, {
        dash: n.dash,
        tailEnd: n.tail,
        headEnd: n.head,
        labels: standardEdgeLabels(edge, n.fixedKeyword)
      })
    }
  }
}

/** Name / stereotype / property labels of a relationship edge (spec 03 §3.4). */
export function standardEdgeLabels(edge: EdgeView, fixedKeyword?: string): EdgeLabelSpec[] {
  const model = edge.model
  const st = stereotypeName(model)
  const keyword = st || fixedKeyword || ''
  const name = nameOf(model)
  return [
    {
      field: 'nameLabel',
      defaults: 'name',
      text: name,
      ...(model ? { edit: { kind: 'name' as const, elementId: model._id }, editText: nameEditText(model) } : {})
    },
    { field: 'stereotypeLabel', defaults: 'stereotype', text: keyword && (edge['stereotypeDisplay'] ?? 'label') !== 'none' ? guillemets(keyword) : '' },
    { field: 'propertyLabel', defaults: 'property', text: edge['showProperty'] === false ? '' : tagString(model) }
  ]
}

/** `{tag=value, ...}` of an element's visible tags (plus `extra` flags first), '' when none. */
export function tagString(el: Elem | null | undefined, extra: readonly string[] = []): string {
  return braceList([...extra, ...tagStrings(el)])
}

const fallbackEdgeNotation: EdgeNotation = {
  layout(edge, ctx) {
    return buildEdgeLayout(edge, ctx, { dash: 'solid', tailEnd: { style: 'flat' }, headEnd: { style: 'flat' }, labels: standardEdgeLabels(edge) })
  }
}

// =============================================================================================
// Note and text (spec 03 §4.2)

interface TextBoxData {
  readonly lines: readonly TextLine[]
  readonly note: boolean
}

const NOTE_PAD = SPACING.notePadding
const NOTE_FOLD = SPACING.noteFold

function layoutTextBox(view: NodeView, ctx: LayoutContext, note: boolean): NodeLayout<TextBoxData> {
  const v = view as UMLCustomTextView
  const style = styleOf(view)
  const font = style.font
  const text = typeof v.text === 'string' ? v.text : ''
  const lineHeight = font.size + SPACING.noteLineGap
  const hPad = NOTE_PAD + NOTE_PAD + NOTE_FOLD
  const wrap = v.wordWrap !== false
  const longestWord = Math.max(0, ...text.split(/\s+/).map((w) => ctx.measurer.measure(w, font).width))
  const unwrapped = layoutText(text, font, ctx.measurer, { wrap: false, lineHeight })
  const minWidth = Math.max(10, Math.ceil((wrap ? longestWord : unwrapped.size.width) + hPad))
  const storedWidth = Math.max(view.width ?? 0, minWidth)
  const laid = wrap ? layoutText(text, font, ctx.measurer, { maxWidth: storedWidth - hPad, wrap: true, lineHeight }) : unwrapped
  const minHeight = Math.max(10, laid.lines.length * lineHeight + NOTE_PAD * 2)
  return nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    data: (box) => ({ lines: arrangeTextLines(laid.lines, box, font, lineHeight, v.horzAlign ?? 0, v.vertAlign ?? 3, laid.size.height), note }),
    regions: (box) => [{ box, target: { kind: 'text', viewId: view._id }, text, font, multiline: true }]
  })
}

function arrangeTextLines(lines: readonly string[], box: Rect, font: Font, lineHeight: number, horz: number, vert: number, blockHeight: number): TextLine[] {
  const inner = { left: box.left + NOTE_PAD, top: box.top + NOTE_PAD, width: Math.max(0, box.width - NOTE_PAD * 2 - NOTE_FOLD), height: Math.max(0, box.height - NOTE_PAD * 2) }
  const top = vert === 5 ? inner.top + (inner.height - blockHeight) / 2 : vert === 4 ? inner.top + inner.height - blockHeight : inner.top
  const align = horz === 1 ? 'right' : horz === 2 ? 'center' : 'left'
  return lines.map((text, i) => ({ text, font, align, box: { left: inner.left, top: top + i * lineHeight, width: inner.width, height: lineHeight } }))
}

/** Note outline: rectangle with the top-right corner folded (right/bottom 1 unit inside the box). */
export function notePolygon(b: Rect): Point[] {
  const r = b.left + b.width - 1
  const bottom = b.top + b.height - 1
  return [
    { x: b.left, y: b.top },
    { x: r - NOTE_FOLD, y: b.top },
    { x: r, y: b.top + NOTE_FOLD },
    { x: r, y: bottom },
    { x: b.left, y: bottom }
  ]
}

function TextBox({ layout }: { layout: NodeLayout<TextBoxData> }): React.JSX.Element {
  const { box, style, data } = layout
  if (!data.note) return <SvgLines lines={data.lines} color={style.fontColor} />
  const r = box.left + box.width - 1
  return (
    <g>
      <path d={polygonPath(notePolygon(box))} fill={style.fillColor} stroke={style.lineColor} strokeWidth={1} />
      <path
        d={polygonPath([
          { x: r - NOTE_FOLD, y: box.top },
          { x: r - NOTE_FOLD, y: box.top + NOTE_FOLD },
          { x: r, y: box.top + NOTE_FOLD }
        ])}
        fill="none"
        stroke={style.lineColor}
        strokeWidth={1}
      />
      <SvgLines lines={data.lines} color={style.fontColor} />
    </g>
  )
}

const noteNotation: NodeNotation<TextBoxData> = { layout: (v, c) => layoutTextBox(v, c, true), Render: TextBox }
const textNotation: NodeNotation<TextBoxData> = { layout: (v, c) => layoutTextBox(v, c, false), Render: TextBox }

// =============================================================================================
// Frame (diagram frame; also reused by combined fragments)

export interface FrameLabelLayout {
  readonly polygon: readonly Point[]
  readonly keyword: TextLine
  readonly name: TextLine | null
  /** Height of the label band. */
  readonly bandHeight: number
  /** Minimum frame width for this label. */
  readonly minWidth: number
}

/**
 * Pentagon label in the top-left corner of a frame (spec 03 §4.4): bold keyword, then the name
 * 6 units after it; band height = max(label heights) + 10; the right edge is cut at 45°.
 */
export function layoutFrameLabel(box: Rect, keyword: string, name: string, font: Font, measurer: TextMeasurer): FrameLabelLayout {
  const kwFont = withFontStyle(font, true, false)
  const kw = measurer.measure(keyword, kwFont)
  const nm = name ? measurer.measure(name, font) : { width: 0, height: 0 }
  const h = Math.max(kw.height, nm.height) + 10
  const kwLeft = box.left + 5
  const nameLeft = kwLeft + kw.width + SPACING.frameLabelGap * 2
  const nameRight = name ? nameLeft + nm.width : kwLeft + kw.width
  const x = nameRight + 5 + h / 2
  return {
    polygon: [
      { x: box.left, y: box.top },
      { x: box.left, y: box.top + h },
      { x: x - h / 2, y: box.top + h },
      { x, y: box.top + h / 2 },
      { x, y: box.top }
    ],
    keyword: { text: keyword, font: kwFont, align: 'left', box: { left: kwLeft, top: box.top + 5, width: kw.width, height: h - 10 } },
    name: name ? { text: name, font, align: 'left', box: { left: nameLeft, top: box.top + 5, width: nm.width, height: h - 10 } } : null,
    bandHeight: h,
    minWidth: Math.max(80, Math.ceil(x - box.left + 10))
  }
}

/** Draws the pentagon label of a frame. */
export function FrameLabel({ label, fill, line, color }: { label: FrameLabelLayout; fill: string; line: string; color: string }): React.JSX.Element {
  return (
    <g>
      <path d={polygonPath(label.polygon)} fill={fill} stroke={line} strokeWidth={1} />
      <SvgText line={label.keyword} color={color} />
      {label.name && <SvgText line={label.name} color={color} />}
    </g>
  )
}

const FRAME_KEYWORDS: Record<string, string> = {
  UMLSequenceDiagram: 'sd',
  UMLClassDiagram: 'class',
  UMLUseCaseDiagram: 'uc',
  UMLActivityDiagram: 'act'
}

interface FrameData {
  readonly label: FrameLabelLayout
}

function layoutFrame(view: NodeView, ctx: LayoutContext): NodeLayout<FrameData> {
  const style = styleOf(view)
  const diagram = isKindOf(view.model, 'Diagram') ? (view.model as Diagram) : ctx.diagram
  const keyword = FRAME_KEYWORDS[diagram._type] ?? 'pkg'
  const owner = diagram._type === 'UMLSequenceDiagram' ? diagram._parent : diagram
  const name = nameOf(owner)
  const probe = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, keyword, name, style.font, ctx.measurer)
  return nodeLayout(view, {
    minWidth: probe.minWidth,
    minHeight: Math.max(30, probe.bandHeight + 30),
    zIndex: -1,
    style,
    data: (box) => ({ label: layoutFrameLabel(box, keyword, name, style.font, ctx.measurer) }),
    regions: (box) =>
      owner && isKindOf(owner, 'Model')
        ? [{ box: layoutFrameLabel(box, keyword, name, style.font, ctx.measurer).name?.box ?? box, target: { kind: 'name', elementId: owner._id }, text: name, font: style.font }]
        : []
  })
}

function Frame({ layout }: { layout: NodeLayout<FrameData> }): React.JSX.Element {
  const { box, style } = layout
  return (
    <g>
      <rect x={fmt(box.left)} y={fmt(box.top)} width={fmt(box.width)} height={fmt(box.height)} fill="none" stroke={style.lineColor} strokeWidth={1} />
      <FrameLabel label={layout.data.label} fill={style.fillColor} line={style.lineColor} color={style.fontColor} />
    </g>
  )
}

// =============================================================================================
// Registration

export function registerGenericNotations(): void {
  setFallbackNotations(fallbackNodeNotation as NodeNotation, fallbackEdgeNotation)
  registerNodeNotation('UMLNoteView', noteNotation)
  registerNodeNotation('UMLTextView', textNotation)
  registerNodeNotation('UMLFrameView', { layout: layoutFrame, Render: Frame })
  registerEdgeNotation('UMLNoteLinkView', relationshipEdgeNotation('noteLink', 'NoteLink'))
  registerEdgeNotation('UMLContainmentView', relationshipEdgeNotation('containment'))
  registerEdgeNotation('UMLGeneralEdgeView', fallbackEdgeNotation)
}

export { EdgeShape, Shadow, rectPath }
export type { EdgeLayout }
