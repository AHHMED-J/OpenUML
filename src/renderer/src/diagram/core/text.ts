/**
 * Text measurement and word wrapping (spec 03 §1.9).
 *
 * Simplified metric: a text line's height is exactly the font size (no ascent/descent/line gap).
 * Word wrap splits on single spaces and fills lines greedily.
 */
import type { Size } from './geometry'
import { cssFont, isBold } from './formats'
import type { Font } from './style'

/** Measures one line of text. Implementations must not include line gaps in `height`. */
export interface TextMeasurer {
  measure(text: string, font: Font): Size
}

/**
 * Deterministic measurer for tests and headless layout: every character is
 * `charWidthRatio × fontSize` wide (bold text × `boldFactor`); height = font size.
 */
export class FixedWidthTextMeasurer implements TextMeasurer {
  constructor(
    readonly charWidthRatio = 0.6,
    readonly boldFactor = 1.1
  ) {}

  measure(text: string, font: Font): Size {
    const factor = isBold(font) ? this.boldFactor : 1
    return { width: [...text].length * font.size * this.charWidthRatio * factor, height: font.size }
  }
}

interface Measure2D {
  font: string
  measureText(text: string): { width: number }
}

/**
 * Measurer backed by a 2D canvas context (`OffscreenCanvas` when available, otherwise a
 * detached `<canvas>`). Results are cached per font + text. Construct only in an environment
 * with one of those APIs; see `createTextMeasurer` for a safe factory.
 */
export class CanvasTextMeasurer implements TextMeasurer {
  private readonly ctx: Measure2D
  private readonly cache = new Map<string, number>()
  private readonly maxCacheSize: number

  constructor(ctx?: Measure2D, maxCacheSize = 5000) {
    const resolved = ctx ?? createMeasureContext()
    if (!resolved) throw new Error('CanvasTextMeasurer: no 2D canvas context available')
    this.ctx = resolved
    this.maxCacheSize = maxCacheSize
  }

  measure(text: string, font: Font): Size {
    const css = cssFont(font)
    const key = `${css}\u0000${text}`
    let width = this.cache.get(key)
    if (width === undefined) {
      if (this.ctx.font !== css) this.ctx.font = css
      width = this.ctx.measureText(text).width
      if (this.cache.size >= this.maxCacheSize) this.cache.clear()
      this.cache.set(key, width)
    }
    return { width, height: font.size }
  }

  /** Drops cached widths (e.g. after a web font finished loading). */
  clearCache(): void {
    this.cache.clear()
  }
}

function createMeasureContext(): Measure2D | null {
  const g = globalThis as {
    OffscreenCanvas?: new (w: number, h: number) => { getContext(type: '2d'): Measure2D | null }
    document?: { createElement(tag: 'canvas'): { getContext(type: '2d'): Measure2D | null } }
  }
  try {
    if (typeof g.OffscreenCanvas === 'function') {
      const ctx = new g.OffscreenCanvas(1, 1).getContext('2d')
      if (ctx) return ctx
    }
    if (g.document && typeof g.document.createElement === 'function') {
      const ctx = g.document.createElement('canvas').getContext('2d')
      if (ctx) return ctx
    }
  } catch {
    // Fall through to null.
  }
  return null
}

/** Canvas measurer when a canvas is available, otherwise the deterministic fallback. */
export function createTextMeasurer(): TextMeasurer {
  const ctx = createMeasureContext()
  return ctx ? new CanvasTextMeasurer(ctx) : new FixedWidthTextMeasurer()
}

// ---------------------------------------------------------------------------
// Wrapping and multi-line measurement
// ---------------------------------------------------------------------------

/**
 * Greedy word wrap. The text is first split into paragraphs on newlines; each paragraph is
 * split on single spaces and words are added to a line while it fits in `maxWidth`. A word
 * wider than `maxWidth` is kept whole on its own line. Empty paragraphs give empty lines.
 */
export function wrapText(text: string, maxWidth: number, font: Font, measurer: TextMeasurer): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      if (line === '') {
        line = word
        continue
      }
      const candidate = `${line} ${word}`
      if (measurer.measure(candidate, font).width <= maxWidth) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/** Splits text into lines on newlines without wrapping. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

/**
 * Size of a block of lines: width = widest line, height = lines × lineHeight
 * (lineHeight defaults to the font size; notes use fontSize + 2).
 */
export function measureLines(
  lines: readonly string[],
  font: Font,
  measurer: TextMeasurer,
  lineHeight: number = font.size
): Size {
  let width = 0
  for (const line of lines) width = Math.max(width, measurer.measure(line, font).width)
  return { width, height: lines.length * lineHeight }
}

/**
 * Wraps `text` into `maxWidth` and measures the result. With `wrap = false` only newlines
 * break lines.
 */
export function layoutText(
  text: string,
  font: Font,
  measurer: TextMeasurer,
  options: { maxWidth?: number; wrap?: boolean; lineHeight?: number } = {}
): { lines: string[]; size: Size } {
  const wrap = options.wrap ?? options.maxWidth !== undefined
  const lines =
    wrap && options.maxWidth !== undefined ? wrapText(text, options.maxWidth, font, measurer) : splitLines(text)
  return { lines, size: measureLines(lines, font, measurer, options.lineHeight ?? font.size) }
}
