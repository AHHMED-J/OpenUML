/**
 * Title block fields shared down an IDEF0 diagram tree: a new child diagram takes the author,
 * date and status of the diagram drawing its parent box and the next free sheet number; edits of
 * those fields flow down to the descendants that still follow (see `diagram/idef0/titleBlock.ts`).
 */
import { isKindOf } from './metamodel'
import { functionsOfDiagram, modelOf } from './idef0-numbering'
import type { Elem } from './types'
import { listField } from './fields'

/** Title block fields a child diagram inherits from its parent diagram (the sheet number is per sheet). */
export const INHERITED_TITLE_FIELDS = ['author', 'date', 'status'] as const
export type InheritedTitleField = (typeof INHERITED_TITLE_FIELDS)[number]

/**
 * The sheet number after `parent` among `existing`, keeping its format: the numeric suffix of
 * `parent` gives the prefix ("JD-001" -> "JD-"); the result is one more than the largest suffix of
 * the numbers sharing that prefix, zero-padded to the parent's width ("JD-001" -> "JD-002",
 * "009" -> "010", "1" -> "2"). Empty when `parent` is empty or has no numeric suffix.
 */
export function nextSheetNumber(parent: string, existing: readonly string[]): string {
  const match = /^(.*?)(\d+)$/.exec(parent.trim())
  if (!match) return ''
  const prefix = match[1] as string
  const digits = match[2] as string
  let max = Number(digits)
  for (const number of existing) {
    const other = /^(.*?)(\d+)$/.exec(number.trim())
    if (other && other[1] === prefix) max = Math.max(max, Number(other[2]))
  }
  return `${prefix}${String(max + 1).padStart(digits.length, '0')}`
}

/** The diagrams detailing the boxes of `diagram` (A0 for the A-0 context diagram). */
export function childDiagramsOf(diagram: Elem): Elem[] {
  return functionsOfDiagram(diagram)
    .map((fn) => fn['childDiagram'] as Elem | null)
    .filter((d): d is Elem => !!d && isKindOf(d, 'IDEF0Diagram'))
}

/** Every IDEF0 diagram of the model `el` belongs to (A-0 and all decompositions). */
export function diagramsOfIdef0Model(el: Elem | null | undefined): Elem[] {
  const model = modelOf(el)
  if (!model) return []
  const out: Elem[] = []
  const visit = (owner: Elem): void => {
    for (const child of listField(owner, 'ownedElements')) if (isKindOf(child, 'IDEF0Diagram')) out.push(child)
    for (const fn of listField(owner, 'functions')) visit(fn)
    for (const child of listField(owner, 'ownedElements')) if (isKindOf(child, 'IDEF0Function')) visit(child)
  }
  visit(model)
  return out
}

/**
 * The title block a new child diagram detailing a box of `parent` starts with: the parent's
 * author, date and status, and the next free sheet number of the model (see `nextSheetNumber`).
 */
export function inheritedTitleBlock(parent: Elem | null): Record<string, string> {
  if (!parent || !isKindOf(parent, 'IDEF0Diagram')) return {}
  const values: Record<string, string> = {}
  for (const field of INHERITED_TITLE_FIELDS) {
    const value = parent[field]
    if (typeof value === 'string') values[field] = value
  }
  const numbers = diagramsOfIdef0Model(parent).map((d) => (d['number'] as string | undefined) ?? '')
  values['number'] = nextSheetNumber((parent['number'] as string | undefined) ?? '', numbers)
  return values
}
