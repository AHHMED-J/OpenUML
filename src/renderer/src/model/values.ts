import type { Font, Point, Points } from './types'

/** Font used for new views when no preference overrides it. */
export const DEFAULT_FONT: Font = Object.freeze({ face: 'Arial', size: 13, style: 0 })

export const FontStyle = { normal: 0, bold: 1, italic: 2, boldItalic: 3 } as const

/**
 * Parses `"face;size;style"`. A `?` part (or a missing/invalid part) keeps the value of `base`.
 */
export function parseFont(text: string, base: Font = DEFAULT_FONT): Font {
  const [face, size, style] = text.split(';')
  const num = (part: string | undefined, fallback: number): number => {
    if (part === undefined || part === '?' || part.trim() === '') return fallback
    const n = Number(part)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    face: face === undefined || face === '?' || face === '' ? base.face : face,
    size: num(size, base.size),
    style: num(style, base.style)
  }
}

export function formatFont(font: Font): string {
  return `${font.face};${font.size};${font.style}`
}

/** Parses `"x1:y1;x2:y2;..."`. An empty string means "no points". Invalid points are skipped. */
export function parsePoints(text: string): Point[] {
  if (text.trim() === '') return []
  const points: Point[] = []
  for (const part of text.split(';')) {
    const [xs, ys] = part.split(':')
    const x = Number(xs)
    const y = Number(ys)
    if (xs !== undefined && ys !== undefined && Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y })
  }
  return points
}

export function formatPoints(points: Points): string {
  return points.map((p) => `${p.x}:${p.y}`).join(';')
}

export function fontWith(font: Font, changes: Partial<Font>): Font {
  return { ...font, ...changes }
}
