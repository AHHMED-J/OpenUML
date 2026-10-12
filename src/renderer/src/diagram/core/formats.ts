/**
 * String encodings of view values used in .mdj files (spec 01 §5):
 * - points: `"x:y;x:y;..."` (EdgeView.points)
 * - font:   `"face;size;style"` (View.font), where any part may be `?` = "keep previous"
 */
import { FontStyle, GENERIC_FONT_FAMILY, type Font } from './style'

// The encoders are implemented once, in the model module (`model/values.ts`), and re-exported
// here under the names the diagram code uses.
export {
  parsePoints,
  formatPoints as serializePoints,
  parseFont,
  formatFont as serializeFont
} from '../../model'

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
  parts.push(`${font.size + 0}px`)
  parts.push(cssFontFamily(font.face, withFallback))
  return parts.join(' ')
}

/** CSS `font-family` value for a face, optionally followed by the generic fallback family. */
export function cssFontFamily(face: string, withFallback = true): string {
  const quoted = /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(face) ? face : `"${face.replace(/["\\]/g, '\\$&')}"`
  return withFallback ? `${quoted}, ${GENERIC_FONT_FAMILY}` : quoted
}
