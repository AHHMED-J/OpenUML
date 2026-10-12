import type { Font, Point, Points } from './types'

/** Font used for new views when no preference overrides it. */
export const DEFAULT_FONT: Font = Object.freeze({ face: 'Arial', size: 13, style: 0 })

export const FontStyle = { normal: 0, bold: 1, italic: 2, boldItalic: 3 } as const

/**
 * Parses `"face;size;style"`. A `?`, empty or invalid part (non-positive size, style outside
 * 0..3) keeps the value of `base`. `null`/`undefined` give `base`.
 *
 * This is the single implementation of the font encoding; `diagram/core` re-exports it.
 */
export function parseFont(text: string | null | undefined, base: Font = DEFAULT_FONT): Font {
  if (!text) return { face: base.face, size: base.size, style: base.style }
  const [face, size, style] = text.split(';')
  const keep = (part: string | undefined): boolean => part === undefined || part.trim() === '' || part.trim() === '?'
  const sizeNum = Number(size)
  const styleNum = Number(style)
  return {
    face: keep(face) ? base.face : (face as string).trim(),
    size: !keep(size) && Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : base.size,
    style: !keep(style) && Number.isInteger(styleNum) && styleNum >= 0 && styleNum <= 3 ? styleNum : base.style
  }
}

function formatNumber(n: number): string {
  // Avoid "-0" in output.
  return Object.is(n, -0) ? '0' : String(n)
}

export function formatFont(font: Font): string {
  return `${font.face};${formatNumber(font.size)};${font.style}`
}

/**
 * Parses `"x1:y1;x2:y2;..."`. Empty/whitespace input (or `null`/`undefined`) means "no points".
 * Malformed parts (missing `:`, empty or non-numeric coordinates) are skipped.
 *
 * This is the single implementation of the points encoding; `diagram/core` re-exports it.
 */
export function parsePoints(text: string | null | undefined): Point[] {
  if (!text) return []
  const points: Point[] = []
  for (const part of text.split(';')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const xs = part.slice(0, colon).trim()
    const ys = part.slice(colon + 1).trim()
    if (xs === '' || ys === '') continue
    const x = Number(xs)
    const y = Number(ys)
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y })
  }
  return points
}

export function formatPoints(points: Points): string {
  return points.map((p) => `${formatNumber(p.x)}:${formatNumber(p.y)}`).join(';')
}

export function fontWith(font: Font, changes: Partial<Font>): Font {
  return { ...font, ...changes }
}
