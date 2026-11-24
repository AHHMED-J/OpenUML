/**
 * Measure/arrange of RAD nodes (spec 10 section 5): role boxes that grow to fit their content with
 * the `Agent- Role` title in a header at their top, the symbols on the threads (activities and
 * interactions, undefined processes, state markers, waits, role starts), refinements with their
 * derived bars, and their branches. Pure: reads the model and returns layout data.
 *
 * Sizes, text size and default colors come from the diagram style (`look.ts`). Every symbol is
 * drawn centered on its stored position, so a style with smaller (or text-sized) symbols never
 * bends a thread. In Colorful, activities, interactions, undefined processes and markers are cards
 * with their name inside, as wide as the name needs (wrapping past a maximum).
 */
import { isKindOf, type EdgeView, type Elem, type NodeView, type View } from '../../model'
import { inflateRect, unionRects, wrapText, withFontStyle, type Font, type NodeOutline, type Rect } from '../core'
import { nameOf, nodeLayout, storedBox, styleOf } from '../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine, ViewStyle } from '../layout/types'
import { edgesAt } from '../layout/passIndex'
import { nodeNotationFor } from '../render/registry'
import {
  customColorsOf,
  radFont,
  radGeometry,
  radRoleOf,
  radStyleOf,
  radSwatchOf,
  RAD_INK,
  RAD_MUTED,
  RAD_ROLE_COLORS,
  RAD_TITLE,
  type AccentUse,
  type RadGeometry,
  type RadStyleName,
  type SwatchPair
} from './look'
import { roleTitle } from './strings'
import { radWarningsByElement, type RadWarning } from './validation'

/** Geometry of the Classic style (the default); see `radGeometry` for both styles. */
export const RAD_GEOMETRY: RadGeometry = radGeometry('classic')

/** The style and geometry of the diagram being laid out. */
interface Look {
  readonly name: RadStyleName
  readonly g: RadGeometry
  readonly colorful: boolean
}

const looks = new WeakMap<LayoutContext, Look>()

export function radLookOf(ctx: LayoutContext): Look {
  let look = looks.get(ctx)
  if (!look) {
    const name = radStyleOf(ctx.diagram)
    looks.set(ctx, (look = { name, g: radGeometry(name), colorful: name === 'colorful' }))
  }
  return look
}

/** Rectangles a role must contain around a symbol (its box, label, wait stub, ...). */
interface RadContent {
  readonly content: readonly Rect[]
}

export interface Warned {
  /** Tooltip text of the warnings of this element ('' when none). */
  readonly warnTitle: string
  /** Orange dotted underlines (under the label lines, else under the symbol). */
  readonly warnLines: readonly Rect[]
}

export interface SymbolData extends RadContent, Warned {
  readonly lines: readonly TextLine[]
  /** Colour behind label text that crosses a thread or bar (the role fill). */
  readonly halo: string
  readonly look: RadStyleName
  /** Colorful: the parts drawn in the role's color. */
  readonly accent: AccentUse | null
  /** Colorful: drawn as a card (or pill) with the name inside. */
  readonly card: boolean
  /**
   * Color of the name beside the symbol, kept apart from the style: on the dark canvas the style's
   * text is made readable on the symbol's fill, and a label next to a filled square is not on it.
   */
  readonly label: { readonly fontColor: string }
}

export interface Segment {
  readonly x1: number
  readonly x2: number
  readonly y: number
}

/** Secondary text (conditions, outside parties, waits) as a color the dark canvas converts. */
interface Muted {
  readonly fontColor: string
}

export interface ActivityData extends SymbolData {
  readonly interaction: boolean
  /** Interaction with an outside party: the stub drawn from the symbol. */
  readonly stub: Segment | null
  readonly stubWidth: number
  readonly caption: readonly TextLine[]
  readonly muted: Muted
}

export interface MarkerData extends SymbolData {
  readonly kind: string
  /** Inner ellipse of the Classic marker (filled for End). */
  readonly inner: { readonly fillColor: string }
}

export interface WaitData extends SymbolData {
  readonly stub: Segment
}

export interface RoleStartData extends SymbolData {
  /** Line from the outside role into the pentagon (external starts). */
  readonly tip: Segment | null
  /** Name of the outside role, above the tip line. */
  readonly external: readonly TextLine[]
  readonly muted: Muted
}

export interface RefinementData extends SymbolData {
  readonly part: boolean
  /** Derived bar sections between the circle and its branches. */
  readonly bars: readonly Segment[]
}

export interface BranchData extends SymbolData {
  readonly part: boolean
}

export interface RoleData extends Warned {
  readonly radius: number
  readonly titleLines: readonly TextLine[]
  readonly goalLines: readonly TextLine[]
  /** The title always sits in a header inside the top of the role (kept for older callers). */
  readonly headerOutside: false
  /** Line under the header (Classic), in a color the dark canvas converts. */
  readonly separator: { readonly y: number; readonly lineColor: string } | null
  /** Colored dot before the title (Colorful). */
  readonly dot: { readonly cx: number; readonly cy: number; readonly r: number; readonly swatch: SwatchPair } | null
  /** Locked role (Format > Lock Position and Size): where the lock mark sits, after the title. */
  readonly lock: Rect | null
  readonly look: RadStyleName
}

// ---------------------------------------------------------------------------------------------
// Shared helpers

const lineHeightOf = (font: Font, g: RadGeometry): number => font.size + g.lineGap

function textWidth(ctx: LayoutContext, text: string, font: Font): number {
  return Math.ceil(ctx.measurer.measure(text, font).width)
}

/** Lines of `text` wrapped to `maxWidth`; empty text gives no lines. */
function wrapLines(ctx: LayoutContext, text: string, maxWidth: number, font: Font): string[] {
  const trimmed = text.trim()
  return trimmed === '' ? [] : wrapText(trimmed, maxWidth, font, ctx.measurer)
}

type Anchor = { readonly left: number; readonly top: number }

/** Left-aligned text block with its top-left corner at `at`. */
function blockLeft(ctx: LayoutContext, g: RadGeometry, lines: readonly string[], font: Font, at: Anchor): TextLine[] {
  const lh = lineHeightOf(font, g)
  return lines.map((text, i) => ({
    text,
    font,
    align: 'left' as const,
    box: { left: at.left, top: at.top + i * lh, width: textWidth(ctx, text, font), height: lh }
  }))
}

/** Centered text block: its lines centered on `cx`, the block's top at `top`. */
function blockCentered(ctx: LayoutContext, g: RadGeometry, lines: readonly string[], font: Font, cx: number, top: number): TextLine[] {
  const lh = lineHeightOf(font, g)
  return lines.map((text, i) => {
    const w = textWidth(ctx, text, font)
    return { text, font, align: 'center' as const, box: { left: cx - w / 2, top: top + i * lh, width: w, height: lh } }
  })
}

function boxesOf(lines: readonly TextLine[]): Rect[] {
  return lines.map((l) => l.box)
}

/** Union of text lines as one rectangle (null for no lines). */
function linesBounds(lines: readonly TextLine[]): Rect | null {
  return unionRects(boxesOf(lines))
}

/** Where label lines of `text` go relative to the symbol box. */
type LabelPlace = 'right' | 'right-above' | 'right-below' | 'above'

function placeLabel(ctx: LayoutContext, g: RadGeometry, box: Rect, text: string, font: Font, wrap: number, place: LabelPlace): TextLine[] {
  const lines = wrapLines(ctx, text, wrap, font)
  if (lines.length === 0) return []
  const lh = lineHeightOf(font, g)
  const total = lines.length * lh
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  switch (place) {
    case 'above':
      return blockCentered(ctx, g, lines, font, cx, box.top - 2 - total)
    case 'right-above':
      return blockLeft(ctx, g, lines, font, { left: box.left + box.width + g.labelGap / 2, top: cy - 2 - total })
    case 'right-below':
      return blockLeft(ctx, g, lines, font, { left: box.left + box.width + g.labelGap, top: cy + 3 })
    default:
      return blockLeft(ctx, g, lines, font, { left: box.left + box.width + g.labelGap, top: cy - total / 2 })
  }
}

/** The role view that visually contains `view`. */
function roleViewOf(view: View): View | null {
  const c = view.containerView ?? null
  return c && c._type === 'RADRoleView' ? c : null
}

/** Fill of a role in the diagram style (the user's color when they picked one). */
function roleFill(role: View, look: Look): string {
  return customColorsOf(role).fill ? styleOf(role).fillColor : RAD_ROLE_COLORS[look.name].fill
}

function haloOf(view: View, look: Look): string {
  const role = roleViewOf(view)
  return role ? roleFill(role, look) : '#ffffff'
}

/** How a symbol is filled when the user did not pick a fill. */
type SymbolFill = 'white' | 'ink'

/** The view style of a symbol with the diagram style's defaults and text size. */
function symbolStyle(view: View, look: Look, fill: SymbolFill): ViewStyle {
  const base = styleOf(view)
  const custom = customColorsOf(view)
  const lineColor = custom.line ? base.lineColor : RAD_INK
  return {
    lineColor,
    fillColor: custom.fill ? base.fillColor : fill === 'ink' ? lineColor : '#ffffff',
    fontColor: custom.font ? base.fontColor : RAD_INK,
    font: radFont(base.font, look.g),
    showShadow: false
  }
}

/** Colorful: which parts of a symbol take its role's color. */
function accentOf(view: View, look: Look, fill: AccentUse['fill'], text: AccentUse['text']): AccentUse | null {
  if (!look.colorful) return null
  const swatch = radSwatchOf(radRoleOf(view))
  if (!swatch) return null
  const custom = customColorsOf(view)
  return { swatch, line: !custom.line, fill: custom.fill ? null : fill, text: custom.font ? null : text }
}

// Warnings are computed once per layout pass and process.
const warningCache = new WeakMap<LayoutContext, Map<Elem, Map<string, RadWarning[]>>>()

function positionIn(ctx: LayoutContext): (el: Elem) => { x: number; y: number } | null {
  const byModel = new Map<Elem, View>()
  for (const v of ctx.diagram.ownedViews ?? []) if (v.model && isKindOf(v, 'NodeView') && v.visible !== false) byModel.set(v.model, v)
  return (el) => {
    const v = byModel.get(el) as NodeView | undefined
    return v ? { x: (v.left ?? 0) + (v.width ?? 0) / 2, y: (v.top ?? 0) + (v.height ?? 0) / 2 } : null
  }
}

/** Warnings about `model`, computed for its process once per layout pass. */
function warningsOf(ctx: LayoutContext, model: Elem | null | undefined): readonly RadWarning[] {
  if (!model) return []
  let process: Elem | null = model
  while (process && !isKindOf(process, 'RADProcess')) process = process._parent
  if (!process) return []
  let perProcess = warningCache.get(ctx)
  if (!perProcess) warningCache.set(ctx, (perProcess = new Map()))
  let map = perProcess.get(process)
  if (!map) perProcess.set(process, (map = radWarningsByElement(process, { position: positionIn(ctx) })))
  return map.get(model._id) ?? []
}

function warned(ctx: LayoutContext, model: Elem | null | undefined, lines: readonly TextLine[], box: Rect): Warned {
  const ws = warningsOf(ctx, model)
  if (ws.length === 0) return { warnTitle: '', warnLines: [] }
  const under = lines.length > 0 ? lines.map((l) => ({ left: l.box.left, top: l.box.top + l.box.height - 1, width: l.box.width, height: 0 })) : [{ left: box.left, top: box.top + box.height + 3, width: box.width, height: 0 }]
  return { warnTitle: ws.map((w) => w.message).join('\n'), warnLines: under }
}

/** Center of a symbol view's stored box: where the symbol is drawn, whatever its size. */
function storedCenter(view: NodeView): { x: number; y: number } {
  const b = storedBox(view)
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
}

/** The drawn box of a symbol: `width × height` centered on its stored position. */
function boxAt(view: NodeView, width: number, height: number): Rect {
  const c = storedCenter(view)
  return { left: c.x - width / 2, top: c.y - height / 2, width, height }
}

/** Fixed-size copy of a view at its drawn box: symbols cannot be resized, only moved. */
function fixed(view: NodeView, box: Rect): NodeView {
  // A prototype-backed overlay: copying every field of the view costs more than the layout itself.
  const copy = Object.create(view) as NodeView
  copy.left = box.left
  copy.top = box.top
  copy.width = box.width
  copy.height = box.height
  copy.autoResize = false
  return copy
}

function nameRegions(label: readonly TextLine[], box: Rect, font: Font, target: EditRegion['target'], text: string, card: boolean): EditRegion[] {
  const regions: EditRegion[] = []
  const lb = card ? null : linesBounds(label)
  if (lb) regions.push({ box: lb, target, text, font })
  regions.push({ box: lb || card ? box : { left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }, target, text, font })
  return regions
}

function nameTarget(model: Elem): EditRegion['target'] {
  return { kind: 'custom', elementId: model._id, syntax: 'radName' }
}

function symbolNode<D>(
  view: NodeView,
  ctx: LayoutContext,
  look: Look,
  init: {
    box: Rect
    outline: NodeOutline
    style: ViewStyle
    lines: readonly TextLine[]
    content: readonly Rect[]
    accent: AccentUse | null
    card?: boolean
    data: (box: Rect, base: SymbolData) => D
    extraBounds?: readonly Rect[]
    target?: EditRegion['target'] | null
    editText?: string
    editFont?: Font
  }
): NodeLayout<D> {
  const model = view.model
  const card = init.card === true
  const { width, height } = init.box
  const laid = nodeLayout(fixed(view, init.box), {
    minWidth: width,
    minHeight: height,
    sizable: 'none',
    outline: init.outline,
    style: init.style,
    extraBounds: [...(init.extraBounds ?? []), ...boxesOf(init.lines)],
    regions: (box) => {
      const target = init.target === undefined ? (model ? nameTarget(model) : null) : init.target
      return target ? nameRegions(init.lines, box, init.editFont ?? init.style.font, target, init.editText ?? nameOf(model), card) : []
    },
    data: (box) => {
      const base: SymbolData = {
        lines: init.lines,
        content: [box, ...init.content],
        halo: haloOf(view, look),
        look: look.name,
        accent: init.accent,
        card,
        label: { fontColor: init.style.fontColor },
        ...warned(ctx, model, init.lines, box)
      }
      return init.data(box, base)
    }
  })
  // One rectangle around the symbol, its text and its stub (a wait's arrow) is where it is grabbed.
  const grab = unionRects([laid.box, ...init.content, ...boxesOf(init.lines)])
  // Snapped by the center when moved, like it is placed: the thread through it stays straight.
  return { ...laid, snapCenter: true, ...(grab ? { outerHitAreas: [inflateRect(grab, SYMBOL_GRAB_MARGIN)] } : {}) }
}

/** Margin of the grab rectangle around a symbol and its text (diagram units). */
const SYMBOL_GRAB_MARGIN = 4

/**
 * Colorful card: `text` centered inside a box at least `minWidth` wide and as wide as the text
 * needs, wrapping past the maximum width; centered on the view's stored position.
 */
function cardOf(ctx: LayoutContext, look: Look, view: NodeView, text: string, font: Font, minWidth: number): { box: Rect; lines: TextLine[] } {
  const c = look.g.card
  const wrapped = wrapLines(ctx, text, c.maxWidth - 2 * c.padX, font)
  const widest = wrapped.reduce((w, line) => Math.max(w, textWidth(ctx, line, font)), 0)
  const lh = lineHeightOf(font, look.g)
  const width = Math.ceil(Math.max(minWidth, Math.min(c.maxWidth, widest + 2 * c.padX)))
  const height = Math.ceil(Math.max(c.height, wrapped.length * lh + 2 * c.padY))
  const box = boxAt(view, width, height)
  const lines = blockCentered(ctx, look.g, wrapped, font, box.left + width / 2, box.top + (height - wrapped.length * lh) / 2)
  return { box, lines }
}

/**
 * Whether a thread of an empty path enters `view` from its right side (a branch circle right of it
 * whose line drops past it), in which case the label moves above that line. Uses stored positions
 * because other nodes are not laid out yet.
 */
function entersFromRight(view: NodeView, ctx: LayoutContext): boolean {
  const c = storedCenter(view)
  for (const v of edgesAt(ctx, 'RADStateLineView').get(view) ?? []) {
    if (v.model?.['loopBack'] === true || v.model?.['routing'] === 'bus') continue
    if (v.head !== view || !v.tail || !isKindOf(v.tail.model, 'RADBranch')) continue
    const t = storedCenter(v.tail as NodeView)
    if (t.x > c.x + 2 && c.y > t.y + 6) return true
  }
  return false
}

/** The interaction link views joined to an interaction view, and the partner views. */
function linkPartners(view: NodeView, ctx: LayoutContext): NodeView[] {
  const out: NodeView[] = []
  for (const v of edgesAt(ctx, 'RADInteractionLinkView').get(view) ?? []) {
    if (v.tail === view && v.head && isKindOf(v.head, 'NodeView')) out.push(v.head as NodeView)
    else if (v.head === view && v.tail && isKindOf(v.tail, 'NodeView')) out.push(v.tail as NodeView)
  }
  return out
}

const bold = (font: Font): Font => withFontStyle(font, true, false)
const italic = (font: Font): Font => withFontStyle(font, false, true)
/** Secondary text: a little smaller and italic. */
const small = (font: Font): Font => italic({ ...font, size: Math.round(font.size * 0.9 * 10) / 10 })

// ---------------------------------------------------------------------------------------------
// Activities and interactions

/**
 * Activity or interaction. Classic: a 14 square (filled for an activity, hollow for an
 * interaction) with its label to the right, above the link line for a linked interaction.
 * Colorful: a card, filled with the role color (activity) or outlined in it (interaction).
 */
export function layoutActivity(view: NodeView, ctx: LayoutContext): NodeLayout<ActivityData> {
  const look = radLookOf(ctx)
  const g = look.g
  const model = view.model
  const interaction = isKindOf(model, 'RADInteraction')
  const style = symbolStyle(view, look, interaction ? 'white' : 'ink')
  const partners = interaction ? linkPartners(view, ctx) : []
  const external = interaction && typeof model?.['externalParty'] === 'string' ? model['externalParty'].trim() : ''
  const c = storedCenter(view)
  let stubSide: 'left' | 'right' | null = null
  const partner = partners[0]
  if (partner) stubSide = storedCenter(partner).x >= c.x ? 'right' : 'left'
  else if (external !== '') stubSide = model?.['side'] === 'right' ? 'right' : 'left'

  let box: Rect
  let lines: TextLine[]
  let editFont = style.font
  if (look.colorful) {
    editFont = interaction ? style.font : bold(style.font)
    const card = cardOf(ctx, look, view, nameOf(model), editFont, g.card.minWidth)
    box = card.box
    lines = card.lines
  } else {
    box = boxAt(view, g.square, g.square)
    let place: LabelPlace = 'right'
    // A linked interaction keeps its label above the link line, so the line never crosses it.
    if (stubSide !== null) place = 'right-above'
    if (place === 'right' && entersFromRight(view, ctx)) place = 'right-above'
    lines = placeLabel(ctx, g, box, nameOf(model), style.font, g.activityWrap, place)
  }

  let stub: Segment | null = null
  let caption: TextLine[] = []
  const extra: Rect[] = []
  if (interaction && external !== '' && partners.length === 0 && stubSide) {
    const cy = box.top + box.height / 2
    const far = stubSide === 'left' ? box.left - g.externalStub : box.left + box.width + g.externalStub
    stub = { x1: stubSide === 'left' ? far : box.left + box.width, x2: stubSide === 'left' ? box.left : far, y: cy }
    const font = small(style.font)
    const cl = wrapLines(ctx, external, g.externalStub - 8, font)
    caption = blockLeft(ctx, g, cl, font, { left: Math.min(stub.x1, stub.x2) + 8, top: cy + 3 })
    extra.push({ left: Math.min(stub.x1, stub.x2), top: cy - 2, width: g.externalStub, height: 4 }, ...boxesOf(caption))
  }
  return symbolNode(view, ctx, look, {
    box,
    outline: 'rect',
    style,
    lines,
    // The stub reaches outside the role: part of the export bounds, not of what the role holds.
    content: boxesOf(lines),
    extraBounds: extra,
    accent: accentOf(view, look, interaction ? null : 'accent', interaction ? null : 'onAccent'),
    card: look.colorful,
    data: (_b, base) => ({ ...base, interaction, stub, stubWidth: g.lines.interaction, caption, muted: { fontColor: RAD_MUTED } }),
    editText: nameOf(model),
    editFont
  })
}

// ---------------------------------------------------------------------------------------------
// Undefined process, state marker, wait, role start

/** Undefined process. Classic: a 26 × 15 ellipse; Colorful: a dashed pill with italic gray text. */
export function layoutUndefinedProcess(view: NodeView, ctx: LayoutContext): NodeLayout<SymbolData> {
  const look = radLookOf(ctx)
  const g = look.g
  const style = symbolStyle(view, look, 'white')
  if (look.colorful) {
    const font = italic(style.font)
    const card = cardOf(ctx, look, view, nameOf(view.model), font, g.card.minWidth)
    const muted = customColorsOf(view).font ? style : { ...style, fontColor: RAD_MUTED }
    return symbolNode(view, ctx, look, { box: card.box, outline: 'rect', style: muted, lines: card.lines, content: boxesOf(card.lines), accent: accentOf(view, look, null, null), card: true, data: (_b, base) => base, editFont: font })
  }
  const box = boxAt(view, g.ellipse.width, g.ellipse.height)
  const lines = placeLabel(ctx, g, box, nameOf(view.model), style.font, g.activityWrap, entersFromRight(view, ctx) ? 'right-above' : 'right')
  return symbolNode(view, ctx, look, { box, outline: 'ellipse', style, lines, content: boxesOf(lines), accent: null, data: (_b, base) => base })
}

/**
 * State marker (start, end or a named state). Classic: a 24 × 15 double ellipse, its inner one
 * filled for End. Colorful: a pill with the name inside (outlined Start, filled End, tinted state).
 */
export function layoutStateMarker(view: NodeView, ctx: LayoutContext): NodeLayout<MarkerData> {
  const look = radLookOf(ctx)
  const g = look.g
  const kind = typeof view.model?.['kind'] === 'string' ? (view.model['kind'] as string) : 'state'
  const style = symbolStyle(view, look, 'white')
  const inner = { fillColor: kind === 'end' ? style.lineColor : style.fillColor }
  if (look.colorful) {
    const font = kind === 'state' ? style.font : bold(style.font)
    const name = nameOf(view.model)
    const card = cardOf(ctx, look, view, name, font, kind === 'state' && name.trim() !== '' ? g.card.minWidth : g.pill)
    const accent = accentOf(view, look, kind === 'end' ? 'accent' : kind === 'state' ? 'tint' : null, kind === 'end' ? 'onAccent' : kind === 'start' ? 'accent' : null)
    return symbolNode(view, ctx, look, { box: card.box, outline: 'rect', style, lines: card.lines, content: boxesOf(card.lines), accent, card: true, data: (_b, base) => ({ ...base, kind, inner }), editFont: font })
  }
  const box = boxAt(view, g.marker.outerW, g.marker.outerH)
  const lines = placeLabel(ctx, g, box, nameOf(view.model), style.font, g.activityWrap, entersFromRight(view, ctx) ? 'right-above' : 'right')
  return symbolNode(view, ctx, look, { box, outline: 'ellipse', style, lines, content: boxesOf(lines), accent: null, data: (_b, base) => ({ ...base, kind, inner }) })
}

/** Wait: a circle with an arrow coming in from the left (Colorful: a clock face, gray italic label). */
export function layoutWait(view: NodeView, ctx: LayoutContext): NodeLayout<WaitData> {
  const look = radLookOf(ctx)
  const g = look.g
  const base = symbolStyle(view, look, 'white')
  const style = look.colorful && !customColorsOf(view).font ? { ...base, fontColor: RAD_MUTED, font: italic(base.font) } : base
  const box = boxAt(view, g.circle, g.circle)
  const lines = placeLabel(ctx, g, box, nameOf(view.model), style.font, g.activityWrap, 'right')
  const cy = box.top + box.height / 2
  const stub: Segment = { x1: box.left - g.waitStub, x2: box.left, y: cy }
  const stubBox = { left: stub.x1, top: cy - 4, width: g.waitStub, height: 8 }
  return symbolNode(view, ctx, look, {
    box,
    outline: 'ellipse',
    style,
    lines,
    content: [...boxesOf(lines), stubBox],
    extraBounds: [stubBox],
    accent: accentOf(view, look, null, null),
    data: (_b, b) => ({ ...b, stub })
  })
}

/**
 * Role start: a pentagon pointing right. An outside role that starts the thread comes in from the
 * left: a line with an arrow into the pentagon, the role's name above the line.
 */
export function layoutRoleStart(view: NodeView, ctx: LayoutContext): NodeLayout<RoleStartData> {
  const look = radLookOf(ctx)
  const g = look.g
  const base = symbolStyle(view, look, 'white')
  const style = look.colorful ? { ...base, font: bold(base.font) } : base
  const model = view.model
  const box = boxAt(view, g.pentagon, g.pentagon)
  const cy = box.top + box.height / 2
  const externalRole = typeof model?.['externalRole'] === 'string' ? (model['externalRole'] as string).trim() : ''
  const role = model?.['role'] as Elem | null | undefined
  const own = nameOf(model)
  const lines = placeLabel(ctx, g, box, own !== '' ? own : nameOf(role), style.font, g.activityWrap, 'right')
  let tip: Segment | null = null
  let external: TextLine[] = []
  const extra: Rect[] = []
  let target: EditRegion['target'] | undefined
  if (externalRole !== '' && model) {
    tip = { x1: box.left - g.roleStartTip, x2: box.left, y: cy }
    const font = small(base.font)
    const wrapped = wrapLines(ctx, externalRole, g.activityWrap, font)
    const total = wrapped.length * lineHeightOf(font, g)
    // Right-aligned to end before the pentagon, so the thread coming down into it never crosses it.
    const widest = wrapped.reduce((w, line) => Math.max(w, textWidth(ctx, line, font)), 0)
    external = blockLeft(ctx, g, wrapped, font, { left: Math.min(tip.x1, box.left - 6 - widest), top: cy - 3 - total })
    extra.push({ left: tip.x1, top: cy - 5, width: g.roleStartTip, height: 10 }, ...boxesOf(external))
    target = { kind: 'field', elementId: model._id, field: 'externalRole' }
  }
  const node = symbolNode(view, ctx, look, {
    box,
    outline: 'rect',
    style,
    lines,
    content: [...boxesOf(lines), ...extra],
    extraBounds: extra,
    accent: accentOf(view, look, 'accent', null),
    data: (_b, b) => ({ ...b, tip, external, muted: { fontColor: RAD_MUTED } }),
    editText: own
  })
  // The outside role's name is edited where it is written.
  const eb = linesBounds(external)
  if (!target || !eb) return node
  return { ...node, regions: [{ box: eb, target, text: externalRole, font: small(base.font) }, ...node.regions] }
}

// ---------------------------------------------------------------------------------------------
// Refinements and branches

/** Branch views of a refinement view, left to right. */
function branchViewsOf(refinement: NodeView, ctx: LayoutContext): NodeView[] {
  const out: NodeView[] = []
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== 'RADBranchView' || v.visible === false || !v.model || v.model['refinement'] !== refinement.model) continue
    out.push(v as NodeView)
  }
  return out.sort((a, b) => storedCenter(a).x - storedCenter(b).x)
}

const ROW_TOLERANCE = 6

/** Drawn size of a branch symbol. */
function branchSize(view: NodeView, g: RadGeometry): { width: number; height: number } {
  return isKindOf(view.model, 'RADPartBranch') ? g.triangle : { width: g.branchCircle, height: g.branchCircle }
}

/** Left and right attachment x of a branch symbol on the bar through `y`. */
function branchBarSpan(branch: NodeView, y: number, g: RadGeometry): { left: number; right: number } {
  const size = branchSize(branch, g)
  const box = boxAt(branch, size.width, size.height)
  if (isKindOf(branch.model, 'RADPartBranch')) {
    // Triangle (apex up): the bar meets the slanted sides at height y.
    const frac = Math.min(1, Math.max(0, (y - box.top) / Math.max(1, box.height)))
    const half = (box.width * frac) / 2
    const cx = box.left + box.width / 2
    return { left: cx - half, right: cx + half }
  }
  return { left: box.left, right: box.left + box.width }
}

export function layoutRefinement(view: NodeView, ctx: LayoutContext): NodeLayout<RefinementData> {
  const look = radLookOf(ctx)
  const g = look.g
  const base = symbolStyle(view, look, 'white')
  // The question is bold in both styles.
  const style = { ...base, font: bold(base.font) }
  const part = isKindOf(view.model, 'RADPartRefinement')
  const box = boxAt(view, g.refinement, g.refinement)
  const cy = box.top + box.height / 2
  const right = box.left + box.width
  const onRow = branchViewsOf(view, ctx).filter((b) => Math.abs(storedCenter(b).y - cy) <= ROW_TOLERANCE && storedCenter(b).x > right)
  const bars: Segment[] = []
  let from = right
  for (const b of onRow) {
    const span = branchBarSpan(b, cy, g)
    if (span.left > from) bars.push({ x1: from, x2: span.left, y: cy })
    from = span.right
  }
  // The question sits above the bar (a thread would show between its words on it), clear of the
  // condition written above the first alternative.
  const first = onRow[0]
  const gap = first ? storedCenter(first).x - conditionHalfWidth(first, ctx, look) - 6 - (right + g.labelGap / 2) : g.questionWrap
  const wrap = Math.max(48, Math.min(g.questionWrap, gap))
  const lines = placeLabel(ctx, g, box, nameOf(view.model), style.font, wrap, 'right-above')
  return symbolNode(view, ctx, look, {
    box,
    outline: 'ellipse',
    style,
    lines,
    content: boxesOf(lines),
    accent: accentOf(view, look, null, null),
    data: (_b, b) => ({ ...b, part, bars })
  })
}

/** Half the width of the condition drawn above a case branch (0 for a part branch). */
function conditionHalfWidth(branch: NodeView, ctx: LayoutContext, look: Look): number {
  if (isKindOf(branch.model, 'RADPartBranch')) return 0
  const font = small(symbolStyle(branch, look, 'white').font)
  const widths = wrapLines(ctx, nameOf(branch.model), look.g.branchWrap, font).map((t) => ctx.measurer.measure(t, font).width)
  return widths.length > 0 ? Math.max(...widths) / 2 : 0
}

/** Branch: a circle (case, with its condition above in gray italic) or a triangle (part). */
export function layoutBranch(view: NodeView, ctx: LayoutContext): NodeLayout<BranchData> {
  const look = radLookOf(ctx)
  const g = look.g
  const base = symbolStyle(view, look, 'white')
  const part = isKindOf(view.model, 'RADPartBranch')
  const style = !part && !customColorsOf(view).font ? { ...base, fontColor: RAD_MUTED, font: small(base.font) } : base
  const size = branchSize(view, g)
  const box = boxAt(view, size.width, size.height)
  const lines = placeLabel(ctx, g, box, nameOf(view.model), style.font, g.branchWrap, part ? 'right-below' : 'above')
  return symbolNode(view, ctx, look, {
    box,
    outline: part ? 'rect' : 'ellipse',
    style,
    lines,
    content: boxesOf(lines),
    accent: accentOf(view, look, null, null),
    data: (_b, b) => ({ ...b, part })
  })
}

// ---------------------------------------------------------------------------------------------
// Role

interface ChildContent {
  readonly rects: readonly Rect[]
}

function contentOf(child: View, ctx: LayoutContext): ChildContent | null {
  if (!isKindOf(child, 'NodeView') || child.visible === false) return null
  try {
    const l = nodeNotationFor(child).layout(child as NodeView, ctx)
    const c = (l.data as Partial<RadContent> | null)?.content
    return { rects: c && c.length > 0 ? c : [l.box, ...(l.extraBounds ?? [])] }
  } catch {
    return null
  }
}

/** Whether a state line of this role loops back (it needs a free lane left of the symbols). */
function hasLoopBack(view: NodeView, ctx: LayoutContext): boolean {
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== 'RADStateLineView' || v.model?.['loopBack'] !== true) continue
    if ((v as EdgeView).tail?.containerView === view) return true
  }
  return false
}

/** Where the title starts inside the role (Colorful leaves room for the dot). */
const titleInset = (look: Look): number => (look.colorful ? 24 : 11)

/** Title and goal lines of a role header for a role of the given width. */
function headerLines(ctx: LayoutContext, look: Look, view: NodeView, style: ViewStyle, width: number) {
  const titleFont = bold(style.font)
  const goalFont = italic(style.font)
  const model = view.model
  const room = Math.max(40, width - titleInset(look) - 10)
  const title = wrapLines(ctx, roleTitle(model), room, titleFont)
  const goalText = view['showGoal'] === true && typeof model?.['goal'] === 'string' ? (model['goal'] as string) : ''
  const goal = wrapLines(ctx, goalText === '' ? '' : `Goal: ${goalText}`, room, goalFont)
  const lh = lineHeightOf(titleFont, look.g)
  const height = 2 * look.g.headerPad + Math.max(1, title.length + goal.length) * lh
  return { titleFont, goalFont, title, goal, lh, height }
}

/** Header lines of a laid-out role box. */
function placedHeader(ctx: LayoutContext, look: Look, view: NodeView, style: ViewStyle, box: Rect) {
  const h = headerLines(ctx, look, view, style, box.width)
  const left = box.left + titleInset(look)
  const top = box.top + look.g.headerPad
  const titleLines = blockLeft(ctx, look.g, h.title, h.titleFont, { left, top })
  const goalLines = blockLeft(ctx, look.g, h.goal, h.goalFont, { left, top: top + h.title.length * h.lh })
  return { ...h, titleLines, goalLines }
}

/**
 * Role: rounded rectangle holding its views, with the `Agent- Role` title in a header at its top
 * (Classic: a line under it; Colorful: the role's color dot before it). The box grows to contain
 * every contained view and its label plus a padding (a free lane on the left for loop-backs);
 * with auto-resize it is exactly that size.
 */
export function layoutRole(view: NodeView, ctx: LayoutContext): NodeLayout<RoleData> {
  const look = radLookOf(ctx)
  const g = look.g
  const base = styleOf(view)
  const custom = customColorsOf(view)
  const colors = RAD_ROLE_COLORS[look.name]
  const style: ViewStyle = {
    lineColor: custom.line ? base.lineColor : colors.line,
    fillColor: custom.fill ? base.fillColor : colors.fill,
    fontColor: custom.font ? base.fontColor : RAD_TITLE,
    font: radFont(base.font, g),
    showShadow: false
  }
  const model = view.model
  const stored = storedBox(view)
  const rects: Rect[] = []
  for (const child of view.containedViews ?? []) {
    const c = contentOf(child, ctx)
    if (c) rects.push(...c.rects)
  }
  const union = unionRects(rects)
  const loop = hasLoopBack(view, ctx)
  // Across first: the width does not depend on the header, and the title wraps to it.
  let left = stored.left
  let reqRight = stored.left + g.roleMin.width
  if (union) {
    const rl = union.left - g.rolePad - (loop ? g.loopLane : 0)
    const rr = union.left + union.width + g.rolePad
    // The canvas starts at 0: a role does not grow left past it (wider Colorful cards near the
    // edge). Upward it still grows, so its header never covers the first step.
    left = Math.max(view.autoResize ? rl : Math.min(stored.left, rl), Math.min(stored.left, 0))
    reqRight = Math.max(rr, left + g.roleMin.width)
  }
  const width = view.autoResize ? reqRight - left : Math.max(stored.left + stored.width, reqRight) - left
  const headerH = headerLines(ctx, look, view, style, Math.ceil(width)).height
  let top = stored.top
  let reqBottom = stored.top + Math.max(g.roleMin.height, headerH + g.rolePad)
  if (union) {
    const rt = union.top - g.rolePad / 2 - headerH
    const rb = union.top + union.height + g.rolePad
    top = view.autoResize ? rt : Math.min(stored.top, rt)
    reqBottom = Math.max(rb, top + g.roleMin.height, top + headerH + g.rolePad)
  }
  const positioned = {
    ...view,
    left,
    top,
    width: view.autoResize ? 0 : Math.max(stored.left + stored.width - left, 0),
    height: view.autoResize ? 0 : Math.max(stored.top + stored.height - top, 0)
  } as NodeView
  const locked = view['locked'] === true
  const swatch = look.colorful ? radSwatchOf(model) : null
  const laid = nodeLayout(positioned, {
    minWidth: reqRight - left,
    minHeight: reqBottom - top,
    sizable: locked ? 'none' : 'free',
    movable: !locked,
    zIndex: -1,
    style,
    data: (box): RoleData => {
      const h = placedHeader(ctx, look, view, style, box)
      const title = linesBounds(h.titleLines)
      const titleMid = title ? title.top + title.height / 2 : box.top + h.height / 2
      const lock = locked ? { left: (title ? title.left + title.width : box.left) + 6, top: titleMid - 6, width: 9, height: 11 } : null
      return {
        radius: g.roleRadius,
        titleLines: h.titleLines,
        goalLines: h.goalLines,
        headerOutside: false,
        separator: look.colorful ? null : { y: box.top + h.height, lineColor: colors.separator },
        dot: swatch ? { cx: box.left + 13.5, cy: titleMid, r: 3.5, swatch } : null,
        lock,
        look: look.name,
        ...warned(ctx, model, h.titleLines, box)
      }
    },
    regions: (box) => {
      if (!model) return []
      const h = placedHeader(ctx, look, view, style, box)
      const out: EditRegion[] = []
      const tb = linesBounds(h.titleLines) ?? { left: box.left + titleInset(look), top: box.top + g.headerPad, width: Math.min(box.width - titleInset(look), 120), height: h.lh }
      out.push({ box: tb, target: { kind: 'custom', elementId: model._id, syntax: 'radRoleTitle' }, text: roleTitle(model), font: h.titleFont })
      const gb = linesBounds(h.goalLines)
      if (gb) out.push({ box: gb, target: { kind: 'field', elementId: model._id, field: 'goal' }, text: typeof model['goal'] === 'string' ? (model['goal'] as string) : '', font: h.goalFont })
      return out
    }
  })
  const header = { left: laid.box.left, top: laid.box.top, width: laid.box.width, height: headerLines(ctx, look, view, style, laid.box.width).height }
  return {
    ...laid,
    derivedPosition: true,
    // A locked role is picked only by its header: presses on its body select what is inside
    // (or start a rubber band) instead of grabbing the role.
    ...(locked ? { hitAreas: [header] } : {})
  }
}
