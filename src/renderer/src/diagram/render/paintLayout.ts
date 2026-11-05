/**
 * Repaints a view's layout for the canvas it is drawn on. Layout stays a pure function of the
 * model, always in light canvas colors: geometry, hit testing and color comparisons never depend
 * on the canvas, and the light drawing does not pass through here at all. Painted copies are kept
 * per layout object, so memoized renderers skip views that did not change.
 */
import { readableOn, toCanvasColor, type CanvasColorRole, type CanvasMode } from '../core'
import type { EdgeLayout, NodeLayout } from '../layout/types'

const COLOR_FIELDS: Readonly<Record<string, CanvasColorRole | 'surface'>> = {
  lineColor: 'line',
  fontColor: 'font',
  fillColor: 'surface',
  /** Stroke behind RAD labels, in the color of the box around them. */
  halo: 'surface',
  /** Pending IDEF0 arrows. */
  color: 'line'
}

/** Previews are whole diagrams drawn by their own `DiagramContent`, which paints them. */
const DRAWN_APART = 'preview'

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

function paint<T>(value: T, surface: CanvasColorRole): T {
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => paint(item, surface))
    return items.some((item, i) => item !== value[i]) ? (items as T) : value
  }
  if (typeof value !== 'object' || value === null || !isPlainObject(value)) return value
  let copy: Record<string, unknown> | null = null
  for (const key in value) {
    if (key === DRAWN_APART) continue
    const field = value[key]
    const role = COLOR_FIELDS[key]
    const next = typeof field === 'string' ? (role ? toCanvasColor(field, role === 'surface' ? surface : role, 'dark') : field) : paint(field, surface)
    if (next !== field) (copy ??= { ...value })[key] = next
  }
  if (!copy) return value
  if (typeof copy['fontColor'] === 'string' && typeof copy['fillColor'] === 'string') copy['fontColor'] = readableOn(copy['fontColor'], copy['fillColor'])
  return copy as T
}

const painted = new WeakMap<object, object>()

function paintOnce<T extends object>(layout: T, surface: CanvasColorRole): T {
  const known = painted.get(layout)
  if (known) return known as T
  const copy = paint(layout, surface)
  painted.set(layout, copy)
  return copy
}

/** A node's layout for `mode`; the same object on the light canvas. */
export function paintNode<T extends NodeLayout>(layout: T, mode: CanvasMode): T {
  return mode === 'light' ? layout : paintOnce(layout, 'fill')
}

/** An edge's layout for `mode`: its opaque label boxes sit on the canvas, not on a box. */
export function paintEdge<T extends EdgeLayout>(layout: T, mode: CanvasMode): T {
  return mode === 'light' ? layout : paintOnce(layout, 'background')
}
