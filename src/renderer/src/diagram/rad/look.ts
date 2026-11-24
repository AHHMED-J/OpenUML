/**
 * The two looks of a RAD diagram, chosen per diagram in Styles > Diagram style and stored in the
 * diagram's `diagramStyle` (files without it are Classic):
 *
 * - Classic: the usual RAD notation, compact: light roles with the "Agent- Role" title in a header,
 *   14-unit symbols with their labels to the right, dark threads.
 * - Colorful: one color per role (its header dot and threads); activities and interactions are
 *   small cards with their name inside, markers are pills.
 *
 * A style decides symbol sizes, text size and the default colors. Colors a user picked for a view
 * (Styles > Fill / Line / Text Color) win over the style: a view still holding the plain defaults
 * (white fill, black line and text; the old gray fill of roles) takes the style's colors. Symbols
 * are drawn centered on their stored position, so switching styles never moves a thread.
 */
import { isKindOf, type Elem, type View } from '../../model'
import type { Font } from '../core'

export type RadStyleName = 'classic' | 'colorful'

export const RAD_STYLES: ReadonlyArray<{ readonly id: RadStyleName; readonly label: string }> = [
  { id: 'classic', label: 'Classic' },
  { id: 'colorful', label: 'Colorful' }
]

/** The style of a RAD diagram (Classic for anything else, old files included). */
export function radStyleOf(diagram: Elem | null | undefined): RadStyleName {
  return diagram?.['diagramStyle'] === 'colorful' ? 'colorful' : 'classic'
}

// ---------------------------------------------------------------------------------------------
// Geometry (diagram units)

export interface RadGeometry {
  readonly square: number
  /** Wait circles. */
  readonly circle: number
  /** Case and part refinement circles. */
  readonly refinement: number
  /** Case branch circles. */
  readonly branchCircle: number
  readonly triangle: { readonly width: number; readonly height: number }
  readonly ellipse: { readonly width: number; readonly height: number }
  readonly marker: { readonly outerW: number; readonly outerH: number; readonly innerW: number; readonly innerH: number }
  readonly pentagon: number
  /** Cards (Colorful activities, interactions, undefined processes and markers). */
  readonly card: { readonly minWidth: number; readonly height: number; readonly maxWidth: number; readonly padX: number; readonly padY: number; readonly radius: number }
  /** Minimum width of a start or end pill. */
  readonly pill: number
  /** Gap between a symbol and its label to the right. */
  readonly labelGap: number
  readonly activityWrap: number
  readonly branchWrap: number
  readonly questionWrap: number
  /** Extra line spacing of label lines (line height = font size + this). */
  readonly lineGap: number
  readonly waitStub: number
  readonly roleStartTip: number
  readonly externalStub: number
  readonly roleMin: { readonly width: number; readonly height: number }
  readonly rolePad: number
  readonly roleRadius: number
  /** Padding above and below the role title in its header. */
  readonly headerPad: number
  /** The loop-back lane lies this far left of the leftmost symbol. */
  readonly loopLane: number
  /** Text size relative to the view's font size (13 → 11 in Classic). */
  readonly textScale: number
  readonly lines: { readonly thread: number; readonly loopBack: number; readonly interaction: number }
}

const CLASSIC: RadGeometry = {
  square: 14,
  circle: 13,
  refinement: 13,
  branchCircle: 12,
  triangle: { width: 14, height: 12 },
  ellipse: { width: 26, height: 15 },
  marker: { outerW: 24, outerH: 15, innerW: 13, innerH: 6 },
  pentagon: 15,
  card: { minWidth: 96, height: 22, maxWidth: 170, padX: 8, padY: 4, radius: 5 },
  pill: 60,
  labelGap: 8,
  activityWrap: 150,
  branchWrap: 110,
  questionWrap: 140,
  lineGap: 3,
  waitStub: 34,
  roleStartTip: 52,
  externalStub: 86,
  roleMin: { width: 120, height: 90 },
  rolePad: 16,
  roleRadius: 10,
  headerPad: 7,
  loopLane: 18,
  textScale: 11 / 13,
  lines: { thread: 1.5, loopBack: 1.5, interaction: 2.5 }
}

const COLORFUL: RadGeometry = {
  ...CLASSIC,
  circle: 15,
  branchCircle: 11,
  triangle: { width: 13, height: 11 },
  pentagon: 16,
  labelGap: 7,
  waitStub: 32,
  roleStartTip: 48,
  externalStub: 60,
  roleMin: { width: 140, height: 90 },
  roleRadius: 12,
  textScale: 10 / 13,
  lines: { thread: 1.5, loopBack: 1.5, interaction: 2 }
}

export function radGeometry(style: RadStyleName): RadGeometry {
  return style === 'colorful' ? COLORFUL : CLASSIC
}

/** `font` at the style's text size (one decimal). */
export function radFont(font: Font, g: RadGeometry): Font {
  return { ...font, size: Math.round(font.size * g.textScale * 10) / 10 }
}

// ---------------------------------------------------------------------------------------------
// Colors (light canvas; the dark canvas converts neutral colors and takes `dark` swatches)

/** Lines, text and filled squares of both styles. */
export const RAD_INK = '#1f2937'
/** Role titles. */
export const RAD_TITLE = '#0f172a'
/** Conditions, outside parties and waits: secondary text. */
export const RAD_MUTED = '#64748b'

export const RAD_ROLE_COLORS: Readonly<Record<RadStyleName, { readonly fill: string; readonly line: string; readonly separator: string }>> = {
  classic: { fill: '#fafafa', line: '#cbd5e1', separator: '#e2e8f0' },
  colorful: { fill: '#f8fafc', line: '#e2e8f0', separator: '#e2e8f0' }
}

interface Swatch {
  /** Threads, borders, filled cards. */
  readonly accent: string
  /** Fill of state pills. */
  readonly tint: string
  /** Text on a filled card. */
  readonly onAccent: string
}

/** One role color, for the light and the dark canvas. */
export interface SwatchPair {
  readonly light: Swatch
  readonly dark: Swatch
}

const swatch = (accent: string, tint: string, darkAccent: string, darkTint: string): SwatchPair => ({
  light: { accent, tint, onAccent: '#ffffff' },
  dark: { accent: darkAccent, tint: darkTint, onAccent: '#0f1115' }
})

/** Role colors of the Colorful style, by role order in the process (they repeat after the last). */
export const RAD_PALETTE: readonly SwatchPair[] = [
  swatch('#3b82f6', '#eff6ff', '#60a5fa', '#16233b'),
  swatch('#10b981', '#ecfdf5', '#34d399', '#0f2b25'),
  swatch('#f59e0b', '#fffbeb', '#fbbf24', '#2e2512'),
  swatch('#8b5cf6', '#f5f3ff', '#a78bfa', '#231b3a'),
  swatch('#f43f5e', '#fff1f2', '#fb7185', '#331820'),
  swatch('#06b6d4', '#ecfeff', '#22d3ee', '#0d2a31'),
  swatch('#84cc16', '#f7fee7', '#a3e635', '#1f2a10'),
  swatch('#ec4899', '#fdf2f8', '#f472b6', '#32172a')
]

/** The role a view sits in (or the role of a role view). */
export function radRoleOf(view: View | null | undefined): Elem | null {
  if (!view) return null
  if (isKindOf(view.model, 'RADRole')) return view.model as Elem
  const c = view.containerView
  if (c && isKindOf(c.model, 'RADRole')) return c.model as Elem
  const parent = view.model?._parent
  return parent && isKindOf(parent, 'RADRole') ? parent : null
}

/** The Colorful swatch of a role: its place among the roles of its process. */
export function radSwatchOf(role: Elem | null | undefined): SwatchPair | null {
  if (!role) return null
  const roles = (role._parent?.['roles'] as Elem[] | undefined) ?? []
  const i = Math.max(0, roles.indexOf(role))
  return RAD_PALETTE[i % RAD_PALETTE.length] ?? null
}

const norm = (c: unknown): string => (typeof c === 'string' ? c.trim().toLowerCase() : '')

/** Plain defaults of new views (and the gray of roles made before the styles). */
const DEFAULT_FILLS = new Set(['', '#ffffff', '#fff', 'white', '#c0c0c0'])
const DEFAULT_INKS = new Set(['', '#000000', '#000', 'black'])

/** Which colors of a view the user picked (Styles); the others come from the diagram style. */
export interface CustomColors {
  readonly fill: boolean
  readonly line: boolean
  readonly font: boolean
}

export function customColorsOf(view: View): CustomColors {
  return { fill: !DEFAULT_FILLS.has(norm(view.fillColor)), line: !DEFAULT_INKS.has(norm(view.lineColor)), font: !DEFAULT_INKS.has(norm(view.fontColor)) }
}

/**
 * Accent parts of a Colorful symbol, drawn from the role's swatch on the canvas in use; a part the
 * user colored is left to the view style. Null in Classic.
 */
export interface AccentUse {
  readonly swatch: SwatchPair
  /** Outline (and threads): the accent. */
  readonly line: boolean
  /** Fill: the accent (filled cards), the tint (state pills) or the view style. */
  readonly fill: 'accent' | 'tint' | null
  /** Text: on the accent fill, in the accent, or the view style. */
  readonly text: 'onAccent' | 'accent' | null
}

export function accentColors(use: AccentUse | null, mode: 'light' | 'dark', style: { readonly fillColor: string; readonly lineColor: string; readonly fontColor: string }): { fill: string; line: string; text: string } {
  const s = use ? use.swatch[mode] : null
  return {
    fill: s && use?.fill === 'accent' ? s.accent : s && use?.fill === 'tint' ? s.tint : style.fillColor,
    line: s && use?.line ? s.accent : style.lineColor,
    text: s && use?.text === 'onAccent' ? s.onAccent : s && use?.text === 'accent' ? s.accent : style.fontColor
  }
}
