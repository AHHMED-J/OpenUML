/**
 * String encodings of view values used in .mdj files (spec 01 §5):
 * - points: `"x:y;x:y;..."` (EdgeView.points)
 * - font:   `"face;size;style"` (View.font), where any part may be `?` = "keep previous"
 */
import type { Point } from './geometry'
import { DEFAULT_FONT, FontStyle, GENERIC_FONT_FAMILY, type Font } from './style'

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/**
 * Parses a points string. Empty or whitespace-only input yields `[]` ("no points; recompute
 * the route"). Malformed entries (missing `:` or non-numeric coordinates) are skipped.
 */
export function parsePoints(value: string | null | undefined): Point[] {
  if (!value) return []
  const result: Point[] = []
  for (const part of value.split(';')) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    const colon = trimmed.indexOf(':')
    if (colon < 0) continue
    const xs = trimmed.slice(0, colon).trim()
    const ys = trimmed.slice(colon + 1).trim()
    if (xs === '' || ys === '') continue
    const x = Number(xs)
    const y = Number(ys)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    result.push({ x, y })
  }
  return result
}

/** Serializes points as `"x:y;x:y"`. Numbers are written as plain JS numbers. */
export function serializePoints(points: readonly Point[]): string {
  return points.map((p) => `${formatNumber(p.x)}:${formatNumber(p.y)}`).join(';')
}

function formatNumber(n: number): string {
  // Avoid "-0" in output.
  return Object.is(n, -0) ? '0' : String(n)
}

// ---------------------------------------------------------------------------
// Font
// ---------------------------------------------------------------------------

/**
 * Parses a font string `"face;size;style"`. A `?`, empty, or invalid part keeps the value from
 * `base` (defaults to the built-in default font). Style codes outside 0..3 fall back to `base`.
 */
export function parseFont(value: string | null | undefined, base: Font = DEFAULT_FONT): Font {
  const result: Font = { face: base.face, size: base.size, style: base.style }
  if (!value) return result
  const [face, size, style] = value.split(';')
  if (face !== undefined && face.trim() !== '' && face.trim() !== '?') result.face = face.trim()
  if (size !== undefined && size.trim() !== '?') {
    const n = Number(size)
    if (size.trim() !== '' && Number.isFinite(n) && n > 0) result.size = n
  }
  if (style !== undefined && style.trim() !== '?') {
    const n = Number(style)
    if (style.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 3) result.style = n as FontStyle
  }
  return result
}

/** Serializes a font as `"face;size;style"`. */
export function serializeFont(font: Font): string {
  return `${font.face};${formatNumber(font.size)};${font.style}`
}

export function isBold(font: Font): boolean {
  return font.style === FontStyle.Bold || font.style === FontStyle.BoldItalic
}

export function isItalic(font: Font): boolean {
  return font.style === FontStyle.Italic || font.style === FontStyle.BoldItalic
}

/** Returns a copy of `font` with bold/italic set as requested. */
export function withFontStyle(font: Font, bold: boolean, italic: boolean): Font {
  const style = (bold ? 1 : 0) + (italic ? 2 : 0)
  return { face: font.face, size: font.size, style: style as FontStyle }
}

/** Returns a copy of `font` with its size multiplied by `factor`. */
export function scaleFont(font: Font, factor: number): Font {
  return { face: font.face, size: font.size * factor, style: font.style }
}

/**
 * CSS font shorthand for canvas `ctx.font` / SVG: `"[italic] [bold] <size>px <face>, sans-serif"`.
 * Face names that are not simple identifiers are quoted.
 */
export function cssFont(font: Font, withFallback = true): string {
  const parts: string[] = []
  if (isItalic(font)) parts.push('italic')
  if (isBold(font)) parts.push('bold')
  parts.push(`${formatNumber(font.size)}px`)
  parts.push(cssFontFamily(font.face, withFallback))
  return parts.join(' ')
}

/** CSS `font-family` value for a face, optionally followed by the generic fallback family. */
export function cssFontFamily(face: string, withFallback = true): string {
  const quoted = /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(face) ? face : `"${face.replace(/["\\]/g, '\\$&')}"`
  return withFallback ? `${quoted}, ${GENERIC_FONT_FAMILY}` : quoted
}
