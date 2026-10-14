/**
 * Which end of an edge a point is near, and the inline edit a double-click there opens: an empty
 * label slot under the point, else the main edit of the near end (`EdgeLayout.endEdits`, the
 * multiplicity of an association end). Points in the middle of the edge resolve to no end.
 */
import { closestPointOnSegment, distance, rectContainsPoint, type Point } from '../core'
import type { DiagramLayout, EdgeLabelSlot, EdgeLayout, EditRegion, EditTarget } from '../layout/types'

export type EdgeEnd = 'tail' | 'head'

/** Distance along an end of the edge that always counts as "near" it (diagram units). */
const NEAR_END_DISTANCE = 40
/** Fraction of the edge length at each end that counts as near it. */
const NEAR_END_FRACTION = 0.25
/** The near zone of each end never exceeds this fraction, so a middle always remains. */
const MAX_END_FRACTION = 0.4

/** Arc length of the polyline point closest to `p`, and the total length. */
function polylinePosition(points: readonly Point[], p: Point): { at: number; length: number } {
  let length = 0
  let best = Infinity
  let at = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const c = closestPointOnSegment(p, a, b)
    const d = distance(p, c)
    if (d < best) {
      best = d
      at = length + distance(a, c)
    }
    length += distance(a, b)
  }
  return { at, length }
}

/**
 * The end of the polyline `p` is near: within `max(40, 25 % of the length)` of it along the
 * line (capped at 40 % so short edges keep a middle), else null (the middle).
 */
export function nearEdgeEnd(points: readonly Point[], p: Point): EdgeEnd | null {
  if (points.length < 2) return null
  const { at, length } = polylinePosition(points, p)
  if (length <= 0) return null
  const zone = Math.min(Math.max(NEAR_END_DISTANCE, NEAR_END_FRACTION * length), MAX_END_FRACTION * length)
  const fromTail = at
  const fromHead = length - at
  if (fromTail <= zone && fromTail <= fromHead) return 'tail'
  if (fromHead <= zone) return 'head'
  return null
}

function sameEditTarget(a: EditTarget | undefined, b: EditTarget | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function slotRegion(slot: EdgeLabelSlot): EditRegion {
  return { box: slot.box, target: slot.edit, text: slot.editText, font: slot.font }
}

/** The empty-label slot of `edge` under `p` (smallest first), or null. */
function slotAt(edge: EdgeLayout, p: Point): EdgeLabelSlot | null {
  let best: EdgeLabelSlot | null = null
  for (const s of edge.slots ?? []) {
    if (!rectContainsPoint(s.box, p)) continue
    if (!best || s.box.width * s.box.height < best.box.width * best.box.height) best = s
  }
  return best
}

/** The topmost edge with an empty-label slot under `p`. */
export function edgeSlotAt(layout: DiagramLayout, p: Point): { viewId: string; region: EditRegion } | null {
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const id = layout.order[i] as string
    const edge = layout.edges.get(id)
    const slot = edge ? slotAt(edge, p) : null
    if (slot) return { viewId: id, region: slotRegion(slot) }
  }
  return null
}

/** The inline edit of the main label of one end: its label when shown, else its empty slot. */
function endEditRegion(edge: EdgeLayout, end: EdgeEnd): EditRegion | null {
  const target = edge.endEdits?.[end]
  if (!target) return null
  const label = edge.labels.find((l) => sameEditTarget(l.edit, target))
  if (label) return { box: label.box, target, text: label.editText ?? label.text, font: label.font }
  const slot = edge.slots?.find((s) => sameEditTarget(s.edit, target))
  return slot ? slotRegion(slot) : null
}

/**
 * What double-clicking `edge` at `p` edits besides its labels: an empty-label slot under `p`, or
 * the main edit of the end `p` is near. Null in the middle (the caller edits the name).
 */
export function edgeEditAt(edge: EdgeLayout, p: Point): EditRegion | null {
  const slot = slotAt(edge, p)
  if (slot) return slotRegion(slot)
  if (!edge.endEdits) return null
  const end = nearEdgeEnd(edge.points, p)
  return end ? endEditRegion(edge, end) : null
}

/**
 * The end of `edge` a point is on or near, as the element its main edit changes (an association
 * end): a label or slot of that end under `p`, else the near end along the line. Null in the
 * middle or for edges without end edits.
 */
export function endElementAt(edge: EdgeLayout, p: Point): string | null {
  const ends = edge.endEdits
  if (!ends) return null
  const idOf = (t: EditTarget | undefined): string | null => (t && 'elementId' in t ? t.elementId : null)
  const ids = [idOf(ends.tail), idOf(ends.head)]
  const owner = (t: EditTarget | undefined): string | null => {
    const id = idOf(t)
    return id && ids.includes(id) ? id : null
  }
  for (const l of edge.labels) if (rectContainsPoint(l.box, p) && owner(l.edit)) return owner(l.edit)
  const slot = slotAt(edge, p)
  if (slot && owner(slot.edit)) return owner(slot.edit)
  const end = nearEdgeEnd(edge.points, p)
  return end ? idOf(ends[end]) : null
}
