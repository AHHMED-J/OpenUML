/**
 * Export module — PNG and SVG images of diagrams (spec 03 §5, spec 02 §10).
 *
 * - `diagramToSvg(diagramId, options?)` → standalone SVG text of a diagram of the open project:
 *   content bounds + 10 margin, zoom 1, no selection or grid, transparent unless
 *   `options.background` is given, text as `<text>` with the font family name (no embedded fonts).
 * - `diagramToPngBase64(diagramId, scale = 2, options?)` → base64 PNG (no `data:` prefix),
 *   rasterized from the same SVG at `scale`, on a white background by default
 *   (`options.background: null` for transparent).
 * - `renderDiagramSvg(diagram, repository, measurer, options?)` is the pure core (tests, batch export).
 */
import { isKindOf, type Diagram } from '../model'
import { projectStore } from '../store'
import { getTextMeasurer } from '../diagram/layout/measurer'
import { renderDiagramSvg, type SvgExportOptions } from './svg'

export { renderDiagramSvg, type RenderedSvg, type SvgExportOptions } from './svg'

function diagramById(diagramId: string): Diagram {
  const d = projectStore.getState().repository.get(diagramId)
  if (!isKindOf(d, 'Diagram')) throw new Error(`No diagram ${diagramId}`)
  return d
}

/** Standalone SVG text of a diagram of the open project. */
export function diagramToSvg(diagramId: string, options: SvgExportOptions = {}): string {
  const { repository } = projectStore.getState()
  return renderDiagramSvg(diagramById(diagramId), repository, getTextMeasurer(), options).svg
}

export interface PngExportOptions {
  /** Background color; default white. `null` = transparent. */
  readonly background?: string | null
  readonly margin?: number
}

/** Base64 PNG (without the `data:` prefix) of a diagram, rasterized at `scale` (default 2×). */
export async function diagramToPngBase64(diagramId: string, scale = 2, options: PngExportOptions = {}): Promise<string> {
  const { repository } = projectStore.getState()
  const background = options.background === undefined ? '#ffffff' : options.background
  const { svg, bounds } = renderDiagramSvg(diagramById(diagramId), repository, getTextMeasurer(), {
    background,
    ...(options.margin !== undefined ? { margin: options.margin } : {})
  })
  const width = Math.max(1, Math.round(bounds.width * scale))
  const height = Math.max(1, Math.round(bounds.height * scale))
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(image, 0, 0, width, height)
  const url = canvas.toDataURL('image/png')
  return url.slice(url.indexOf(',') + 1)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not rasterize the diagram SVG'))
    img.src = src
  })
}
