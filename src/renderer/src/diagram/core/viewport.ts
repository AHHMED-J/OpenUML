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

/** A grid size preference: a whole number of diagram units in [GRID.min, GRID.max], else the default. */
export function sanitizeGridSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return GRID.size
  const n = Math.round(size)
  return n >= GRID.min && n <= GRID.max ? n : GRID.size
}

/**
 * Distance between drawn grid lines for `gridSize`: every `GRID.lineEvery` grid steps, doubled
 * until it is at least `GRID.minLineSpacing` so a fine grid does not fill the canvas with lines.
 */
export function gridLineSpacing(gridSize: number): number {
  let step = sanitizeGridSize(gridSize) * GRID.lineEvery
  while (step < GRID.minLineSpacing) step *= 2
  return step
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
const CANVAS_SCROLL_MARGIN = 400

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
