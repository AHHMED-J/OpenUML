/**
 * PDF export: the renderer sends one standalone SVG per page; the main process lays them out in
 * a static HTML document (one page each, page size from CSS) that a hidden window without
 * JavaScript prints to PDF. Kept free of Electron for unit tests.
 */
import type { PdfPage } from '../shared/ipc'

const MAX_PDF_PAGES = 500
/** Largest page side in CSS pixels (about 5.3 m). */
const MAX_PAGE_PX = 20000
const MAX_SVG_LENGTH = 64 * 1024 * 1024
const MAX_TOTAL_LENGTH = 256 * 1024 * 1024

function clampSide(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(MAX_PAGE_PX, Math.max(1, Math.round(value * 100) / 100))
}

/** Valid pages from untrusted input, or null. Each SVG must be a standalone `<svg>` document. */
export function sanitizePdfPages(value: unknown): PdfPage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PDF_PAGES) return null
  const pages: PdfPage[] = []
  let total = 0
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Record<string, unknown>
    const svg = p['svg']
    const width = clampSide(p['width'])
    const height = clampSide(p['height'])
    if (typeof svg !== 'string' || svg.length > MAX_SVG_LENGTH || width === null || height === null) return null
    if (!/^\s*(<\?xml[^>]*\?>\s*)?<svg[\s>]/.test(svg)) return null
    total += svg.length
    if (total > MAX_TOTAL_LENGTH) return null
    pages.push({ svg, width, height })
  }
  return pages
}

/**
 * The document printed to PDF: each page is a named CSS page of its own size with the SVG as an
 * image scaled to fit (vector in the PDF). The policy allows nothing but inline styles and data
 * images, so the document can load nothing from anywhere.
 */
export function pdfHtml(pages: readonly PdfPage[]): string {
  const css = pages.map((p, i) => `@page p${i} { size: ${p.width}px ${p.height}px; margin: 0 }`).join('\n')
  const body = pages
    .map((p, i) => {
      const src = `data:image/svg+xml;base64,${Buffer.from(p.svg, 'utf8').toString('base64')}`
      return `<div class="page" style="page: p${i}; width: ${p.width}px; height: ${p.height}px"><img alt="" src="${src}"></div>`
    })
    .join('\n')
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.page { display: flex; align-items: center; justify-content: center; overflow: hidden; break-after: page; }
.page:last-child { break-after: auto; }
.page img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
${css}
</style></head>
<body>
${body}
</body></html>`
}
