/**
 * Measure/arrange of IDEF0 nodes (spec 11 §3.7, §6): function boxes with derived box number and
 * detail reference, boundary ports with ICOM codes, the sheet frame with its title block, and
 * model notes. Pure: reads the model, returns layout data.
 */
import {
  IDEF0_SHEET,
  areaOfSheet,
  functionViewsOf,
  icomCodes,
  isContextDiagram,
  isIdef0Function,
  modelOf,
  nodeReference,
  diagramNodeNumber,
  effectiveArrowName,
  fontWith,
  parentDiagramOf,
  sheetMinimumOf,
  sheetOfSize,
  type Elem,
  type Idef0Role,
  type NodeView
} from '../../model'
import { wrapText, type Font, type Rect } from '../core'
import { nameEditText, nodeLayout, styleOf } from '../layout/helpers'
import type { EditRegion, LayoutContext, NodeLayout, TextLine } from '../layout/types'
import { IDEF0_BOX, IDEF0_PORT_SIZE, IDEF0_STYLE, areaRectOf, rectCenterOf } from './geometry'
import { IDEF0_ROLE_COLORS } from './colors'
import { isPendingPort } from './pending'
import { STATUS_STAGES, boxNumberText, dreText, statusLabel, titleText } from './strings'

const LINE_GAP = 2

// ---------------------------------------------------------------------------------------------
// Function box

export interface FunctionData {
  readonly nameLines: readonly TextLine[]
  readonly numberLine: TextLine
  readonly dreLine: TextLine | null
  readonly lineWidth: number
}

function wrapName(name: string, width: number, font: Font, ctx: LayoutContext): string[] {
  return wrapText(name, Math.max(8, width - IDEF0_STYLE.boxPadding), font, ctx.measurer)
}

/** Function box: square corners, centered wrapped name, box number lower-right, DRE below it. */
export function layoutFunction(view: NodeView, ctx: LayoutContext): NodeLayout<FunctionData> {
  const style = styleOf(view)
  const fn = view.model
  const name = (fn?.['name'] as string | undefined) ?? ''
  const font = style.font
  const lineHeight = font.size + LINE_GAP
  const numberFont = fontWith(font, { size: IDEF0_STYLE.numberFontSize, style: 1 })
  const dreFont = fontWith(font, { size: IDEF0_STYLE.dreFontSize })
  const widest = name.split(/\s+/).reduce((w, word) => Math.max(w, ctx.measurer.measure(word, font).width), 0)
  const minWidth = Math.max(IDEF0_BOX.minWidth, Math.ceil(widest) + 2 * IDEF0_STYLE.boxPadding)
  const probeWidth = Math.max(minWidth, view.width ?? 0)
  const probeLines = wrapName(name, probeWidth, font, ctx)
  const minHeight = Math.max(IDEF0_BOX.minHeight, probeLines.length * lineHeight + 2 * IDEF0_STYLE.boxPadding + 12)

  const number = fn ? boxNumberText(fn) : ''
  const dre = fn && view['showDre'] !== false && isIdef0Function(fn) ? dreText(fn) : ''
  const numberWidth = Math.ceil(ctx.measurer.measure(number, numberFont).width)
  const dreWidth = Math.ceil(ctx.measurer.measure(dre, dreFont).width)

  const arrange = (box: Rect): FunctionData => {
    const lines = wrapName(name, box.width, font, ctx)
    const top = box.top + (box.height - lines.length * lineHeight) / 2
    const nameLines = lines.map<TextLine>((text, i) => ({
      text,
      font,
      align: 'center',
      box: { left: box.left + IDEF0_STYLE.boxPadding / 2, top: top + i * lineHeight, width: box.width - IDEF0_STYLE.boxPadding, height: lineHeight }
    }))
    const numberLine: TextLine = {
      text: number,
      font: numberFont,
      align: 'right',
      box: { left: box.left + box.width - 6 - numberWidth, top: box.top + box.height - 4 - numberFont.size, width: numberWidth, height: numberFont.size }
    }
    const dreLine: TextLine | null = dre
      ? { text: dre, font: dreFont, align: 'right', box: { left: box.left + box.width - dreWidth, top: box.top + box.height + 3, width: dreWidth, height: dreFont.size } }
      : null
    return { nameLines, numberLine, dreLine, lineWidth: IDEF0_STYLE.boxLine }
  }
  const layout = nodeLayout(view, {
    minWidth,
    minHeight,
    style,
    data: arrange,
    // A decomposed box opens its child diagram on double-click, so it offers no inline name edit.
    regions: (box): EditRegion[] =>
      fn && !fn['childDiagram']
        ? [
            {
              box: { left: box.left + 4, top: box.top + 4, width: box.width - 8, height: Math.max(8, box.height - 8) },
              target: { kind: 'name', elementId: fn._id },
              text: nameEditText(fn),
              font
            }
          ]
        : [],
    extraBounds: dre ? [{ left: view.left + (view.width ?? 0) - dreWidth, top: view.top + (view.height ?? 0) + 3, width: dreWidth, height: dreFont.size }] : []
  })
  // The selected box resizes from anywhere on its outline: its side handles sit under the arrow ends.
  return { ...layout, resizeOutline: true }
}

// ---------------------------------------------------------------------------------------------
// Boundary port

export interface PortData {
  readonly role: string
  /** ICOM code (`I1`, `C3`, ...) or null. */
  readonly codeLine: TextLine | null
  /** The port stands for no parent arrow and is not tunneled: drawn in the warning color. */
  readonly unlinked: boolean
  /** Anchor of the arrow ends: the center of the port, on the drawing-area edge. */
  readonly anchor: { readonly x: number; readonly y: number }
  /** The port stands for a parent arrow no box uses yet: drawn as a pending arrow. */
  readonly pending: PendingStub | null
}

/** A pending arrow: a short dashed stub from the frame edge into the sheet, with a round handle. */
interface PendingStub {
  /** Free end of the stub (the handle); the other end is the port's anchor. */
  readonly handle: { readonly x: number; readonly y: number }
  readonly color: string
  /** Effective name of the parent arrow, beside the stub. */
  readonly label: TextLine | null
}

/** Length of a pending arrow's stub and radius of its handle. */
export const PENDING_STUB = 32
export const PENDING_HANDLE = 4

function portUnlinked(port: Elem, diagram: Elem): boolean {
  if (isContextDiagram(diagram) || port['corresponds']) return false
  const scope = diagram._parent
  const arrows = ((scope?.['arrows'] as Elem[] | undefined) ?? []).filter((a) => a['source'] === port || a['target'] === port)
  return !arrows.some((a) => (a['source'] === port ? a['tunnelSource'] : a['tunnelTarget']) === true)
}

/** The stub of a pending port anchored at `c`, its label placed away from the ICOM code. */
function pendingStub(port: Elem, role: string, c: { x: number; y: number }, font: Font, ctx: LayoutContext): PendingStub {
  const d = PENDING_STUB
  const handle = role === 'input' ? { x: c.x + d, y: c.y } : role === 'output' ? { x: c.x - d, y: c.y } : role === 'control' ? { x: c.x, y: c.y + d } : { x: c.x, y: c.y - d }
  const text = effectiveArrowName(port['corresponds'] as Elem)
  let label: TextLine | null = null
  if (text) {
    const w = Math.ceil(ctx.measurer.measure(text, font).width)
    const h = font.size
    // Above the stub for inputs and outputs (the code sits below); beside it for controls and mechanisms.
    const at =
      role === 'input'
        ? { left: c.x + 4, top: c.y - 4 - h }
        : role === 'output'
          ? { left: c.x - 4 - w, top: c.y - 4 - h }
          : role === 'control'
            ? { left: c.x + 6, top: c.y + 8 }
            : { left: c.x - 6 - w, top: c.y - 8 - h }
    label = { text, font, align: 'left', box: { left: at.left, top: at.top, width: w, height: h } }
  }
  return { handle, color: IDEF0_ROLE_COLORS[role as Idef0Role] ?? IDEF0_ROLE_COLORS.input, label }
}

/** Area covering a pending stub, its handle and its label (hit testing and export bounds). */
function stubBounds(anchor: { x: number; y: number }, stub: PendingStub): Rect[] {
  const pad = PENDING_HANDLE + 2
  const left = Math.min(anchor.x, stub.handle.x) - pad
  const top = Math.min(anchor.y, stub.handle.y) - pad
  const line = { left, top, width: Math.abs(anchor.x - stub.handle.x) + 2 * pad, height: Math.abs(anchor.y - stub.handle.y) + 2 * pad }
  return stub.label ? [line, stub.label.box] : [line]
}

export function layoutPort(view: NodeView, ctx: LayoutContext): NodeLayout<PortData> {
  const style = styleOf(view)
  const port = view.model
  const role = (port?.['role'] as string | undefined) ?? 'input'
  const codeFont = fontWith(style.font, { size: IDEF0_STYLE.codeFontSize })
  const labelFont = fontWith(style.font, { size: IDEF0_STYLE.labelFontSize })
  const code = port ? (icomCodes(ctx.diagram).get(port._id) ?? '') : ''
  const codeWidth = code ? Math.ceil(ctx.measurer.measure(code, codeFont).width) : 0
  const pending = port ? isPendingPort(port) : false
  const base = nodeLayout<PortData>(view, {
    minWidth: IDEF0_PORT_SIZE,
    minHeight: IDEF0_PORT_SIZE,
    sizable: 'none',
    style,
    data: (box) => {
      const c = rectCenterOf(box)
      const h = codeFont.size
      let line: TextLine | null = null
      if (code) {
        // Codes sit below the line (input, output) or beside it, away from the labels above the line.
        const at =
          role === 'input'
            ? { left: c.x + 6, top: c.y + 3 }
            : role === 'output'
              ? { left: c.x - 6 - codeWidth, top: c.y + 3 }
              : role === 'control'
                ? { left: c.x - 5 - codeWidth, top: c.y + 5 }
                : { left: c.x + 5, top: c.y - 5 - h }
        line = { text: code, font: codeFont, align: 'left', box: { left: at.left, top: at.top, width: codeWidth, height: h } }
      }
      const stub = pending && port ? pendingStub(port, role, c, labelFont, ctx) : null
      return { role, codeLine: line, unlinked: port ? portUnlinked(port, ctx.diagram) : false, anchor: c, pending: stub }
    }
  })
  // Ports slide along the edge of the drawing area only.
  const vertical = role === 'input' || role === 'output'
  const stubAreas = base.data.pending ? stubBounds(base.data.anchor, base.data.pending) : []
  return {
    ...base,
    moveAxis: vertical ? 'vert' : 'horz',
    ...(stubAreas.length > 0 ? { outerHitAreas: stubAreas, extraBounds: [...stubAreas, ...(base.data.codeLine ? [base.data.codeLine.box] : [])] } : {})
  }
}

// ---------------------------------------------------------------------------------------------
// Frame and title block

interface FrameCell {
  readonly rect: Rect
  readonly caption: TextLine
  readonly value: TextLine | null
}

export interface FrameData {
  readonly sheet: Rect
  readonly bands: readonly Rect[]
  readonly cells: readonly FrameCell[]
  /** Status stage names with the current one flagged. */
  readonly stages: ReadonlyArray<{ readonly line: TextLine; readonly current: boolean; readonly rect: Rect }>
  readonly thumbnail: { readonly rect: Rect; readonly boxes: readonly Rect[]; readonly highlight: Rect | null } | null
  readonly contextTop: TextLine | null
  readonly purposeLines: readonly TextLine[]
}

const TOP_BAND_HEIGHT = 40
const BOTTOM_BAND_HEIGHT = 48
/** Cell widths of the title block bands on the default sheet (0 = takes the rest). */
const TOP_CELLS: readonly number[] = [160, 96, 192, 304, 256]
const BOTTOM_CELLS: readonly number[] = [160, 0, 160]
/** Width of the border strips of the sheet that select the frame. */
const BORDER_HIT = 4

/**
 * The cells of a title block band: on a sheet wider than the default every cell keeps its share of
 * the width (the fixed cells grow by the same factor, rounded; the flexible cell takes the rest).
 */
function cellsOf(band: Rect, widths: readonly number[]): Rect[] {
  const out: Rect[] = []
  let x = band.left
  const factor = band.width / IDEF0_SHEET.width
  const scaled = widths.map((w) => (w > 0 ? Math.round(w * factor) : 0))
  const fixed = scaled.reduce((a, b) => a + b, 0)
  const flexIndex = widths.indexOf(0)
  scaled.forEach((w, i) => {
    // Without a flexible cell the last cell absorbs the rounding.
    const width = i === flexIndex ? band.width - fixed : flexIndex < 0 && i === scaled.length - 1 ? band.left + band.width - x : w
    out.push({ left: x, top: band.top, width, height: band.height })
    x += width
  })
  return out
}

function thumbnailOf(diagram: Elem, detailed: Elem | null, area: Rect): FrameData['thumbnail'] {
  const parent = parentDiagramOf(diagram)
  if (!parent) return null
  // The parent's boxes are mapped from the parent's own drawing area (its sheet may be larger).
  const parentArea = areaRectOf(parent)
  const scale = Math.min(area.width / parentArea.width, area.height / parentArea.height)
  const ox = area.left + (area.width - parentArea.width * scale) / 2
  const oy = area.top + (area.height - parentArea.height * scale) / 2
  const map = (v: NodeView): Rect => ({
    left: ox + (v.left - parentArea.left) * scale,
    top: oy + (v.top - parentArea.top) * scale,
    width: Math.max(2, v.width * scale),
    height: Math.max(2, v.height * scale)
  })
  const views = functionViewsOf(parent)
  const hl = views.find((v) => v.model === detailed)
  return { rect: area, boxes: views.map(map), highlight: hl ? map(hl) : null }
}

export function layoutFrame(view: NodeView, ctx: LayoutContext): NodeLayout<FrameData> {
  const diagram = (view.model ?? ctx.diagram) as Elem
  const style = styleOf(view)
  const font = style.font
  const captionFont = fontWith(font, { size: IDEF0_STYLE.captionFontSize })
  const valueFont = fontWith(font, { size: 12 })
  const model = modelOf(diagram)
  const context = isContextDiagram(diagram)
  const project = ctx.repository.project
  const author = ((diagram['author'] as string) || (project?.author ?? '')) as string
  const showBands = diagram['showTitleBlock'] !== false
  const showTop = showBands && diagram['showWorkingBand'] !== false
  const detailed = context ? null : diagram._parent
  // The origin of the sheet is fixed; its size is stored on the view (at least the default sheet).
  const sheet = sheetOfSize(view)
  const sheetView = { ...view, ...sheet } as NodeView
  const area = areaOfSheet(sheet)
  const topBand: Rect = { left: sheet.left, top: sheet.top, width: sheet.width, height: TOP_BAND_HEIGHT }
  const bottomBand: Rect = { left: sheet.left, top: sheet.top + sheet.height - BOTTOM_BAND_HEIGHT, width: sheet.width, height: BOTTOM_BAND_HEIGHT }

  const topCells = cellsOf(topBand, TOP_CELLS)
  const bottomCells = cellsOf(bottomBand, BOTTOM_CELLS)
  const regions: EditRegion[] = []
  const hit: Rect[] = []

  const line = (rect: Rect, text: string, f: Font, align: TextLine['align'], dy: number, h: number): TextLine => ({
    text,
    font: f,
    align,
    box: { left: rect.left + 4, top: rect.top + dy, width: rect.width - 8, height: h }
  })
  const cell = (rect: Rect, caption: string, value: string | null, dy = 15, edit?: EditRegion['target']): FrameCell => {
    const valueLine = value === null ? null : line(rect, value, valueFont, 'left', dy, 14)
    if (edit && valueLine) {
      regions.push({ box: { ...valueLine.box, height: Math.max(14, rect.height - dy - 2) }, target: edit, text: value ?? '', font: valueFont })
    }
    return { rect, caption: line(rect, caption, captionFont, 'left', 3, 10), value: valueLine }
  }

  const cells: FrameCell[] = []
  const stages: Array<{ line: TextLine; current: boolean; rect: Rect }> = []
  let thumbnail: FrameData['thumbnail'] = null
  let contextTop: TextLine | null = null
  const bands: Rect[] = []
  if (showTop) {
    bands.push(topBand)
    const [authorC, dateC, projectC, statusC, contextC] = topCells as [Rect, Rect, Rect, Rect, Rect]
    cells.push(cell(authorC, 'AUTHOR', author, 15, { kind: 'field', elementId: diagram._id, field: 'author' }))
    cells.push(cell(dateC, 'DATE', (diagram['date'] as string) ?? '', 15, { kind: 'field', elementId: diagram._id, field: 'date' }))
    cells.push(cell(projectC, 'PROJECT', project?.name ?? '', 15))
    cells.push(cell(statusC, 'STATUS', null))
    const current = (diagram['status'] as string) ?? 'working'
    // Stage cells are as wide as their names (plus padding), scaled to fill the cell.
    const natural = STATUS_STAGES.map((stage) => ctx.measurer.measure(statusLabel(stage), captionFont).width + 12)
    const factor = (statusC.width - 8) / natural.reduce((a, b) => a + b, 0)
    let stageLeft = statusC.left + 4
    STATUS_STAGES.forEach((stage, i) => {
      const width = (natural[i] as number) * factor
      const rect: Rect = { left: stageLeft, top: statusC.top + 16, width: width - 2, height: 18 }
      stageLeft += width
      stages.push({ line: { text: statusLabel(stage), font: captionFont, align: 'center', box: rect }, current: stage === current, rect })
    })
    cells.push(cell(contextC, 'CONTEXT', null))
    if (context) contextTop = line({ ...contextC, left: contextC.left + 60, width: contextC.width - 64 }, 'TOP', valueFont, 'left', 15, 14)
    else thumbnail = thumbnailOf(diagram, detailed, { left: contextC.left + 72, top: contextC.top + 4, width: contextC.width - 80, height: contextC.height - 8 })
  }
  if (showBands) {
    bands.push(bottomBand)
    const [nodeC, titleC, numberC] = bottomCells as [Rect, Rect, Rect]
    cells.push(cell(nodeC, 'NODE', nodeReference(model, diagramNodeNumber(diagram)), 18))
    cells.push(cell(titleC, 'TITLE', titleText(diagram), 18))
    cells.push(cell(numberC, 'NUMBER', (diagram['number'] as string) ?? '', 18, { kind: 'field', elementId: diagram._id, field: 'number' }))
    hit.push(topBand, bottomBand)
  }
  if (showTop) hit.push(topBand)

  // A-0: purpose and viewpoint statements in the lower-left of the drawing area.
  const purposeLines: TextLine[] = []
  if (context && model) {
    const small = fontWith(font, { size: IDEF0_STYLE.numberFontSize })
    const block = (top: number, caption: string, text: string, field: 'purpose' | 'viewpoint'): void => {
      const width = 420
      const lines = wrapText(`${caption}: ${text}`, width, small, ctx.measurer).slice(0, 2)
      lines.forEach((t, i) => purposeLines.push({ text: t, font: small, align: 'left', box: { left: 32, top: top + i * 13, width, height: 13 } }))
      const rect: Rect = { left: 32, top, width, height: 26 }
      regions.push({ box: rect, target: { kind: 'field', elementId: model._id, field }, text: (model[field] as string) ?? '', font: small, multiline: true })
      hit.push(rect)
    }
    block(area.bottom - 56, 'PURPOSE', (model['purpose'] as string) ?? '', 'purpose')
    block(area.bottom - 28, 'VIEWPOINT', (model['viewpoint'] as string) ?? '', 'viewpoint')
  }

  // The frame is hit on its title block bands and its border, never inside the drawing area (an
  // empty-canvas press there starts a rubber band).
  const right = sheet.left + sheet.width
  const bottom = sheet.top + sheet.height
  hit.push(
    { left: sheet.left, top: sheet.top, width: BORDER_HIT, height: sheet.height },
    { left: right - BORDER_HIT, top: sheet.top, width: BORDER_HIT, height: sheet.height }
  )
  if (!showTop) hit.push({ left: sheet.left, top: sheet.top, width: sheet.width, height: BORDER_HIT })
  if (!showBands) hit.push({ left: sheet.left, top: bottom - BORDER_HIT, width: sheet.width, height: BORDER_HIT })

  const layout = nodeLayout<FrameData>(sheetView, {
    minWidth: IDEF0_SHEET.width,
    minHeight: IDEF0_SHEET.height,
    // Only the right, bottom and bottom-right handles: the sheet origin (and the content) stays put.
    sizable: 'grow',
    movable: false,
    zIndex: -1,
    style,
    regions,
    data: (box) => ({ sheet: box, bands, cells, stages, thumbnail, contextTop, purposeLines })
  })
  // Resizing stops where the drawing area would no longer hold the boxes, notes and ports; the
  // drawn sheet itself is only grown to the default size, so older files render as before.
  const min = sheetMinimumOf(diagram)
  return { ...layout, viewId: view._id, minWidth: min.width, minHeight: min.height, hitAreas: hit }
}

// ---------------------------------------------------------------------------------------------
// Model note

export interface NoteData {
  readonly text: TextLine
}

export function layoutModelNote(view: NodeView): NodeLayout<NoteData> {
  const style = styleOf(view)
  const note = view.model
  const font = fontWith(style.font, { size: IDEF0_STYLE.numberFontSize })
  const label = note ? String(note['number'] as number) : ''
  return nodeLayout(view, {
    minWidth: 16,
    minHeight: 16,
    sizable: 'none',
    zIndex: 2,
    style,
    data: (box) => ({ text: { text: label, font, align: 'center', box } }),
    regions: (box) => (note ? [{ box, target: { kind: 'field', elementId: note._id, field: 'text' }, text: (note['text'] as string) ?? '', font, multiline: true }] : [])
  })
}
