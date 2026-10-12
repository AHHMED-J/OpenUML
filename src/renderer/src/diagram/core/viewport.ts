/**
 * Grid snapping, zoom and the diagram ↔ screen transform (spec 03 §1.7).
 *
 * Transform: `screen = (diagram + origin) × zoom`, where `origin` is the scroll offset and is
 * clamped to ≤ 0 so the view never scrolls above or left of diagram (0, 0).
 */
import { inflateRect, unionRects, type Point, type Rect } from './geometry'
import { EXPORT, GRID, ZOOM } from './style'

export type SnapMode = 'round' | 'floor'

/**
 * Snaps a coordinate to a multiple of `gridSize`. OpenUML rounds by default; `'floor'`
 * reproduces the reference's truncation (`x − (x mod g)`, toward −∞ for negatives).
 * A grid size ≤ 1 disables snapping.
 */
export function snap(value: number, gridSize: number = GRID.size, mode: SnapMode = 'round'): number {
  if (!(gridSize > 1)) return value
  const q = value / gridSize
  const n = mode === 'round' ? Math.round(q) : Math.floor(q)
  return n * gridSize + 0 // `+ 0` turns -0 into 0
}

export function snapPoint(p: Point, gridSize: number = GRID.size, mode: SnapMode = 'round'): Point {
  return { x: snap(p.x, gridSize, mode), y: snap(p.y, gridSize, mode) }
}

/** Snaps a rectangle's top-left corner and its far corner (so the size snaps too). */
export function snapRect(r: Rect, gridSize: number = GRID.size, mode: SnapMode = 'round'): Rect {
  const left = snap(r.left, gridSize, mode)
  const top = snap(r.top, gridSize, mode)
  const right = snap(r.left + r.width, gridSize, mode)
  const bottom = snap(r.top + r.height, gridSize, mode)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Moves a rectangle so its top-left corner is on the grid, keeping its size. */
export function snapRectPosition(r: Rect, gridSize: number = GRID.size, mode: SnapMode = 'round'): Rect {
  return { left: snap(r.left, gridSize, mode), top: snap(r.top, gridSize, mode), width: r.width, height: r.height }
}

/**
 * Snapping with a dead zone for drags: when the proposed coordinate is less than one grid cell
 * away from the original, the original coordinate is kept (so tiny drags do not jump).
 */
export function snapWithDeadZone(
  original: number,
  proposed: number,
  gridSize: number = GRID.size,
  mode: SnapMode = 'round'
): number {
  if (Math.abs(proposed - original) < gridSize) return original
  return snap(proposed, gridSize, mode)
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

/** Clamps a zoom factor to [ZOOM.min, ZOOM.max] and removes floating point drift. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM.default
  const clamped = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
  return Math.round(clamped * 1000) / 1000
}

/** Zoom in (`steps` > 0) or out (`steps` < 0) by `steps × ZOOM.step`, clamped. */
export function stepZoom(zoom: number, steps: number): number {
  // Work in tenths to avoid accumulating 0.1 rounding errors.
  const tenths = Math.round(zoom / ZOOM.step) + steps
  return clampZoom(tenths * ZOOM.step)
}

export interface Viewport {
  /** Scroll offset in diagram units; both components are ≤ 0. */
  origin: Point
  zoom: number
}

/** Clamps the scroll origin to ≤ 0 on both axes. */
export function clampOrigin(origin: Point): Point {
  return { x: Math.min(0, origin.x) + 0, y: Math.min(0, origin.y) + 0 }
}

export function diagramToScreen(p: Point, vp: Viewport): Point {
  return { x: (p.x + vp.origin.x) * vp.zoom, y: (p.y + vp.origin.y) * vp.zoom }
}

export function screenToDiagram(p: Point, vp: Viewport): Point {
  return { x: p.x / vp.zoom - vp.origin.x, y: p.y / vp.zoom - vp.origin.y }
}

/** Converts a length in screen px (e.g. handle size) to diagram units at `zoom`. */
export function screenToDiagramLength(lengthPx: number, zoom: number): number {
  return lengthPx / zoom
}

/**
 * Zooms around a fixed screen point (e.g. the mouse position under Ctrl+wheel): the diagram
 * point under `screenPoint` stays under it. The resulting origin is clamped to ≤ 0.
 */
export function zoomAt(vp: Viewport, newZoom: number, screenPoint: Point): Viewport {
  const zoom = clampZoom(newZoom)
  const anchor = screenToDiagram(screenPoint, vp)
  const origin = clampOrigin({ x: screenPoint.x / zoom - anchor.x, y: screenPoint.y / zoom - anchor.y })
  return { origin, zoom }
}

/** Grid line positions (diagram units) to draw inside `visible`, every `lineEvery × gridSize`. */
export function gridLines(
  visible: Rect,
  gridSize: number = GRID.size,
  lineEvery: number = GRID.lineEvery
): { xs: number[]; ys: number[] } {
  const step = gridSize * lineEvery
  const xs: number[] = []
  const ys: number[] = []
  if (!(step > 0)) return { xs, ys }
  for (let x = Math.ceil(visible.left / step) * step; x <= visible.left + visible.width; x += step) xs.push(x)
  for (let y = Math.ceil(visible.top / step) * step; y <= visible.top + visible.height; y += step) ys.push(y)
  return { xs, ys }
}

/**
 * Export bounds: the union of all view boxes (including sub-views such as edge labels),
 * expanded by `margin` (default 10) on every side. `null` for an empty diagram.
 */
export function exportBounds(boxes: readonly Rect[], margin: number = EXPORT.margin): Rect | null {
  const u = unionRects(boxes)
  return u ? inflateRect(u, margin) : null
}

/** Padding kept around the content when deciding whether it fits the viewport. */
export const CANVAS_FIT_PADDING = 10
/** Extra scroll room beyond the content once it does not fit the viewport. */
export const CANVAS_SCROLL_MARGIN = 400

/**
 * Canvas extent (diagram units) along one axis for content ending at `contentEnd`: exactly the
 * viewport when the content fits it at `zoom` (so no scrollbar appears, e.g. after "Fit to
 * window"), else the content plus a scroll margin to work beyond its edge.
 */
export function canvasExtent(contentEnd: number, viewportPx: number, zoom: number): number {
  const visible = viewportPx / zoom
  if (viewportPx > 0 && contentEnd + CANVAS_FIT_PADDING <= visible) return visible
  return Math.max(contentEnd + CANVAS_SCROLL_MARGIN, visible)
}
