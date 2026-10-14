/**
 * IDEF0 sheet size edits: resizing the frame (handles, Format > IDEF0 > Sheet Size presets, Fit to
 * Content). The size lives on the frame view
 * (`model/idef0-sheet.ts`); the sheet origin never moves, so a resize moves only the right and
 * bottom edges of the drawing area, and the output and mechanism ports on them follow in the same
 * undo step. Arrows are re-routed inside the new area by the geometry write-back.
 */
import type { OperationBuilder } from '../../commands'
import {
  drawingAreaOf,
  frameViewOf,
  roleOf,
  ROLE_SIDE,
  sheetMinimumOf,
  validSheetSize,
  type Elem,
  type NodeView,
  type SheetSize
} from '../../model'
import { withGeometry, type DiagramEnv } from '../editor/actions'

/** Whether the steps recorded in `b` changed the size of the frame of `diagram`. */
function frameResized(b: OperationBuilder, frame: NodeView): boolean {
  return b.steps.some((s) => s.op === 'a' && s.id === frame._id && (s.field === 'width' || s.field === 'height'))
}

/**
 * Puts the output and mechanism ports of `diagram` back on the right and bottom edges of its
 * drawing area (after the sheet changed size). Input and control ports sit on the fixed left and
 * top edges and stay.
 */
function keepPortsOnSheetEdges(b: OperationBuilder, diagram: Elem): void {
  const area = drawingAreaOf(diagram)
  for (const el of (diagram['ownedViews'] as Elem[] | undefined) ?? []) {
    const v = el as NodeView
    if (v._type !== 'IDEF0PortView' || !v.model) continue
    const side = ROLE_SIDE[roleOf(v.model)]
    if (side === 'right') {
      const left = area.right - v.width / 2
      if (v.left !== left) b.set(v, 'left', left)
    } else if (side === 'bottom') {
      const top = area.bottom - v.height / 2
      if (v.top !== top) b.set(v, 'top', top)
    }
  }
}

/**
 * Normalizer part (runs inside every geometry operation of an IDEF0 diagram): when the operation
 * resized the frame (its handles), the size is made whole and the right/bottom ports follow.
 */
export function normalizeSheet(b: OperationBuilder, diagram: Elem): void {
  const frame = frameViewOf(diagram)
  if (!frame || !frameResized(b, frame)) return
  const width = Math.round(frame.width)
  const height = Math.round(frame.height)
  if (width !== frame.width || height !== frame.height) b.setAll(frame, { width, height })
  keepPortsOnSheetEdges(b, diagram)
}

function sameSize(a: SheetSize, b: SheetSize): boolean {
  return a.width === b.width && a.height === b.height
}

/**
 * Gives the sheet of `env.diagram` the size `size` (snapped to the grid, at least what the content
 * needs; see `validSheetSize`) in one undo step. Returns false when nothing changed.
 */
export function setSheetSize(env: DiagramEnv, size: SheetSize, name = 'Change Sheet Size'): boolean {
  const frame = frameViewOf(env.diagram)
  if (!frame) return false
  const next = validSheetSize(env.diagram, size)
  if (sameSize(next, { width: frame.width, height: frame.height })) return false
  withGeometry(env, name, (b) => b.setAll(frame, { width: next.width, height: next.height }))
  return true
}

/** The smallest sheet that holds the content of `env.diagram` (never below the default sheet). */
export function fitSheetToContent(env: DiagramEnv): boolean {
  return setSheetSize(env, sheetMinimumOf(env.diagram), 'Fit Sheet to Content')
}
