/**
 * Colors of IDEF0 arrows. A fork or join is one logical arrow: a branch without a color of its own
 * is drawn in its trunk's color, and its label follows the line color unless a text color is set.
 * The Style editor colors the whole flow at once (`colorIdef0Arrows` in `colorFlow.ts`).
 *
 * With the model setting `colorArrowsByRole` arrows without a manual color are drawn in their
 * role's color (input blue, control amber, output green, mechanism purple, call gray). Manual
 * colors always win. Every color read from a file goes through `isCssColor`.
 */
import { isCssColor } from '../../format/cssColor'
import { isKindOf, modelOf, roleOf, type Elem, type Idef0Role, type View } from '../../model'
import { COLORS } from '../core'

/**
 * Role colors: the hues of the explorer's role tokens (`--role-*` in the light theme), as plain hex
 * so they work in SVG attributes and exported files; the canvas is white in both themes.
 */
export const IDEF0_ROLE_COLORS: Readonly<Record<Idef0Role, string>> = {
  input: '#1f5fbf',
  control: '#9a6700',
  output: '#1a7f37',
  mechanism: '#7c4dcc',
  call: '#656d76'
}

const DEPTH = 64

/** Whether `v` is an IDEF0 arrow view. */
export function isArrowView(v: unknown): v is View {
  return !!v && (v as View)._type === 'IDEF0ArrowView'
}

/** A valid color set by the user (the default black counts as "not set"). */
function manual(value: unknown, fallback: string): string | null {
  return isCssColor(value) && value.toLowerCase() !== fallback ? value : null
}

/** The trunk view a branch view leaves or joins, or null. */
function trunkView(view: View): View | null {
  const tail = view['tail'] as View | null | undefined
  const head = view['head'] as View | null | undefined
  return isArrowView(tail) ? tail : isArrowView(head) ? head : null
}

/** Whether the model of `arrow` asks for role colors. */
function colorsByRole(arrow: Elem | null | undefined): boolean {
  return modelOf(arrow)?.['colorArrowsByRole'] === true
}

/** Line color of an arrow view: its own, else its trunk's, else its role color (when enabled), else black. */
export function arrowLineColor(view: View, depth = 0): string {
  const own = manual(view.lineColor, COLORS.line)
  if (own) return own
  const trunk = depth < DEPTH ? trunkView(view) : null
  if (trunk) return arrowLineColor(trunk, depth + 1)
  const arrow = view.model as Elem | null
  if (arrow && isKindOf(arrow, 'IDEF0Arrow') && colorsByRole(arrow)) return IDEF0_ROLE_COLORS[roleOf(arrow)]
  return COLORS.line
}

/** Text color of an arrow view's label: its own, else the nearest trunk's text color, else its line color. */
export function arrowTextColor(view: View): string {
  let current: View | null = view
  for (let depth = 0; current && depth < DEPTH; depth++, current = trunkView(current)) {
    const own = manual(current.fontColor, COLORS.font)
    if (own) return own
  }
  return arrowLineColor(view)
}

/** Label color of one label view of an arrow: the label's own text color, else the arrow's. */
export function arrowLabelColor(view: View, label: View | null | undefined): string {
  return (label && manual(label.fontColor, COLORS.font)) || arrowTextColor(view)
}
