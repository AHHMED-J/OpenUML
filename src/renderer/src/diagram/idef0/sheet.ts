/**
 * IDEF0 sheet size edits: resizing the frame (handles, Format > IDEF0 > Sheet Size presets, Fit to
 * Content) and applying a sheet size to the child diagrams. The size lives on the frame view
 * (`model/idef0-sheet.ts`); the sheet origin never moves, so a resize moves only the right and
 * bottom edges of the drawing area, and the output and mechanism ports on them follow in the same
 * undo step. Arrows are re-routed inside the new area by the geometry write-back.
 */
import type { ModelEngine, OperationBuilder } from '../../commands'
import {
  drawingAreaOf,
  frameViewOf,
  roleOf,
  ROLE_SIDE,
  sheetMinimumOf,
  sheetSizeOf,
  validSheetSize,
  type Diagram,
  type Elem,
  type NodeView,
  type SheetSize
} from '../../model'
import type { TextMeasurer } from '../core'
import { syncGeometry, withGeometry, type DiagramEnv } from '../editor/actions'
import { descendantDiagramsOf } from './titleBlock'

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

/**
 * Gives every descendant diagram of `diagram` its sheet size (a child whose content needs more
 * keeps that much), in one undo step. Returns the number of diagrams changed.
 */
export function applySheetSizeToChildren(engine: ModelEngine, measurer: TextMeasurer, diagram: Elem): number {
  const size = sheetSizeOf(diagram)
  const targets = descendantDiagramsOf(diagram)
    .map((child) => ({ child, frame: frameViewOf(child), next: validSheetSize(child, size) }))
    .filter((t): t is { child: Elem; frame: NodeView; next: SheetSize } => !!t.frame && !sameSize(t.next, { width: t.frame.width, height: t.frame.height }))
  if (targets.length === 0) return 0
  engine.transact('Apply Sheet Size to Child Diagrams', (b) => {
    for (const { child, frame, next } of targets) {
      b.setAll(frame, { width: next.width, height: next.height })
      keepPortsOnSheetEdges(b, child)
      syncGeometry({ engine, diagram: child as Diagram, measurer }, b)
    }
  })
  return targets.length
}
