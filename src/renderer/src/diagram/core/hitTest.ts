/**
 * Hit testing for the interactive editor (spec 03 §1.5, §1.6).
 *
 * Handle sizes are given in screen px and converted with the current zoom, so handles keep a
 * constant on-screen size.
 */
import {
  distance,
  distancePointToSegment,
  rectContainsPoint,
  rectContainsRect,
  rectRight,
  rectBottom,
  rectsIntersect,
  segmentIntersectsRect,
  type Point,
  type Rect
} from './geometry'
import { segmentOrientation, type SegmentOrientation } from './routing'
import { HIT_TOLERANCE, SELECTION } from './style'

/**
 * Which resize directions a node allows (`sizable` field). `grow`: only the right, bottom and
 * bottom-right handles, the top-left corner stays (IDEF0 sheets).
 */
export type Sizable = 'none' | 'horz' | 'vert' | 'ratio' | 'free' | 'grow'

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const ALL_HANDLES: readonly HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Handles shown for each `sizable` value. */
export function handlesFor(sizable: Sizable): readonly HandlePosition[] {
  switch (sizable) {
    case 'free':
      return ALL_HANDLES
    case 'ratio':
      return ['nw', 'ne', 'se', 'sw']
    case 'vert':
      return ['n', 's']
    case 'horz':
      return ['e', 'w']
    case 'grow':
      return ['e', 'se', 's']
    default:
      return []
  }
}

export interface Handle {
  position: HandlePosition
  /** Handle square in diagram units. */
  rect: Rect
}

/**
 * Resize handle squares for a node box. Handles sit outside the box: corners just outside each
 * corner, side handles centered on each side's midpoint.
 */
export function resizeHandles(box: Rect, sizable: Sizable = 'free', zoom = 1, handleSizePx: number = SELECTION.handleSize): Handle[] {
  const s = handleSizePx / zoom
  const left = box.left
  const top = box.top
  const right = rectRight(box)
  const bottom = rectBottom(box)
  const cx = left + box.width / 2
  const cy = top + box.height / 2
  const origin: Record<HandlePosition, Point> = {
    nw: { x: left - s, y: top - s },
    n: { x: cx - s / 2, y: top - s },
    ne: { x: right, y: top - s },
    e: { x: right, y: cy - s / 2 },
    se: { x: right, y: bottom },
    s: { x: cx - s / 2, y: bottom },
    sw: { x: left - s, y: bottom },
    w: { x: left - s, y: cy - s / 2 }
  }
  return handlesFor(sizable).map((position) => ({
    position,
    rect: { left: origin[position].x, top: origin[position].y, width: s, height: s }
  }))
}

/**
 * The resize handle under `p`, or `null`. When several handles overlap (tiny nodes or low zoom)
 * the one whose center is nearest wins.
 */
export function handleAt(
  box: Rect,
  p: Point,
  sizable: Sizable = 'free',
  zoom = 1,
  handleSizePx: number = SELECTION.handleSize
): HandlePosition | null {
  let best: HandlePosition | null = null
  let bestDist = Infinity
  for (const h of resizeHandles(box, sizable, zoom, handleSizePx)) {
    if (!rectContainsPoint(h.rect, p)) continue
    const c = { x: h.rect.left + h.rect.width / 2, y: h.rect.top + h.rect.height / 2 }
    const d = distance(c, p)
    if (d < bestDist) {
      bestDist = d
      best = h.position
    }
  }
  return best
}

/** CSS cursor for a resize handle. */
export function handleCursor(position: HandlePosition): string {
  switch (position) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    default:
      return 'ew-resize'
  }
}

/**
 * Applies a handle drag to a box: the dragged sides move by (dx, dy), the opposite sides stay.
 * The result respects `minWidth`/`minHeight` (the moving side stops at the minimum), and `ratio`
 * resizing keeps the aspect ratio (driven by the larger relative change).
 */
export function resizeByHandle(
  box: Rect,
  position: HandlePosition,
  dx: number,
  dy: number,
  options: { minWidth?: number; minHeight?: number; keepRatio?: boolean } = {}
): Rect {
  const minW = options.minWidth ?? 0
  const minH = options.minHeight ?? 0
  let left = box.left
  let top = box.top
  let right = rectRight(box)
  let bottom = rectBottom(box)
  const west = position === 'nw' || position === 'w' || position === 'sw'
  const east = position === 'ne' || position === 'e' || position === 'se'
  const north = position === 'nw' || position === 'n' || position === 'ne'
  const south = position === 'sw' || position === 's' || position === 'se'
  if (west) left = Math.min(left + dx, right - minW)
  if (east) right = Math.max(right + dx, left + minW)
  if (north) top = Math.min(top + dy, bottom - minH)
  if (south) bottom = Math.max(bottom + dy, top + minH)
  let width = right - left
  let height = bottom - top
  if (options.keepRatio && box.width > 0 && box.height > 0 && (west || east) && (north || south)) {
    const k = Math.max(width / box.width, height / box.height)
    width = Math.max(minW, box.width * k)
    height = Math.max(minH, box.height * k)
    if (west) left = right - width
    if (north) top = bottom - height
  }
  return { left, top, width, height }
}

export type EdgeHit =
  | { kind: 'vertex'; index: number; isEnd: boolean }
  | { kind: 'segment'; index: number; orientation: SegmentOrientation }

/**
 * Edge hit test: a vertex within `tolerance` wins (nearest first), otherwise the nearest segment
 * within `tolerance`. Segment `i` joins points[i] and points[i+1]. Returns `null` on a miss.
 */
export function hitTestEdge(points: readonly Point[], p: Point, tolerance: number = HIT_TOLERANCE): EdgeHit | null {
  const n = points.length
  let bestVertex = -1
  let bestVertexDist = Infinity
  for (let i = 0; i < n; i++) {
    const d = distance(points[i] as Point, p)
    if (d <= tolerance && d < bestVertexDist) {
      bestVertex = i
      bestVertexDist = d
    }
  }
  if (bestVertex >= 0) return { kind: 'vertex', index: bestVertex, isEnd: bestVertex === 0 || bestVertex === n - 1 }
  let bestSeg = -1
  let bestSegDist = Infinity
  for (let i = 0; i < n - 1; i++) {
    const d = distancePointToSegment(p, points[i] as Point, points[i + 1] as Point)
    if (d <= tolerance && d < bestSegDist) {
      bestSeg = i
      bestSegDist = d
    }
  }
  if (bestSeg < 0) return null
  return { kind: 'segment', index: bestSeg, orientation: segmentOrientation(points[bestSeg] as Point, points[bestSeg + 1] as Point) }
}

/**
 * Cursor for a hit on a selected edge: end points → pointer (reconnect), interior vertices →
 * move, horizontal segment → ns-resize, vertical → ew-resize, oblique → crosshair (insert vertex).
 */
export function edgeHitCursor(hit: EdgeHit): string {
  if (hit.kind === 'vertex') return hit.isEnd ? 'pointer' : 'move'
  if (hit.orientation === 'horizontal') return 'ns-resize'
  if (hit.orientation === 'vertical') return 'ew-resize'
  return 'crosshair'
}

/**
 * How a rubber band selects: `contain` ("window") takes only views wholly inside it, `intersect`
 * ("crossing") also takes views it merely touches.
 */
export type RubberBandMode = 'contain' | 'intersect'

/**
 * The rubber-band mode for a drag (AutoCAD style): dragging left to right (or straight up/down)
 * is a window selection (`contain`), dragging right to left a crossing selection (`intersect`).
 */
export function rubberBandModeFor(start: Point, end: Point): RubberBandMode {
  return end.x < start.x ? 'intersect' : 'contain'
}

/**
 * True when a rubber-band rectangle selects a node box. In `intersect` mode a box that wholly
 * contains the band is not crossed: a band drawn inside a frame or container never selects it,
 * only one that crosses its outline does.
 */
export function rubberBandSelectsRect(band: Rect, box: Rect, mode: RubberBandMode = 'contain'): boolean {
  return mode === 'contain' ? rectContainsRect(band, box) : rectsIntersect(band, box) && !rectContainsRect(box, band)
}

/**
 * True when a rubber-band rectangle selects an edge: in `contain` mode every vertex must lie in
 * the band, in `intersect` mode any segment touching the band is enough, or any of the edge's
 * label boxes (`labels`) touching it.
 */
export function rubberBandSelectsEdge(band: Rect, points: readonly Point[], mode: RubberBandMode = 'contain', labels: readonly Rect[] = []): boolean {
  if (points.length === 0) return false
  if (mode === 'contain') return points.every((pt) => rectContainsPoint(band, pt))
  if (labels.some((l) => rectsIntersect(band, l))) return true
  if (points.length === 1) return rectContainsPoint(band, points[0] as Point)
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentIntersectsRect(points[i] as Point, points[i + 1] as Point, band)) return true
  }
  return false
}
