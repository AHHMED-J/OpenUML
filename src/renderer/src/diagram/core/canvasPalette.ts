/**
 * The two canvases a diagram can be drawn on. Files always hold the colors of the light canvas:
 * the dark one is a drawing-time transform (`toCanvasColor`), so the model and the `.mdj` never
 * change and other tools open the file as it was.
 */
import { COLORS, SELECTION } from './style'

export type CanvasMode = 'light' | 'dark'

/** What a color paints, which decides what the plain defaults turn into. */
export type CanvasColorRole = 'line' | 'font' | 'fill' | 'background'

/** Colors the drawing code uses directly, not taken from a view. */
export interface CanvasPalette {
  readonly mode: CanvasMode
  readonly background: string
  readonly grid: string
  /** Fill of hollow arrowheads. */
  readonly edgeBackground: string
  /** Faint light border that replaces the drop shadow on the dark canvas; null keeps the shadow. */
  readonly glow: string | null
  /** The quick editor's text box. */
  readonly editorText: string
  readonly editorField: string
  readonly handleFill: string
  /** Round handle of a pending IDEF0 arrow. */
  readonly stubHandle: string
  /** A locked RAD role's padlock. */
  readonly lock: string
  readonly lockHole: string
  readonly slotHint: { readonly fill: string; readonly stroke: string; readonly text: string }
}

export const LIGHT_CANVAS: CanvasPalette = {
  mode: 'light',
  background: COLORS.background,
  grid: COLORS.grid,
  edgeBackground: COLORS.edgeBackground,
  glow: null,
  editorText: COLORS.font,
  editorField: COLORS.background,
  handleFill: SELECTION.handleFill,
  stubHandle: COLORS.background,
  lock: '#6e7781',
  lockHole: COLORS.background,
  slotHint: { fill: 'rgba(255,255,255,0.6)', stroke: 'rgba(110,118,129,0.55)', text: 'rgba(110,118,129,0.85)' }
}

const DARK_FILL = '#1b1f27'
const DARK_TEXT = '#e8e8e8'

export const DARK_CANVAS: CanvasPalette = {
  mode: 'dark',
  background: '#0f1115',
  grid: '#23272f',
  edgeBackground: '#0f1115',
  glow: DARK_TEXT,
  editorText: DARK_TEXT,
  editorField: DARK_FILL,
  handleFill: DARK_TEXT,
  stubHandle: DARK_FILL,
  lock: '#9aa2ac',
  lockHole: DARK_FILL,
  slotHint: { fill: 'rgba(27,31,39,0.7)', stroke: 'rgba(154,162,172,0.55)', text: 'rgba(200,206,214,0.9)' }
}

export function canvasPalette(mode: CanvasMode): CanvasPalette {
  return mode === 'dark' ? DARK_CANVAS : LIGHT_CANVAS
}

// ---------------------------------------------------------------------------------------------
// Color math (sRGB, OKLCH)

interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function parseHex(text: string): Rgba | null {
  const hex = text.slice(1)
  const pair = hex.length <= 4 ? [...hex].map((d) => d + d) : (hex.match(/../g) ?? [])
  const [r, g, b, a] = pair.map((p) => parseInt(p, 16) / 255)
  return r === undefined || g === undefined || b === undefined ? null : { r, g, b, a: a ?? 1 }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

function parseFunctional(text: string): Rgba | null {
  const open = text.indexOf('(')
  const parts = text.slice(open + 1, -1).split(/[\s,/]+/).filter(Boolean)
  const [p0, p1, p2, p3] = parts
  if (p0 === undefined || p1 === undefined || p2 === undefined) return null
  const alpha = p3 === undefined ? 1 : p3.endsWith('%') ? parseFloat(p3) / 100 : parseFloat(p3)
  const channel = (p: string): number => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255)
  const [r, g, b] = text.toLowerCase().startsWith('hsl')
    ? hslToRgb(((parseFloat(p0) % 360) + 360) % 360, parseFloat(p1) / 100, parseFloat(p2) / 100)
    : [channel(p0), channel(p1), channel(p2)]
  return [r, g, b, alpha].every(Number.isFinite) ? { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(alpha) } : null
}

/** The channels of a color, or null for what cannot be read (keywords other than these, `none`). */
function parseColor(color: string): Rgba | null {
  const text = color.trim()
  if (text.startsWith('#')) return parseHex(text)
  if (text.endsWith(')')) return parseFunctional(text)
  const word = text.toLowerCase()
  if (word === 'white') return { r: 1, g: 1, b: 1, a: 1 }
  if (word === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  return null
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function rgbToOklch({ r, g, b }: Rgba): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, c: Math.hypot(A, B), h: Math.atan2(B, A) }
}

/** Linear sRGB channels of an OKLCH color (outside 0..1 when it is out of gamut). */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos(h)
  const B = c * Math.sin(h)
  const x = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const y = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const z = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z, -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z]
}

const inGamut = (channels: readonly number[]): boolean => channels.every((v) => v >= -0.0001 && v <= 1.0001)

/** The sRGB color of `color`, lowering the chroma (never the hue or lightness) until it fits. */
function oklchToRgb(color: Oklch, a: number): Rgba {
  let channels = oklchToLinear(color)
  if (!inGamut(channels)) {
    let low = 0
    let high = color.c
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2
      if (inGamut(oklchToLinear({ ...color, c: mid }))) low = mid
      else high = mid
    }
    channels = oklchToLinear({ ...color, c: low })
  }
  const [r, g, b] = channels.map((v) => clamp01(toGamma(clamp01(v))))
  return { r: r as number, g: g as number, b: b as number, a }
}

function toHex({ r, g, b, a }: Rgba): string {
  const byte = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 1 ? byte(a) : ''}`
}

const luminance = ({ r, g, b }: Rgba): number => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

function contrastOf(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** WCAG contrast ratio of two opaque colors (0 when one cannot be read). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [parseColor(a), parseColor(b)]
  return x && y ? contrastOf(x, y) : 0
}

/** OKLCH hue of a color in degrees, or null for a gray or a color that cannot be read. */
export function hueOf(color: string): number | null {
  const rgb = parseColor(color)
  if (!rgb) return null
  const { c, h } = rgbToOklch(rgb)
  return c < 0.02 ? null : ((h * 180) / Math.PI + 360) % 360
}

// ---------------------------------------------------------------------------------------------
// Light canvas colors on the dark canvas

/** Text and lines keep at least this contrast with a box (WCAG AA for text). */
const MIN_CONTRAST = 4.5
/** Lightness above which a line or text color was meant for a dark fill and is only inverted. */
const LIGHT_INK = 0.6
const STEP = 0.02

const FILL_RGB = parseHex(DARK_FILL) as Rgba
const LIGHTEST = rgbToOklch(parseHex(DARK_TEXT) as Rgba).l
const DARKEST = rgbToOklch(FILL_RGB).l

/** `color` lightened or darkened (hue kept) until it reads on `on`; unchanged when it never does. */
function readable(color: Oklch, a: number, on: Rgba, lighter: boolean): Rgba | null {
  for (let l = color.l; l >= 0 && l <= 1; l += lighter ? STEP : -STEP) {
    const rgb = oklchToRgb({ ...color, l }, a)
    if (contrastOf(rgb, on) >= MIN_CONTRAST) return rgb
  }
  return null
}

function inverted(rgb: Rgba, role: CanvasColorRole): string {
  const source = rgbToOklch(rgb)
  const color = { ...source, l: DARKEST + (1 - source.l) * (LIGHTEST - DARKEST) }
  const inkOnDark = (role === 'line' || role === 'font') && source.l < LIGHT_INK
  return toHex((inkOnDark && readable(color, rgb.a, FILL_RGB, true)) || oklchToRgb(color, rgb.a))
}

const dark = new Map<string, string>()

/**
 * `color`, a color for the light canvas, as drawn in `mode`: on the dark canvas its lightness is
 * inverted between the box fill and the text color, keeping the hue, so white boxes get the box
 * fill and black lines the text color. Dark ink is lifted until it reads on a box. What cannot be
 * read (`none`, unknown keywords) is returned as it is.
 */
export function toCanvasColor(color: string, role: CanvasColorRole, mode: CanvasMode): string {
  if (mode === 'light') return color
  const key = `${role}:${color}`
  const known = dark.get(key)
  if (known !== undefined) return known
  const rgb = parseColor(color)
  let result = color
  if (rgb && rgb.a > 0) {
    const white = rgb.a === 1 && rgb.r === 1 && rgb.g === 1 && rgb.b === 1
    const black = rgb.a === 1 && rgb.r === 0 && rgb.g === 0 && rgb.b === 0
    if (white && role === 'fill') result = DARK_FILL
    else if (white && role === 'background') result = DARK_CANVAS.background
    else if (black && (role === 'line' || role === 'font')) result = DARK_TEXT
    else result = inverted(rgb, role)
  }
  dark.set(key, result)
  return result
}

/** `font` adjusted (hue kept) to read on `fill`, both already converted; the pair stays readable. */
export function readableOn(font: string, fill: string): string {
  const [text, box] = [parseColor(font), parseColor(fill)]
  if (!text || !box || contrastOf(text, box) >= MIN_CONTRAST) return font
  const color = rgbToOklch(text)
  const lighter = rgbToOklch(box).l < 0.6
  const best = readable(color, text.a, box, lighter) ?? readable(color, text.a, box, !lighter)
  return best ? toHex(best) : font
}
