/**
 * Default visual style and layout constants for diagrams (spec 03 §1.4–§2.4, §3, §5).
 *
 * Everything here is a plain constant; nothing is read from preferences. A future style resolver
 * layers per-element and global preferences on top of these built-in defaults.
 */
import type { Font as ModelFont } from '../../model'

// ---------------------------------------------------------------------------
// Numeric codes persisted in .mdj files
// ---------------------------------------------------------------------------

/** `EdgeView.lineStyle` codes. New edges default to oblique. */
export const LineStyle = {
  Rectilinear: 0,
  Oblique: 1,
  RoundedRectilinear: 2,
  Curve: 3,
  /** Persisted code exists; spec 03 does not describe it. Treated like oblique. */
  Direct: 4
} as const
export type LineStyle = (typeof LineStyle)[keyof typeof LineStyle]

/** True for the line styles whose points are an axis-aligned polyline. */
export function isRectilinearStyle(style: LineStyle): boolean {
  return style === LineStyle.Rectilinear || style === LineStyle.RoundedRectilinear
}

/** `EdgeParasiticView.edgePosition` codes: the anchor an edge label is placed from. */
export const EdgePosition = { Head: 0, Middle: 1, Tail: 2 } as const
export type EdgePosition = (typeof EdgePosition)[keyof typeof EdgePosition]

/** Font style codes used in the font string (`face;size;style`). */
export const FontStyle = { Normal: 0, Bold: 1, Italic: 2, BoldItalic: 3 } as const
export type FontStyle = (typeof FontStyle)[keyof typeof FontStyle]

/**
 * A parsed font (see `parseFont` / `serializeFont`). Same type as the model's `View.font` value;
 * `style` holds a `FontStyle` code.
 */
export type Font = ModelFont

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const COLORS = {
  line: '#000000',
  fill: '#ffffff',
  font: '#000000',
  background: '#ffffff',
  /** Fill of hollow arrowheads and edge label boxes. */
  edgeBackground: '#ffffff',
  grid: '#e0e0e0',
  selection: '#4f99ff',
  shadow: '#c0c0c0'
} as const

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const DEFAULT_FONT_FACE = 'Arial'
const DEFAULT_FONT_SIZE = 13
export const DEFAULT_FONT: Readonly<Font> = Object.freeze({
  face: DEFAULT_FONT_FACE,
  size: DEFAULT_FONT_SIZE,
  style: FontStyle.Normal
})
/** Font sizes offered in the UI. */
export const FONT_SIZES: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 16, 20, 24, 28, 32]
/** Namespace text "(from X)" is drawn at this fraction of the font size. */
export const NAMESPACE_FONT_SCALE = 0.9
/** Generic family appended to CSS font strings as a fallback. */
export const GENERIC_FONT_FAMILY = 'sans-serif'

// ---------------------------------------------------------------------------
// Lines and dashes
// ---------------------------------------------------------------------------

/** Partition (swimlane) header and lane borders. */
export const SWIMLANE_LINE_WIDTH = 2

/** Dash patterns as [on, off, ...] lengths; an empty array means solid. */
export const DASH = {
  solid: [] as readonly number[],
  /** "dot" mode: every dashed UML line (dependency, realization, include/extend, reply, note links). */
  dot: [3, 3] as readonly number[],
  /** "dash" mode (available but unused by the MVP notation). */
  dash: [6, 4] as readonly number[],
  /** Separators between combined-fragment operands. */
  operandSeparator: [10, 3] as readonly number[],
  /** Rubber bands and selected edges. */
  selection: [3, 3] as readonly number[]
} as const

export type LineDash = 'solid' | 'dot' | 'dash'

/** Dash array for a named line dash. */
export function dashArray(dash: LineDash): readonly number[] {
  return DASH[dash]
}

// ---------------------------------------------------------------------------
// Shadow
// ---------------------------------------------------------------------------

export const SHADOW = {
  color: COLORS.shadow,
  alpha: 0.2,
  offsetX: 7,
  offsetY: 7,
  blur: 0
} as const

// ---------------------------------------------------------------------------
// Spacing (spec 03 §2.3, §4)
// ---------------------------------------------------------------------------

export const SPACING = {
  compartmentPaddingLeft: 5,
  compartmentPaddingRight: 5,
  compartmentPaddingTop: 5,
  compartmentPaddingBottom: 5,
  /** Gap between items in a compartment (and above the name in a name compartment). */
  compartmentItemGap: 2,
  /** Height of an empty attribute/operation compartment. */
  emptyCompartmentHeight: 10,
  /** Gap unit between a frame's type keyword and its name (name starts 2 × gap after it). */
  frameLabelGap: 3,
  /** Stereotype decoration icon size and its inset from the top-right corner. */
  decorationIconSize: 24,
  decorationIconInset: 5,
  /** Minimum icon size for iconic stereotype display. */
  minIconSize: 24,
  noteFold: 10,
  /** Notes: extra line spacing (each wrapped line is fontSize + 2 tall). */
  noteLineGap: 2,
  notePadding: 5,
  packageTabHeight: 15,
  /** Package tab width as a fraction of the node width. */
  packageTabWidthRatio: 2 / 5,
  /** Active class side bars sit this far inside the left and right edges. */
  activeClassBarInset: 3,
  /** Rounded action/state corner radius. */
  actionCornerRadius: 10,
  /** Rounded-rectilinear edge corner radius. */
  roundedEdgeRadius: 8,
  /** Fork/join bar thickness and corner radius. */
  forkJoinThickness: 6,
  forkJoinCornerRadius: 3,
  /** Activity final: inner filled circle inset. */
  activityFinalInset: 5,
  /** Partition header: name padding above and below. */
  partitionHeaderPadding: 4,
  /** Lifeline header height and fixed top y. */
  lifelineHeaderHeight: 40,
  lifelineTop: 40,
  /** Lifeline dashed line extends this far below the lowest message. */
  lifelineBottomMargin: 15,
  activationWidth: 14,
  activationNestingShift: 7,
  /** Self-message: out to the right, then down. */
  selfMessageWidth: 30,
  selfMessageHeight: 20,
  /** Combined fragment guard position, relative to the operand's top-left. */
  guardOffsetX: 20,
  guardOffsetY: 15,
  /** Container auto-extension margin (base engine; no UML view enables it). */
  containerMargin: 5
} as const

// ---------------------------------------------------------------------------
// Minimum sizes (spec 03 §2.4)
// ---------------------------------------------------------------------------

export type MinSizeKind =
  | 'package'
  | 'useCase'
  | 'actor'
  | 'action'
  | 'initialNode'
  | 'activityFinal'
  | 'flowFinal'
  | 'decision'
  | 'forkJoinHorizontal'
  | 'forkJoinVertical'
  | 'pin'
  | 'partitionVertical'
  | 'partitionHorizontal'
  | 'lifelineHeader'
  | 'activation'
  | 'frame'
  | 'interactionOperand'
  | 'messageEndpoint'
  | 'note'
  | 'text'
  | 'interfaceIcon'

export const MIN_SIZES: Readonly<Record<MinSizeKind, Readonly<{ width: number; height: number }>>> = {
  package: { width: 50, height: 40 },
  useCase: { width: 70, height: 32 },
  actor: { width: 26, height: 55 },
  action: { width: 60, height: 40 },
  initialNode: { width: 20, height: 20 },
  activityFinal: { width: 26, height: 26 },
  flowFinal: { width: 26, height: 26 },
  decision: { width: 23, height: 19 },
  forkJoinHorizontal: { width: 70, height: 6 },
  forkJoinVertical: { width: 6, height: 70 },
  pin: { width: 18, height: 18 },
  partitionVertical: { width: 50, height: 300 },
  partitionHorizontal: { width: 300, height: 50 },
  lifelineHeader: { width: 30, height: 40 },
  activation: { width: 14, height: 25 },
  frame: { width: 80, height: 30 },
  interactionOperand: { width: 80, height: 30 },
  messageEndpoint: { width: 15, height: 15 },
  note: { width: 10, height: 10 },
  text: { width: 10, height: 10 },
  interfaceIcon: { width: 24, height: 24 }
}

/** Minimum length of a lifeline's dashed part. */
export const LIFELINE_MIN_LINE_LENGTH = 50
/** Actor icon aspect ratio (width : height). */
export const ACTOR_ASPECT = 26 / 55
/** Use case ellipse iconic aspect ratio (width : height). */
export const USE_CASE_ASPECT = 70 / 32

// ---------------------------------------------------------------------------
// Z order (spec 03 §1.4)
// ---------------------------------------------------------------------------

export const Z_INDEX = {
  frame: -1,
  default: 0,
  message: 1,
  combinedFragment: 2
} as const

// ---------------------------------------------------------------------------
// Selection and editor overlay (screen px; do not scale with zoom)
// ---------------------------------------------------------------------------

export const SELECTION = {
  color: COLORS.selection,
  /** Resize / vertex handle size in screen px. */
  handleSize: 8,
  handleFill: '#ffffff',
  handleStrokeWidth: 1,
  /** Translucent bands outside a selected node. */
  bandWidth: 7,
  bandAlpha: 0.1,
  /** Rounded-rectangle highlight for non-resizable nodes. */
  fixedNodeRadius: 2,
  /** Selected edges and rubber bands. */
  dash: DASH.selection,
  /** Circles drawn at both ends of an edge being created. */
  createEdgeEndRadius: 5
} as const

/** Hit-test tolerance for edges and edge vertices, in diagram units. */
export const HIT_TOLERANCE = 5
/** Oblique edges: interior vertices within this distance of the neighbour line are removed. */
export const OBLIQUE_SIMPLIFY_TOLERANCE = 5

// ---------------------------------------------------------------------------
// Grid and zoom
// ---------------------------------------------------------------------------

export const GRID = {
  /** Snap grid size (preference default). */
  size: 8,
  /** Range of the grid size preference (diagram units). */
  min: 2,
  max: 64,
  /** Grid lines are drawn every `lineEvery × size` units, but never closer than `minLineSpacing`. */
  lineEvery: 2,
  minLineSpacing: 8,
  color: COLORS.grid,
  show: true,
  snap: true
} as const

export const ZOOM = {
  min: 0.1,
  max: 3.0,
  step: 0.1,
  default: 1.0
} as const

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const EXPORT = {
  /** The union of all view boxes is expanded by this much on every side. */
  margin: 10,
  /** Default PNG scale factor (OpenUML recommendation). */
  defaultPngScale: 2
} as const

