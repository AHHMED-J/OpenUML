/**
 * IDEF0 sheet geometry (spec 11 §1.11): the sheet (frame) of every IDEF0 diagram, the drawing
 * area inside it that the boundary ports sit on, and the size presets of Format > IDEF0 > Sheet
 * Size.
 *
 * The size of a sheet is stored on the diagram's `IDEF0FrameView` (its `width`/`height`); the
 * sheet origin (`left`/`top`) never moves, so growing a sheet only moves its right and bottom
 * edges (with the output and mechanism ports on them). A frame view without a size, or smaller
 * than the default, is drawn at the default size, so older files render as before.
 */
import { ROLE_SIDE, roleOf, type Idef0Role } from './idef0-numbering'
import type { Elem, NodeView } from './types'

/** Default sheet geometry in diagram units (spec 11 §1.11), also the smallest sheet. */
export const IDEF0_SHEET = { left: 8, top: 8, width: 1008, height: 752 } as const
/** Drawing (message) area of the default sheet: the rectangle the boundary ports sit on. */
export const IDEF0_AREA = { left: 24, top: 64, right: 1000, bottom: 696 } as const
/** Sheet sizes are multiples of the default grid. */
export const IDEF0_SHEET_GRID = 8

/** Insets of the drawing area from the sheet edges (title block bands plus margins). */
const AREA_INSET = {
  left: IDEF0_AREA.left - IDEF0_SHEET.left,
  top: IDEF0_AREA.top - IDEF0_SHEET.top,
  right: IDEF0_SHEET.left + IDEF0_SHEET.width - IDEF0_AREA.right,
  bottom: IDEF0_SHEET.top + IDEF0_SHEET.height - IDEF0_AREA.bottom
} as const

export interface SheetSize {
  readonly width: number
  readonly height: number
}

export interface SheetBounds extends SheetSize {
  readonly left: number
  readonly top: number
}

/** A drawing area, with the shape of `IDEF0_AREA`. */
export interface DrawingArea {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** The frame view of an IDEF0 diagram, if it has one. */
export function frameViewOf(diagram: Elem | null | undefined): NodeView | null {
  const views = diagram?.['ownedViews']
  if (!Array.isArray(views)) return null
  return ((views as Elem[]).find((v) => v._type === 'IDEF0FrameView') as NodeView | undefined) ?? null
}

/** A size grown to at least the default sheet. */
export function atLeastDefault(size: Partial<SheetSize> | null | undefined): SheetSize {
  return { width: Math.max(IDEF0_SHEET.width, finite(size?.width)), height: Math.max(IDEF0_SHEET.height, finite(size?.height)) }
}

/** The sheet of a stored frame size: the fixed origin and at least the default size. */
export function sheetOfSize(size: Partial<SheetSize> | null | undefined): SheetBounds {
  return { left: IDEF0_SHEET.left, top: IDEF0_SHEET.top, ...atLeastDefault(size) }
}

/** The sheet of `diagram` (the default sheet when it has no frame view). */
export function sheetBoundsOf(diagram: Elem | null | undefined): SheetBounds {
  return sheetOfSize(frameViewOf(diagram))
}

/** The size of the sheet of `diagram`. */
export function sheetSizeOf(diagram: Elem | null | undefined): SheetSize {
  const { width, height } = sheetBoundsOf(diagram)
  return { width, height }
}

/** The drawing area inside a sheet of the given size. */
export function areaOfSheet(size: Partial<SheetSize> | null | undefined): DrawingArea {
  const sheet = sheetOfSize(size)
  return {
    left: sheet.left + AREA_INSET.left,
    top: sheet.top + AREA_INSET.top,
    right: sheet.left + sheet.width - AREA_INSET.right,
    bottom: sheet.top + sheet.height - AREA_INSET.bottom
  }
}

/** The drawing area of `diagram`. */
export function drawingAreaOf(diagram: Elem | null | undefined): DrawingArea {
  return areaOfSheet(frameViewOf(diagram))
}

/** Room kept right of and below the boxes and notes (stubs, feedback lanes, labels, the DRE). */
export const SHEET_CONTENT_MARGIN = 48
/** Room kept past the last boundary port along an edge (the port clamp of `clampAlong`). */
const PORT_MARGIN = 16

function ceilToGrid(value: number): number {
  return Math.ceil(value / IDEF0_SHEET_GRID) * IDEF0_SHEET_GRID
}

/**
 * The smallest sheet `diagram` may have: the default sheet, grown so that its drawing area holds
 * the boxes and notes plus `SHEET_CONTENT_MARGIN` and every boundary port along its edge, rounded
 * up to the grid. Arrows are routed inside the area and follow it, so they do not count.
 */
export function sheetMinimumOf(diagram: Elem | null | undefined): SheetSize {
  let right = 0
  let bottom = 0
  const views = (diagram?.['ownedViews'] as Elem[] | undefined) ?? []
  for (const el of views) {
    const v = el as NodeView
    if (v._type === 'IDEF0FunctionView' || v._type === 'IDEF0NoteView') {
      right = Math.max(right, finite(v.left) + finite(v.width) + SHEET_CONTENT_MARGIN)
      bottom = Math.max(bottom, finite(v.top) + finite(v.height) + SHEET_CONTENT_MARGIN)
    } else if (v._type === 'IDEF0PortView' && v.model) {
      const side = ROLE_SIDE[roleOf(v.model) as Idef0Role] ?? 'left'
      if (side === 'left' || side === 'right') bottom = Math.max(bottom, finite(v.top) + finite(v.height) / 2 + PORT_MARGIN)
      else right = Math.max(right, finite(v.left) + finite(v.width) / 2 + PORT_MARGIN)
    }
  }
  return atLeastDefault({
    width: ceilToGrid(right + AREA_INSET.right - IDEF0_SHEET.left),
    height: ceilToGrid(bottom + AREA_INSET.bottom - IDEF0_SHEET.top)
  })
}

/** A requested size made valid for `diagram`: snapped to the grid and at least its minimum. */
export function validSheetSize(diagram: Elem | null | undefined, size: SheetSize): SheetSize {
  const min = sheetMinimumOf(diagram)
  return {
    width: Math.max(min.width, Math.round(size.width / IDEF0_SHEET_GRID) * IDEF0_SHEET_GRID),
    height: Math.max(min.height, Math.round(size.height / IDEF0_SHEET_GRID) * IDEF0_SHEET_GRID)
  }
}

// ---------------------------------------------------------------------------------------------
// Presets

/**
 * Diagram units per millimetre of paper for the paper presets: the short side of A4 (210 mm) is
 * the width of the default sheet (1008), so every paper size, portrait or landscape, is at least
 * the default sheet and the presets keep the relative sizes of the papers.
 */
export const SHEET_UNITS_PER_MM = IDEF0_SHEET.width / 210

export interface SheetPreset extends SheetSize {
  readonly id: string
  readonly label: string
}

function paper(id: string, label: string, shortMm: number, longMm: number): SheetPreset[] {
  const units = (mm: number): number => Math.round((mm * SHEET_UNITS_PER_MM) / IDEF0_SHEET_GRID) * IDEF0_SHEET_GRID
  const short = units(shortMm)
  const long = units(longMm)
  return [
    { id: `${id}-landscape`, label: `${label} Landscape`, width: long, height: short },
    { id: `${id}-portrait`, label: `${label} Portrait`, width: short, height: long }
  ]
}

/** The Sheet Size presets: the default sheet, then the papers (landscape first). */
export const SHEET_PRESETS: readonly SheetPreset[] = [
  { id: 'default', label: 'Default', width: IDEF0_SHEET.width, height: IDEF0_SHEET.height },
  ...paper('letter', 'Letter', 215.9, 279.4),
  ...paper('legal', 'Legal', 215.9, 355.6),
  ...paper('tabloid', 'Tabloid/Ledger', 279.4, 431.8),
  ...paper('a4', 'A4', 210, 297),
  ...paper('a3', 'A3', 297, 420)
]

/** The preset the sheet of `diagram` has exactly, or null. */
export function matchingSheetPreset(diagram: Elem | null | undefined): SheetPreset | null {
  const size = sheetSizeOf(diagram)
  return SHEET_PRESETS.find((p) => p.width === size.width && p.height === size.height) ?? null
}
