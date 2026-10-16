/**
 * SVG export (spec 03 §5, spec 02 §10): the same drawing as on screen, without selection or grid,
 * at zoom 1, with a viewBox equal to the content bounds expanded by the margin.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import type { Diagram, Repository } from '../model'
import { EXPORT, exportBounds, fmt, type Rect, type TextMeasurer } from '../diagram/core'
import { computeDiagramLayout } from '../diagram/layout/layoutDiagram'
import { DiagramContent } from '../diagram/render/DiagramContent'
import { ensureNotations } from '../diagram/notations'

export interface SvgExportOptions {
  /** Background fill; null/undefined = transparent (SVG default). */
  readonly background?: string | null
  /** Margin around the content bounds (default 10). */
  readonly margin?: number
}

export interface RenderedSvg {
  readonly svg: string
  /** Exported region in diagram units. */
  readonly bounds: Rect
}

/** Renders a diagram to standalone SVG text with the given measurer. Pure (no store access). */
export function renderDiagramSvg(diagram: Diagram, repository: Repository, measurer: TextMeasurer, options: SvgExportOptions = {}): RenderedSvg {
  ensureNotations()
  const layout = computeDiagramLayout(diagram, repository, measurer)
  const margin = options.margin ?? EXPORT.margin
  const raw = layout.bounds ? exportBounds([layout.bounds], margin) : null
  const b = raw
    ? { left: Math.floor(raw.left), top: Math.floor(raw.top), width: Math.ceil(raw.width), height: Math.ceil(raw.height) }
    : { left: 0, top: 0, width: 2 * margin, height: 2 * margin }
  const body = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      version="1.1"
      width={b.width}
      height={b.height}
      viewBox={`${fmt(b.left)} ${fmt(b.top)} ${fmt(b.width)} ${fmt(b.height)}`}
      fontFamily="Arial, sans-serif"
    >
      {options.background ? <rect x={b.left} y={b.top} width={b.width} height={b.height} fill={options.background} /> : null}
      <DiagramContent layout={layout} />
    </svg>
  )
  // Soft validation marks (RAD warnings) and other editor marks (a locked role's padlock) belong
  // to the editor, not to the exported picture.
  const clean = body.replace(/<g class="rad-warning">.*?<\/g>/g, '').replace(/<g class="editor-only"[^>]*>.*?<\/g>/g, '')
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${clean}`, bounds: b }
}
