/**
 * Coloring an IDEF0 arrow from the Style editor colors one logical arrow: the arrow, every branch
 * hanging off it, and the arrows linked to them on the parent and child diagrams (boundary ports /
 * ICOM codes), in one undo step. A single branch can then be given its own color.
 */
import type { ModelEngine } from '../../commands'
import { isCssColor } from '../../format/cssColor'
import type { Elem, View } from '../../model'
import { isArrowView } from './colors'
import { linkedArrows } from './propagation'

/** Fields of an arrow view the Style editor colors as one logical arrow. */
const FLOW_COLOR_FIELDS = new Set(['lineColor', 'fontColor'])

function list(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

/**
 * The arrows forming one logical arrow with `arrow`: itself, its branches (and theirs), and the
 * arrows linked to any of them on the other levels, with their own branches.
 */
export function arrowFlow(arrow: Elem): Elem[] {
  const seen = new Set<Elem>([arrow])
  const queue = [arrow]
  while (queue.length > 0 && seen.size < 1024) {
    const a = queue.shift() as Elem
    const branches = list(a._parent, 'arrows').filter((b) => b['source'] === a || b['target'] === a)
    for (const next of [...branches, ...linkedArrows(a)]) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return [...seen]
}

/** Whether `field` of `views` is colored as a whole arrow flow (see `colorIdef0Arrows`). */
export function isFlowColorEdit(views: readonly View[], field: string): boolean {
  return FLOW_COLOR_FIELDS.has(field) && views.some((v) => isArrowView(v) && v.model)
}

/**
 * Sets `field` (`lineColor` or `fontColor`) to `color` on the selected views; for IDEF0 arrow views
 * also on the views of their whole flow (`arrowFlow`) on every diagram, in one undo step. Invalid
 * colors are refused.
 */
export function colorIdef0Arrows(engine: ModelEngine, views: readonly View[], field: string, color: string, label = 'Change Color'): void {
  if (!FLOW_COLOR_FIELDS.has(field)) throw new Error(`Not a color field: ${field}`)
  if (!isCssColor(color)) throw new Error(`Not a color: ${color}`)
  const targets = new Set<View>(views)
  for (const view of views) {
    if (!isArrowView(view) || !view.model) continue
    for (const arrow of arrowFlow(view.model as Elem)) {
      for (const v of engine.repository.viewsOf(arrow)) if (isArrowView(v)) targets.add(v)
    }
  }
  engine.transact(label, (b) => {
    for (const v of targets) if (v[field] !== color) b.set(v, field, color)
  })
}
