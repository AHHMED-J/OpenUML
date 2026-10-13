/**
 * Shared measuring/arranging helpers for notation layouts: view style, text lines, the standard
 * name compartment, list compartments and the generic node layout skeleton.
 */
import { isKindOf, type Elem, type NodeView, type View } from '../../model'
// Colors come from files: only plain color syntax reaches SVG attributes.
import { cssColorOr } from '../../format/cssColor'
import {
  COLORS,
  DEFAULT_FONT,
  FontStyle,
  NAMESPACE_FONT_SCALE,
  SPACING,
  guillemets,
  scaleFont,
  withFontStyle,
  type Font,
  type NodeOutline,
  type Rect,
  type Size,
  type Sizable,
  type TextMeasurer
} from '../core'
import type { EditRegion, LayoutContext, NodeLayout, TextLine, ViewStyle } from './types'

const PAD = SPACING.compartmentPaddingLeft
const GAP = SPACING.compartmentItemGap

function fontOf(view: View | null | undefined): Font {
  const f = view?.font as Font | undefined
  return f && typeof f.size === 'number' && f.size > 0 ? f : DEFAULT_FONT
}

/** Style fields of a view. With `parentStyle`, colors and font come from the parent view. */
export function styleOf(view: View): ViewStyle {
  let src: View = view
  while (src.parentStyle && isKindOf(src._parent, 'View')) src = src._parent
  return {
    lineColor: cssColorOr(src.lineColor, COLORS.line),
    fillColor: cssColorOr(src.fillColor, COLORS.fill),
    fontColor: cssColorOr(src.fontColor, COLORS.font),
    font: fontOf(src),
    showShadow: view.showShadow !== false
  }
}

/** Measures one text line (height = font size). */
export function measureText(text: string, font: Font, measurer: TextMeasurer): Size {
  return measurer.measure(text, font)
}

/** Name of an element, '' when absent. */
export function nameOf(el: Elem | null | undefined): string {
  const n = el?.['name']
  return typeof n === 'string' ? n : ''
}

/** Stereotype name of an element: a stereotype element's name or a plain string ('' when none). */
export function stereotypeName(el: Elem | null | undefined): string {
  const st = el?.['stereotype']
  if (typeof st === 'string') return st
  if (st && typeof st === 'object') return nameOf(st as Elem)
  return ''
}

export const VISIBILITY_SYMBOLS: Readonly<Record<string, string>> = {
  public: '+',
  protected: '#',
  private: '-',
  package: '~'
}

export function visibilitySymbol(visibility: unknown): string {
  return typeof visibility === 'string' ? (VISIBILITY_SYMBOLS[visibility] ?? '') : ''
}

/** Editable name notation `<<st>> [vis]name` (visibility only when not public). */
export function nameEditText(el: Elem | null | undefined): string {
  if (!el) return ''
  const st = stereotypeName(el)
  const vis = el['visibility'] && el['visibility'] !== 'public' ? visibilitySymbol(el['visibility']) : ''
  return `${st ? `<<${st}>> ` : ''}${vis}${nameOf(el)}`
}

/** `name=value` strings of an element's visible tags. */
export function tagStrings(el: Elem | null | undefined): string[] {
  const tags = el?.['tags']
  if (!Array.isArray(tags)) return []
  return (tags as Elem[])
    .filter((t) => !t['hidden'])
    .map((t) => {
      const kind = t['kind']
      const value =
        kind === 'boolean'
          ? String(t['checked'])
          : kind === 'number'
            ? String(t['number'])
            : kind === 'reference'
              ? nameOf(t['reference'] as Elem)
              : String(t['value'] ?? '')
      return `${nameOf(t)}=${value}`
    })
}

/** `{a, b}` or '' for no parts. */
export function braceList(parts: readonly string[]): string {
  return parts.length > 0 ? `{${parts.join(', ')}}` : ''
}

/** Stored node box of a view. */
export function storedBox(view: NodeView): Rect {
  return { left: view.left ?? 0, top: view.top ?? 0, width: view.width ?? 0, height: view.height ?? 0 }
}

/**
 * Effective box: the stored box grown to the minimum size; exactly the minimum with auto-resize
 * (spec 03 §1.2 step 3).
 */
export function effectiveBox(view: NodeView, minWidth: number, minHeight: number): Rect {
  const b = storedBox(view)
  if (view.autoResize && minWidth > 0 && minHeight > 0) return { ...b, width: minWidth, height: minHeight }
  return { ...b, width: Math.max(b.width, minWidth), height: Math.max(b.height, minHeight) }
}

// ---------------------------------------------------------------------------------------------
// Name compartment

export interface NameCompartmentInput {
  /** «stereotype» line text without guillemets ('' = none). */
  stereotype?: string
  name: string
  /** `(from X)` text ('' = none). */
  namespace?: string
  /** `{...}` property string ('' = none). */
  property?: string
  /** Base font (the view's font); the name is drawn bold. */
  font: Font
  italicName?: boolean
  underlineName?: boolean
  boldName?: boolean
}

export interface NameCompartmentMeasure {
  readonly width: number
  readonly height: number
  readonly items: ReadonlyArray<{ readonly index: number; readonly text: string; readonly font: Font; readonly size: Size; readonly align: TextLine['align']; readonly underline?: boolean }>
}

/**
 * Measures the standard name compartment (spec 03 §4.1): items [stereotype, name, namespace,
 * property]; height = 5 + Σ heights + 2 × (visible items with index > 0) + 5; width = widest + 10.
 * The name is always present (so a name-only compartment is 25 tall at 13 px).
 */
export function measureNameCompartment(input: NameCompartmentInput, measurer: TextMeasurer): NameCompartmentMeasure {
  const base = input.font
  const nameFont = withFontStyle(base, input.boldName !== false, input.italicName === true)
  const raw: Array<{ index: number; text: string; font: Font; align: TextLine['align']; underline?: boolean }> = []
  if (input.stereotype) raw.push({ index: 0, text: guillemets(input.stereotype), font: base, align: 'center' })
  raw.push({ index: 1, text: input.name, font: nameFont, align: 'center', underline: input.underlineName })
  if (input.namespace) raw.push({ index: 2, text: input.namespace, font: scaleFont(base, NAMESPACE_FONT_SCALE), align: 'center' })
  if (input.property) raw.push({ index: 3, text: input.property, font: base, align: 'right' })
  let width = 0
  let height = PAD + PAD
  const items = raw.map((item) => {
    const size = measurer.measure(item.text, item.font)
    width = Math.max(width, size.width)
    height += size.height + (item.index > 0 ? GAP : 0)
    return { ...item, size }
  })
  return { width: Math.ceil(width) + PAD * 2, height, items }
}

/** Places the measured name compartment items top-down inside `rect`. */
export function arrangeNameCompartment(m: NameCompartmentMeasure, rect: Rect): TextLine[] {
  let y = rect.top + PAD
  return m.items.map((item) => {
    if (item.index > 0) y += GAP
    const line: TextLine = {
      text: item.text,
      font: item.font,
      align: item.align,
      underline: item.underline,
      box: { left: rect.left + PAD, top: y, width: Math.max(0, rect.width - PAD * 2), height: item.size.height }
    }
    y += item.size.height
    return line
  })
}

/** Default bold-name font of a view. */
export function nameFontOf(style: ViewStyle): Font {
  return withFontStyle(style.font, true, false)
}

// ---------------------------------------------------------------------------------------------
// List compartments

export interface ListRow {
  readonly text: string
  readonly font: Font
  readonly underline?: boolean
  /** Inline edit target of the row. */
  readonly edit?: EditRegion['target']
  readonly editText?: string
}

export interface ListCompartmentMeasure {
  readonly rows: ReadonlyArray<ListRow & { readonly size: Size }>
  readonly width: number
  readonly height: number
}

/** h = 5 + Σ row heights + 2 × (rows − 1) + 5 (an empty compartment is 10 tall); w = widest + 10. */
export function measureListCompartment(rows: readonly ListRow[], measurer: TextMeasurer): ListCompartmentMeasure {
  let width = 0
  let height = PAD + PAD
  const measured = rows.map((row, i) => {
    const size = measurer.measure(row.text, row.font)
    width = Math.max(width, size.width)
    height += size.height + (i > 0 ? GAP : 0)
    return { ...row, size }
  })
  return { rows: measured, width: Math.ceil(width) + PAD * 2, height }
}

/** Places the rows of a list compartment (left-aligned) inside `rect`. */
export function arrangeListCompartment(m: ListCompartmentMeasure, rect: Rect): Array<TextLine & { edit?: ListRow['edit']; editText?: string }> {
  let y = rect.top + PAD
  return m.rows.map((row, i) => {
    if (i > 0) y += GAP
    const line = {
      text: row.text,
      font: row.font,
      align: 'left' as const,
      underline: row.underline,
      edit: row.edit,
      editText: row.editText,
      box: { left: rect.left + PAD, top: y, width: Math.max(0, rect.width - PAD * 2), height: row.size.height }
    }
    y += row.size.height
    return line
  })
}

// ---------------------------------------------------------------------------------------------
// Generic node layout skeleton

export interface NodeLayoutInit<D> {
  minWidth: number
  minHeight: number
  data: D | ((box: Rect) => D)
  regions?: EditRegion[] | ((box: Rect) => EditRegion[])
  sizable?: Sizable
  movable?: boolean
  outline?: NodeOutline
  zIndex?: number
  extraBounds?: Rect[]
  style?: ViewStyle
  endpoint?: NodeLayout['endpoint'] | ((box: Rect) => NodeLayout['endpoint'])
}

/** Builds a node layout: computes the effective box from the minimum, then the data for it. */
export function nodeLayout<D>(view: NodeView, init: NodeLayoutInit<D>): NodeLayout<D> {
  const minWidth = Math.ceil(init.minWidth)
  const minHeight = Math.ceil(init.minHeight)
  const box = effectiveBox(view, minWidth, minHeight)
  const resolve = <T>(v: T | ((b: Rect) => T)): T => (typeof v === 'function' ? (v as (b: Rect) => T)(box) : v)
  const endpoint = init.endpoint === undefined ? undefined : resolve(init.endpoint)
  return {
    kind: 'node',
    viewId: view._id,
    viewType: view._type,
    box,
    minWidth,
    minHeight,
    sizable: view.autoResize ? 'none' : (init.sizable ?? 'free'),
    movable: init.movable ?? true,
    outline: init.outline ?? 'rect',
    ...(endpoint ? { endpoint } : {}),
    regions: init.regions === undefined ? [] : resolve(init.regions),
    ...(init.extraBounds ? { extraBounds: init.extraBounds } : {}),
    zIndex: init.zIndex ?? 0,
    style: init.style ?? styleOf(view),
    data: resolve(init.data)
  }
}

/** The model element a view shows, if any. */
export function modelOf(view: View): Elem | null {
  return view.model ?? null
}

export type { LayoutContext }

/** Bold, italic font helper re-exported for notations. */
export function boldItalic(font: Font): Font {
  return { ...font, style: FontStyle.BoldItalic }
}
