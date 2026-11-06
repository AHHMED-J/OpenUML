/**
 * PDF pages of diagrams: the exported SVG (on its canvas color) and the page size it is printed at.
 * An IDEF0 diagram whose sheet has a paper size (Format > IDEF0 > Sheet Size) is printed on that
 * paper; any other diagram on a page the size of its picture. The main process prints the pages.
 */
import type { PdfPage } from '../../../shared/ipc'
import { isKindOf, matchingSheetPreset, type Diagram, type Repository } from '../model'
import { canvasPalette, type CanvasMode, type TextMeasurer } from '../diagram/core'
import { renderDiagramSvg } from './svg'

/** CSS pixels per millimetre (96 per inch). */
const PX_PER_MM = 96 / 25.4

export function pdfPageOf(diagram: Diagram, repository: Repository, measurer: TextMeasurer, canvas: CanvasMode = 'light'): PdfPage {
  const { svg, bounds } = renderDiagramSvg(diagram, repository, measurer, { background: canvasPalette(canvas).background, canvas })
  const paper = isKindOf(diagram, 'IDEF0Diagram') ? matchingSheetPreset(diagram)?.paperMm : undefined
  if (paper) return { svg, width: paper.width * PX_PER_MM, height: paper.height * PX_PER_MM }
  return { svg, width: bounds.width, height: bounds.height }
}
