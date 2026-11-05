/**
 * Repaints a view's layout for the canvas it is drawn on. Layout stays a pure function of the
 * model, always in light canvas colors: geometry, hit testing and color comparisons never depend
 * on the canvas, and the light drawing does not pass through here at all. Painted copies are kept
 * per layout object, so memoized renderers skip views that did not change.
 */
import { DARK_CANVAS, readableOn, toCanvasColor, type CanvasColorRole, type CanvasMode, type Point, type Rect } from '../core'
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

/** A node's layout for `mode`; the same object on the light canvas. */
export function paintNode<T extends NodeLayout>(layout: T, mode: CanvasMode): T {
  if (mode === 'light') return layout
  const known = painted.get(layout)
  if (known) return known as T
  const copy = paint(layout, 'fill')
  painted.set(layout, copy)
  return copy
}

/** Whether a line segment passes through a rectangle (Liang-Barsky clipping). */
function crosses(r: Rect, a: Point, b: Point): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let from = 0
  let to = 1
  const sides: readonly (readonly [number, number])[] = [
    [-dx, a.x - r.left],
    [dx, r.left + r.width - a.x],
    [-dy, a.y - r.top],
    [dy, r.top + r.height - a.y]
  ]
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false
    } else if (p < 0) from = Math.max(from, q / p)
    else to = Math.min(to, q / p)
  }
  return from <= to
}

/**
 * A label box exists to hide the edge's line behind the text. Its white matches any white surface
 * on the light canvas, but the canvas color would show as a patch inside a box on the dark one, so
 * a label clear of its line goes without a box. A box the user painted stays.
 */
function dropUnneededBoxes(layout: EdgeLayout): EdgeLayout {
  const line = layout.points
  const clear = (box: Rect): boolean => !line.some((p, i) => i > 0 && crosses(box, line[i - 1] as Point, p))
  const labels = layout.labels.map((l) => (l.fillColor === DARK_CANVAS.background && clear(l.box) ? { ...l, fillColor: 'none' } : l))
  return labels.some((l, i) => l !== layout.labels[i]) ? { ...layout, labels } : layout
}

/** An edge's layout for `mode`; its label boxes sit on the canvas, not on a box. */
export function paintEdge<T extends EdgeLayout>(layout: T, mode: CanvasMode): T {
  if (mode === 'light') return layout
  const known = painted.get(layout)
  if (known) return known as T
  const copy = dropUnneededBoxes(paint(layout, 'background')) as T
  painted.set(layout, copy)
  return copy
}
