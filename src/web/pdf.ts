/**
 * PDF export for the web build. The desktop prints the pages' SVG with Chromium; a browser page
 * cannot, so each page is drawn to a canvas at `SCALE`× and stored as a compressed image in a
 * small PDF of the same page size (1 CSS pixel = 0.75 pt, as the desktop prints). The pictures
 * look exactly like the PNG export; text in them cannot be selected.
 */
import type { PdfPage } from '../shared/ipc'

/** Pixels per CSS pixel: about 216 dpi on paper. */
const SCALE = 3
/** Largest canvas drawn per page; bigger diagrams get a lower scale. */
const MAX_PIXELS = 36_000_000

/** One page image: RGB pixels compressed with zlib (`/FlateDecode`). */
export interface PdfImagePage {
  /** Page size in points. */
  readonly width: number
  readonly height: number
  /** Image size in pixels. */
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly data: Uint8Array
}

const encoder = new TextEncoder()

/** The bytes of a PDF with one full-page image per page. */
export function pdfDocument(pages: readonly PdfImagePage[]): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array): void => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string, stream?: Uint8Array): void => {
    offsets[id] = length
    push(`${id} 0 obj\n${body}\n`)
    if (stream) {
      push('stream\n')
      push(stream)
      push('\nendstream\n')
    }
    push('endobj\n')
  }
  const num = (n: number): string => (Math.round(n * 100) / 100).toString()

  push('%PDF-1.4\n%âãÏÓ\n')
  // Objects: 1 catalog, 2 page tree, then per page: page, content stream, image.
  const pageIds = pages.map((_, i) => 3 + i * 3)
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pages.forEach((page, i) => {
    const pageId = pageIds[i] as number
    const w = num(page.width)
    const h = num(page.height)
    const content = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`)
    object(pageId + 1, `<< /Length ${content.length} >>`, content)
    object(
      pageId + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${page.data.length} >>`,
      page.data
    )
  })
  const count = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** zlib-compresses `bytes` (the format of the PDF `/FlateDecode` filter). */
export async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not draw the diagram for the PDF'))
    img.src = src
  })
}

async function rasterize(page: PdfPage): Promise<PdfImagePage> {
  const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / Math.max(1, page.width * page.height)))
  const pixelWidth = Math.max(1, Math.round(page.width * scale))
  const pixelHeight = Math.max(1, Math.round(page.height * scale))
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(page.svg)}`)
  const canvas = document.createElement('canvas')
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // Transparent parts print white, as on paper.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, pixelWidth, pixelHeight)
  ctx.drawImage(image, 0, 0, pixelWidth, pixelHeight)
  const rgba = ctx.getImageData(0, 0, pixelWidth, pixelHeight).data
  const rgb = new Uint8Array(pixelWidth * pixelHeight * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i] as number
    rgb[j + 1] = rgba[i + 1] as number
    rgb[j + 2] = rgba[i + 2] as number
  }
  return { width: page.width * 0.75, height: page.height * 0.75, pixelWidth, pixelHeight, data: await deflate(rgb) }
}

export async function makePdf(pages: PdfPage[]): Promise<Blob> {
  const images: PdfImagePage[] = []
  // One page at a time: a large model must not hold every canvas in memory at once.
  for (const page of pages) images.push(await rasterize(page))
  return new Blob([pdfDocument(images)], { type: 'application/pdf' })
}
