/**
 * Measure/arrange of RAD nodes (spec 10 section 5): role boxes that grow to fit their content with
 * the `Agent- Role` header, the symbols on the threads (activities and interactions, undefined
 * processes, state markers, waits, role starts), refinements with their derived bars, and their
 * branches. Pure: reads the model and returns layout data.
 */
import { isKindOf, type Elem, type NodeView, type View } from '../../model'
import { unionRects, wrapText, withFontStyle, type Font, type NodeOutline, type Rect } from '../core'
import { nameOf, nodeLayout, storedBox, styleOf } from '../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine, ViewStyle } from '../layout/types'
import { nodeNotationFor } from '../render/registry'
import { roleTitle } from './strings'
import { radWarningsByElement, type RadWarning } from './validation'

// ---------------------------------------------------------------------------------------------
// Geometry (diagram units)

export const RAD_GEOMETRY = {
  square: 24,
  circle: 24,
  triangle: { width: 26, height: 24 },
  ellipse: { width: 44, height: 26 },
  marker: { outerW: 30, outerH: 18, innerW: 18, innerH: 10 },
  pentagon: 26,
  /** Gap between a symbol and its label to the right. */
  labelGap: 10,
  activityWrap: 150,
  branchWrap: 120,
  questionWrap: 150,
  /** Extra line spacing of label lines (line height = font size + this). */
  lineGap: 3,
  waitStub: 40,
  roleStartTip: 60,
  externalStub: 110,
  roleMin: { width: 160, height: 120 },
  rolePad: 24,
  roleRadius: 20,
  /** The loop-back lane lies this far left of the leftmost symbol. */
  loopLane: 22,
  titleGap: 6
} as const

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
}

export interface Segment {
  readonly x1: number
  readonly x2: number
  readonly y: number
}

export interface ActivityData extends SymbolData {
  readonly interaction: boolean
  /** Interaction with an outside party: the stub drawn from the square. */
  readonly stub: Segment | null
  readonly caption: readonly TextLine[]
}

export interface MarkerData extends SymbolData {
  readonly kind: string
}

export interface WaitData extends SymbolData {
  readonly stub: Segment
}

export interface RoleStartData extends SymbolData {
  /** Line from the tip to the arrow end (external starts). */
  readonly tip: Segment | null
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
  readonly headerOutside: boolean
}

// ---------------------------------------------------------------------------------------------
// Shared helpers

const lineHeightOf = (font: Font): number => font.size + RAD_GEOMETRY.lineGap

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
function blockLeft(ctx: LayoutContext, lines: readonly string[], font: Font, at: Anchor): TextLine[] {
  const lh = lineHeightOf(font)
  return lines.map((text, i) => ({
    text,
    font,
    align: 'left' as const,
    box: { left: at.left, top: at.top + i * lh, width: textWidth(ctx, text, font), height: lh }
  }))
}

/** Centered text block: its lines centered on `cx`, the block's top at `top`. */
function blockCentered(ctx: LayoutContext, lines: readonly string[], font: Font, cx: number, top: number): TextLine[] {
  const lh = lineHeightOf(font)
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

function placeLabel(ctx: LayoutContext, box: Rect, text: string, font: Font, wrap: number, place: LabelPlace): TextLine[] {
  const lines = wrapLines(ctx, text, wrap, font)
  if (lines.length === 0) return []
  const lh = lineHeightOf(font)
  const total = lines.length * lh
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  switch (place) {
    case 'above':
      return blockCentered(ctx, lines, font, cx, box.top - 3 - total)
    case 'right-above':
      return blockLeft(ctx, lines, font, { left: box.left + box.width + RAD_GEOMETRY.labelGap, top: cy - 3 - total })
    case 'right-below':
      return blockLeft(ctx, lines, font, { left: box.left + box.width + RAD_GEOMETRY.labelGap, top: cy + 3 })
    default:
      return blockLeft(ctx, lines, font, { left: box.left + box.width + RAD_GEOMETRY.labelGap, top: cy - total / 2 })
  }
}

/** The role view that visually contains `view`. */
function roleViewOf(view: View): View | null {
  const c = view.containerView ?? null
  return c && c._type === 'RADRoleView' ? c : null
}

function haloOf(view: View): string {
  const role = roleViewOf(view)
  return role ? styleOf(role).fillColor : '#ffffff'
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

/** Fixed-size copy of a view: symbols cannot be resized, only moved. */
function fixed(view: NodeView, width: number, height: number): NodeView {
  return { ...view, width, height, autoResize: false } as NodeView
}

function nameRegions(view: NodeView, label: readonly TextLine[], box: Rect, font: Font, target: EditRegion['target'], text: string): EditRegion[] {
  const regions: EditRegion[] = []
  const lb = linesBounds(label)
  if (lb) regions.push({ box: lb, target, text, font })
  regions.push({ box: lb ? box : { left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }, target, text, font })
  void view
  return regions
}

function nameTarget(model: Elem): EditRegion['target'] {
  return { kind: 'custom', elementId: model._id, syntax: 'radName' }
}

function symbolNode<D>(
  view: NodeView,
  ctx: LayoutContext,
  init: {
    width: number
    height: number
    outline: NodeOutline
    style: ViewStyle
    lines: readonly TextLine[]
    content: readonly Rect[]
    data: (box: Rect, base: SymbolData) => D
    extraBounds?: readonly Rect[]
    target?: EditRegion['target'] | null
    editText?: string
  }
): NodeLayout<D> {
  const model = view.model
  const laid = nodeLayout(fixed(view, init.width, init.height), {
    minWidth: init.width,
    minHeight: init.height,
    sizable: 'none',
    outline: init.outline,
    style: init.style,
    extraBounds: [...(init.extraBounds ?? []), ...boxesOf(init.lines)],
    regions: (box) => {
      const target = init.target === undefined ? (model ? nameTarget(model) : null) : init.target
      return target ? nameRegions(view, init.lines, box, init.style.font, target, init.editText ?? nameOf(model)) : []
    },
    data: (box) => {
      const base: SymbolData = {
        lines: init.lines,
        content: [box, ...init.content],
        halo: haloOf(view),
        ...warned(ctx, model, init.lines, box)
      }
      return init.data(box, base)
    }
  })
  return init.lines.length > 0 ? { ...laid, outerHitAreas: boxesOf(init.lines) } : laid
}

/** Layout fields shared by symbol views: the symbol box moves with the stored position. */
function boxAt(view: NodeView, width: number, height: number): Rect {
  const b = storedBox(view)
  return { left: b.left, top: b.top, width, height }
}

/**
 * Whether a thread of an empty path enters `view` from its right side (a branch circle right of it
 * whose line drops past it), in which case the label moves above that line. Uses stored positions
 * because other nodes are not laid out yet.
 */
function entersFromRight(view: NodeView, ctx: LayoutContext): boolean {
  const cx = (view.left ?? 0) + (view.width ?? 0) / 2
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== 'RADStateLineView' || v.visible === false || v.model?.['loopBack'] === true || v.model?.['routing'] === 'bus') continue
    const e = v as unknown as { tail: NodeView | null; head: View | null }
    if (e.head !== view || !e.tail || !isKindOf(e.tail.model, 'RADBranch')) continue
    const t = e.tail
    if ((t.left ?? 0) + (t.width ?? 0) / 2 > cx + 2 && (view.top ?? 0) + (view.height ?? 0) / 2 > (t.top ?? 0) + (t.height ?? 0)) return true
  }
  return false
}

/** The interaction link views joined to an interaction view, and the partner views. */
function linkPartners(view: NodeView, ctx: LayoutContext): NodeView[] {
  const out: NodeView[] = []
  for (const v of ctx.diagram.ownedViews ?? []) {
    if (v._type !== 'RADInteractionLinkView' || v.visible === false) continue
    const e = v as unknown as { tail: View | null; head: View | null }
    if (e.tail === view && e.head && isKindOf(e.head, 'NodeView')) out.push(e.head as NodeView)
    else if (e.head === view && e.tail && isKindOf(e.tail, 'NodeView')) out.push(e.tail as NodeView)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Activities and interactions

/** Activity: 24 × 24 square; label to the right (above the link line for interactions linked to the right). */
export function layoutActivity(view: NodeView, ctx: LayoutContext): NodeLayout<ActivityData> {
  const style = styleOf(view)
  const model = view.model
  const g = RAD_GEOMETRY
  const box = boxAt(view, g.square, g.square)
  const interaction = isKindOf(model, 'RADInteraction')
  let place: LabelPlace = 'right'
  let stub: Segment | null = null
  let stubSide: 'left' | 'right' | null = null
  if (interaction) {
    const partner = linkPartners(view, ctx)[0]
    if (partner) stubSide = (partner.left ?? 0) + (partner.width ?? 0) / 2 >= box.left + box.width / 2 ? 'right' : 'left'
    else if (typeof model?.['externalParty'] === 'string' && model['externalParty'].trim() !== '') stubSide = model['side'] === 'right' ? 'right' : 'left'
    if (stubSide === 'right') place = 'right-above'
  }
  if (place === 'right' && entersFromRight(view, ctx)) place = 'right-above'
  const lines = placeLabel(ctx, box, nameOf(model), style.font, g.activityWrap, place)
  let caption: TextLine[] = []
  const extra: Rect[] = []
  const external = interaction && typeof model?.['externalParty'] === 'string' ? model['externalParty'].trim() : ''
  if (interaction && external !== '' && linkPartners(view, ctx).length === 0 && stubSide) {
    const cy = box.top + box.height / 2
    const far = stubSide === 'left' ? box.left - g.externalStub : box.left + box.width + g.externalStub
    stub = { x1: stubSide === 'left' ? far : box.left + box.width, x2: stubSide === 'left' ? box.left : far, y: cy }
    const cl = wrapLines(ctx, external, g.externalStub, style.font)
    const total = cl.length * lineHeightOf(style.font)
    caption = blockLeft(ctx, cl, style.font, { left: Math.min(stub.x1, stub.x2), top: stubSide === 'left' ? cy - 4 - total : cy + 4 })
    extra.push({ left: Math.min(stub.x1, stub.x2), top: cy - 2, width: g.externalStub, height: 4 }, ...boxesOf(caption))
  }
  const editText = nameOf(model)
  return symbolNode(view, ctx, {
    width: g.square,
    height: g.square,
    outline: 'rect',
    style,
    lines,
    content: boxesOf(lines),
    extraBounds: extra,
    data: (_b, base) => ({ ...base, interaction, stub, caption }),
    editText
  })
}

// ---------------------------------------------------------------------------------------------
// Undefined process, state marker, wait, role start

export function layoutUndefinedProcess(view: NodeView, ctx: LayoutContext): NodeLayout<SymbolData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY.ellipse
  const box = boxAt(view, g.width, g.height)
  const lines = placeLabel(ctx, box, nameOf(view.model), style.font, RAD_GEOMETRY.activityWrap, entersFromRight(view, ctx) ? 'right-above' : 'right')
  return symbolNode(view, ctx, { width: g.width, height: g.height, outline: 'ellipse', style, lines, content: boxesOf(lines), data: (_b, base) => base })
}

export function layoutStateMarker(view: NodeView, ctx: LayoutContext): NodeLayout<MarkerData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY.marker
  const box = boxAt(view, g.outerW, g.outerH)
  const lines = placeLabel(ctx, box, nameOf(view.model), style.font, RAD_GEOMETRY.activityWrap, entersFromRight(view, ctx) ? 'right-above' : 'right')
  const kind = typeof view.model?.['kind'] === 'string' ? (view.model['kind'] as string) : 'state'
  return symbolNode(view, ctx, { width: g.outerW, height: g.outerH, outline: 'ellipse', style, lines, content: boxesOf(lines), data: (_b, base) => ({ ...base, kind }) })
}

export function layoutWait(view: NodeView, ctx: LayoutContext): NodeLayout<WaitData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY
  const box = boxAt(view, g.circle, g.circle)
  const lines = placeLabel(ctx, box, nameOf(view.model), style.font, g.activityWrap, 'right')
  const cy = box.top + box.height / 2
  const stub: Segment = { x1: box.left - g.waitStub, x2: box.left, y: cy }
  return symbolNode(view, ctx, {
    width: g.circle,
    height: g.circle,
    outline: 'ellipse',
    style,
    lines,
    content: [...boxesOf(lines), { left: stub.x1, top: cy - 4, width: g.waitStub, height: 8 }],
    extraBounds: [{ left: stub.x1, top: cy - 4, width: g.waitStub, height: 8 }],
    data: (_b, base) => ({ ...base, stub })
  })
}

export function layoutRoleStart(view: NodeView, ctx: LayoutContext): NodeLayout<RoleStartData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY
  const model = view.model
  const box = boxAt(view, g.pentagon, g.pentagon)
  const cy = box.top + box.height / 2
  const externalRole = typeof model?.['externalRole'] === 'string' ? (model['externalRole'] as string).trim() : ''
  const external = externalRole !== ''
  let lines: TextLine[]
  let tip: Segment | null = null
  let target: EditRegion['target'] | null | undefined
  let editText: string | undefined
  if (external && model) {
    tip = { x1: box.left + box.width, x2: box.left + box.width + g.roleStartTip, y: cy }
    const wrapped = wrapLines(ctx, externalRole, g.activityWrap, style.font)
    const total = wrapped.length * lineHeightOf(style.font)
    lines = blockLeft(ctx, wrapped, style.font, { left: tip.x2 + 6, top: cy - total / 2 })
    target = { kind: 'field', elementId: model._id, field: 'externalRole' }
    editText = externalRole
  } else {
    const role = model?.['role'] as Elem | null | undefined
    const own = nameOf(model)
    lines = placeLabel(ctx, box, own !== '' ? own : nameOf(role), style.font, g.activityWrap, 'right')
    editText = own
  }
  return symbolNode(view, ctx, {
    width: g.pentagon,
    height: g.pentagon,
    outline: 'rect',
    style,
    lines,
    content: boxesOf(lines).concat(tip ? [{ left: tip.x1, top: cy - 5, width: g.roleStartTip, height: 10 }] : []),
    extraBounds: tip ? [{ left: tip.x1, top: cy - 5, width: g.roleStartTip, height: 10 }] : [],
    data: (_b, base) => ({ ...base, tip }),
    ...(target ? { target } : {}),
    ...(editText !== undefined ? { editText } : {})
  })
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
  return out.sort((a, b) => (a.left ?? 0) + (a.width ?? 0) / 2 - ((b.left ?? 0) + (b.width ?? 0) / 2))
}

const ROW_TOLERANCE = 6

/** Left and right attachment x of a branch symbol on the bar through `y`. */
function branchBarSpan(branch: NodeView, y: number): { left: number; right: number } {
  const left = branch.left ?? 0
  const width = branch.width ?? 0
  if (isKindOf(branch.model, 'RADPartBranch')) {
    // Triangle (apex up): the bar meets the slanted sides at height y.
    const h = Math.max(1, branch.height ?? 1)
    const frac = Math.min(1, Math.max(0, (y - (branch.top ?? 0)) / h))
    const half = (width * frac) / 2
    const cx = left + width / 2
    return { left: cx - half, right: cx + half }
  }
  return { left, right: left + width }
}

export function layoutRefinement(view: NodeView, ctx: LayoutContext): NodeLayout<RefinementData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY
  const part = isKindOf(view.model, 'RADPartRefinement')
  const box = boxAt(view, g.circle, g.circle)
  const cy = box.top + box.height / 2
  const right = box.left + box.width
  const onRow = branchViewsOf(view, ctx).filter((b) => Math.abs((b.top ?? 0) + (b.height ?? 0) / 2 - cy) <= ROW_TOLERANCE && (b.left ?? 0) >= right)
  const bars: Segment[] = []
  let from = right
  for (const b of onRow) {
    const span = branchBarSpan(b, cy)
    if (span.left > from) bars.push({ x1: from, x2: span.left, y: cy })
    from = span.right
  }
  const first = onRow[0]
  const gap = first ? (first.left ?? 0) - right - g.labelGap - 6 : g.questionWrap
  const wrap = Math.max(48, Math.min(g.questionWrap, gap))
  const lines = placeLabel(ctx, box, nameOf(view.model), style.font, wrap, 'right')
  return symbolNode(view, ctx, {
    width: g.circle,
    height: g.circle,
    outline: 'ellipse',
    style,
    lines,
    content: boxesOf(lines),
    data: (_b, base) => ({ ...base, part, bars })
  })
}

export function layoutBranch(view: NodeView, ctx: LayoutContext): NodeLayout<BranchData> {
  const style = styleOf(view)
  const g = RAD_GEOMETRY
  const part = isKindOf(view.model, 'RADPartBranch')
  const w = part ? g.triangle.width : g.circle
  const h = part ? g.triangle.height : g.circle
  const box = boxAt(view, w, h)
  const lines = placeLabel(ctx, box, nameOf(view.model), style.font, g.branchWrap, part ? 'right-below' : 'above')
  return symbolNode(view, ctx, {
    width: w,
    height: h,
    outline: part ? 'rect' : 'ellipse',
    style,
    lines,
    content: boxesOf(lines),
    data: (_b, base) => ({ ...base, part })
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
    const e = v as unknown as { tail: View | null }
    if (e.tail?.containerView === view) return true
  }
  return false
}

/** Text height of the header blocks above (or inside) a role of the given width. */
function headerLines(ctx: LayoutContext, view: NodeView, style: ViewStyle, width: number) {
  const bold = withFontStyle(style.font, true, false)
  const italic = withFontStyle(style.font, false, true)
  const model = view.model
  const title = wrapLines(ctx, roleTitle(model), width, bold)
  const goalText = view['showGoal'] === true && typeof model?.['goal'] === 'string' ? (model['goal'] as string) : ''
  const goal = wrapLines(ctx, goalText === '' ? '' : `Goal: ${goalText}`, width, italic)
  return { bold, italic, title, goal }
}

/**
 * Role: rounded rectangle (radius 20, at least 160 × 120) holding its views. The box grows to
 * contain every contained view and its label plus a 24 padding (a free lane on the left for
 * loop-backs); with auto-resize it is exactly that size. The `Agent- Role` header sits above the
 * top-left corner (or inside the top when `headerOutside` is off).
 */
export function layoutRole(view: NodeView, ctx: LayoutContext): NodeLayout<RoleData> {
  const style = styleOf(view)
  const model = view.model
  const g = RAD_GEOMETRY
  const outside = view['headerOutside'] !== false
  const stored = storedBox(view)
  const rects: Rect[] = []
  for (const child of view.containedViews ?? []) {
    const c = contentOf(child, ctx)
    if (c) rects.push(...c.rects)
  }
  const union = unionRects(rects)
  const loop = hasLoopBack(view, ctx)
  const startW = Math.max(stored.width, g.roleMin.width)
  const pre = headerLines(ctx, view, style, startW)
  const headerH = outside ? 0 : (pre.title.length + pre.goal.length) * lineHeightOf(pre.bold) + g.titleGap
  let left = stored.left
  let top = stored.top
  let reqRight = stored.left + g.roleMin.width
  let reqBottom = stored.top + g.roleMin.height
  if (union) {
    const padL = g.rolePad + (loop ? g.loopLane : 0)
    const rl = union.left - padL
    const rt = union.top - g.rolePad - headerH
    const rr = union.left + union.width + g.rolePad
    const rb = union.top + union.height + g.rolePad
    if (view.autoResize) {
      left = rl
      top = rt
      reqRight = Math.max(rr, rl + g.roleMin.width)
      reqBottom = Math.max(rb, rt + g.roleMin.height)
    } else {
      left = Math.min(stored.left, rl)
      top = Math.min(stored.top, rt)
      reqRight = Math.max(rr, left + g.roleMin.width)
      reqBottom = Math.max(rb, top + g.roleMin.height)
    }
  }
  const positioned = {
    ...view,
    left,
    top,
    width: view.autoResize ? 0 : Math.max(stored.left + stored.width - left, 0),
    height: view.autoResize ? 0 : Math.max(stored.top + stored.height - top, 0)
  } as NodeView
  const laid = nodeLayout(positioned, {
    minWidth: reqRight - left,
    minHeight: reqBottom - top,
    sizable: 'free',
    zIndex: -1,
    style,
    data: (box) => {
      const h = headerLines(ctx, view, style, box.width)
      const lh = lineHeightOf(h.bold)
      const total = (h.title.length + h.goal.length) * lh
      const startTop = outside ? box.top - g.titleGap - total : box.top + g.titleGap / 2
      const titleLines = blockLeft(ctx, h.title, h.bold, { left: box.left + (outside ? 0 : 12), top: startTop })
      const goalLines = blockLeft(ctx, h.goal, h.italic, { left: box.left + (outside ? 0 : 12), top: startTop + h.title.length * lh })
      return { radius: g.roleRadius, titleLines, goalLines, headerOutside: outside, ...warned(ctx, model, titleLines, box) }
    },
    regions: (box) => {
      if (!model) return []
      const h = headerLines(ctx, view, style, box.width)
      const lh = lineHeightOf(h.bold)
      const total = (h.title.length + h.goal.length) * lh
      const startTop = outside ? box.top - g.titleGap - total : box.top + g.titleGap / 2
      const titleLines = blockLeft(ctx, h.title, h.bold, { left: box.left + (outside ? 0 : 12), top: startTop })
      const goalLines = blockLeft(ctx, h.goal, h.italic, { left: box.left + (outside ? 0 : 12), top: startTop + h.title.length * lh })
      const out: EditRegion[] = []
      const tb = linesBounds(titleLines) ?? { left: box.left, top: box.top - lh - g.titleGap, width: Math.min(box.width, 120), height: lh }
      out.push({ box: tb, target: { kind: 'custom', elementId: model._id, syntax: 'radRoleTitle' }, text: roleTitle(model), font: h.bold })
      const gb = linesBounds(goalLines)
      if (gb) out.push({ box: gb, target: { kind: 'field', elementId: model._id, field: 'goal' }, text: typeof model['goal'] === 'string' ? (model['goal'] as string) : '', font: h.italic })
      return out
    }
  })
  const header = roleHeaderBounds(laid)
  return { ...laid, derivedPosition: true, ...(header.length > 0 ? { extraBounds: header, outerHitAreas: outside ? header : [] } : {}) }
}

/** Header rectangles of a role layout (title and goal), for export bounds and hit testing outside the box. */
function roleHeaderBounds(layout: NodeLayout<RoleData>): Rect[] {
  const out: Rect[] = []
  const t = linesBounds(layout.data.titleLines)
  const goal = linesBounds(layout.data.goalLines)
  if (t) out.push(t)
  if (goal) out.push(goal)
  return out
}
