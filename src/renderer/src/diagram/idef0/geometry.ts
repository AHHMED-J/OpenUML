/**
 * IDEF0 geometry: sheet and box constants (spec 11 §1.11), directions of attachments and the
 * helpers that turn a box side plus a slot into an attachment point.
 */
import {
  IDEF0_AREA,
  IDEF0_BOX,
  IDEF0_CONTEXT_BOX,
  IDEF0_PORT_SIZE,
  IDEF0_SHEET,
  slotOffsets,
  type Idef0Side
} from '../../model'
import { JUNCTION_MARGIN, type Point, type Rect } from '../core'

export { IDEF0_AREA, IDEF0_BOX, IDEF0_CONTEXT_BOX, IDEF0_PORT_SIZE, IDEF0_SHEET }

/** Direction of travel / outward normal. */
export type Dir = 'N' | 'E' | 'S' | 'W'

/** Rendering constants. */
export const IDEF0_STYLE = {
  boxLine: 2,
  arrowLine: 1.5,
  bendRadius: 8,
  labelFontSize: 12,
  nameFontSize: 13,
  numberFontSize: 11,
  dreFontSize: 10,
  codeFontSize: 11,
  captionFontSize: 10,
  /** First and last straight run of an arrow (room for heads, parentheses and codes). */
  minStub: 24,
  squiggleLength: 14,
  squiggleAmplitude: 2,
  tunnelRadius: 7,
  tunnelHalfChord: 5,
  tunnelGap: 4,
  /** Room between the two tunnel parentheses (holds the arrowhead). */
  tunnelSpan: 20,
  boxPadding: 8
} as const

/** The drawing area as a rectangle. */
export const AREA_RECT: Rect = {
  left: IDEF0_AREA.left,
  top: IDEF0_AREA.top,
  width: IDEF0_AREA.right - IDEF0_AREA.left,
  height: IDEF0_AREA.bottom - IDEF0_AREA.top
}

/** Outward normal of a box side (away from the box). */
export const SIDE_DIR: Readonly<Record<Idef0Side, Dir>> = { left: 'W', top: 'N', right: 'E', bottom: 'S' }

/** Outward normal of a port, pointing into the drawing area. */
export const PORT_DIR: Readonly<Record<string, Dir>> = { input: 'E', control: 'S', output: 'W', mechanism: 'N' }


export function dirVector(dir: Dir): Point {
  switch (dir) {
    case 'N':
      return { x: 0, y: -1 }
    case 'S':
      return { x: 0, y: 1 }
    case 'E':
      return { x: 1, y: 0 }
    default:
      return { x: -1, y: 0 }
  }
}

export function isHorizontal(dir: Dir): boolean {
  return dir === 'E' || dir === 'W'
}


/**
 * Attachment point on `side` of `box` for slot `index` of `count` (evenly spread, snapped to the
 * grid, never at a corner), 1 unit outside the outline (`JUNCTION_MARGIN`).
 */
export function slotPoint(box: Rect, side: Idef0Side, index: number, count: number): Point {
  const vertical = side === 'left' || side === 'right'
  const offset = slotOffsets(vertical ? box.height : box.width, Math.max(count, index + 1))[index] ?? (vertical ? box.height : box.width) / 2
  switch (side) {
    case 'left':
      return { x: box.left - JUNCTION_MARGIN, y: box.top + offset }
    case 'right':
      return { x: box.left + box.width + JUNCTION_MARGIN, y: box.top + offset }
    case 'top':
      return { x: box.left + offset, y: box.top - JUNCTION_MARGIN }
    default:
      return { x: box.left + offset, y: box.top + box.height + JUNCTION_MARGIN }
  }
}

export function rectCenterOf(r: Rect): Point {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** The side of `box` a point is closest to, by normalized distance from the center (ties favor horizontal sides). */
export function nearestSide(box: Rect, p: Point): Idef0Side {
  const c = rectCenterOf(box)
  const nx = (p.x - c.x) / Math.max(1, box.width)
  const ny = (p.y - c.y) / Math.max(1, box.height)
  if (Math.abs(nx) >= Math.abs(ny)) return nx < 0 ? 'left' : 'right'
  return ny < 0 ? 'top' : 'bottom'
}
