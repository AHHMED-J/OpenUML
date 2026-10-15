/**
 * Title blocks follow the diagram tree: editing the author, date or status of an IDEF0 diagram
 * (inline in the title block, in the Property Editor or with Format > IDEF0 > Status) also changes
 * the descendant diagrams that still follow it, in the same undo step. A descendant follows when
 * its value equals the edited diagram's old value or is empty; a value changed by hand is kept,
 * and so is everything below it (that sheet now leads its own subtree). Nothing flows upward and
 * the sheet number never propagates. New child diagrams inherit these fields when created
 * (`inheritedTitleBlock`).
 */
import type { ModelEngine, OperationBuilder } from '../../commands'
import { INHERITED_TITLE_FIELDS, childDiagramsOf, type Elem, type Repository } from '../../model'

const INHERITED: readonly string[] = INHERITED_TITLE_FIELDS

function isIdef0Diagram(el: Elem | undefined): el is Elem {
  return !!el && el._type === 'IDEF0Diagram'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Transaction hook: for every author/date/status edit of an IDEF0 diagram recorded in `b`, gives
 * the new value to the descendants that still had the old value (or none).
 */
export function propagateTitleBlock(b: OperationBuilder, repository: Repository): void {
  // The value each edited field had before the operation (its first recorded step).
  const edits = new Map<Elem, Map<string, string>>()
  for (const step of b.steps) {
    if (step.op !== 'a' || !INHERITED.includes(step.field)) continue
    const diagram = repository.get(step.id)
    if (!isIdef0Diagram(diagram)) continue
    const fields = edits.get(diagram) ?? new Map<string, string>()
    if (!fields.has(step.field)) fields.set(step.field, text(step.old))
    edits.set(diagram, fields)
  }
  for (const [diagram, fields] of edits) {
    if (!repository.contains(diagram)) continue
    for (const [field, old] of fields) {
      const value = text(diagram[field])
      if (value === old) continue
      const seen = new Set<Elem>([diagram])
      const queue = childDiagramsOf(diagram)
      while (queue.length > 0) {
        const child = queue.shift() as Elem
        if (seen.has(child)) continue
        seen.add(child)
        // A descendant edited in the same operation decides for its own subtree.
        if (edits.get(child)?.has(field)) continue
        const current = text(child[field])
        if (current !== value && current !== old && current !== '') continue
        if (current !== value) b.set(child, field, value)
        queue.push(...childDiagramsOf(child))
      }
    }
  }
}

/** The diagrams below `diagram` in the decomposition tree (children, grandchildren, ...). */
export function descendantDiagramsOf(diagram: Elem): Elem[] {
  const out: Elem[] = []
  const queue = childDiagramsOf(diagram)
  while (queue.length > 0) {
    const d = queue.shift() as Elem
    if (out.includes(d) || d === diagram) continue
    out.push(d)
    queue.push(...childDiagramsOf(d))
  }
  return out
}

/**
 * Copies the author, date and status of `diagram` to all its descendant diagrams, overriding
 * values set by hand (one undo step). Returns the number of diagrams changed.
 */
export function applyTitleBlockToChildren(engine: ModelEngine, diagram: Elem): number {
  const targets = descendantDiagramsOf(diagram).filter((d) => INHERITED.some((f) => d[f] !== diagram[f]))
  if (targets.length === 0) return 0
  engine.transact('Apply Title Block to Child Diagrams', (b) => {
    for (const d of targets) for (const field of INHERITED) b.set(d, field, diagram[field])
  })
  return targets.length
}
