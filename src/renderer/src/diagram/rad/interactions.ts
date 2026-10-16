/**
 * Interactions follow from the lines drawn (RAD): a line between activities (or interactions) of
 * two different roles is an interaction link, and its ends become interactions; a line within one
 * role stays a state line. When an interaction loses its last link (and has no external party) it
 * turns back into an activity. The model keeps both types, so files are unchanged.
 */
import { retypeElement, type OperationBuilder } from '../../commands'
import { isKindOf, listField, type Elem, type Repository, type View } from '../../model'
import { createEdgeBetween, type DiagramEnv, type ToolSpec } from '../editor/actions'
import type { DiagramLayout } from '../layout/types'

function roleOf(el: Elem | null | undefined): Elem | null {
  return el && isKindOf(el._parent, 'RADRole') ? el._parent : null
}

/** Activities and interactions: the symbols an interaction link may join. */
function isSquare(el: Elem | null | undefined): el is Elem {
  return !!el && isKindOf(el, 'RADActivity')
}

/**
 * `createEdge` hook of RAD diagrams: the line tools (State Line and Interaction Link) joining
 * squares of two different roles create an interaction link, first turning plain activities
 * into interactions (one undo step). `undefined` leaves every other case to the default (a state
 * line within a role, or a refusal).
 */
export function connectRoles(env: DiagramEnv, layout: DiagramLayout, tool: ToolSpec, tailId: string | null, headId: string | null, press: { x: number; y: number }): string | null | undefined {
  if (tool.kind !== 'RADStateLine' && tool.kind !== 'RADInteractionLink') return undefined
  if (!tailId || !headId) return undefined
  const repo = env.engine.repository
  const tail = repo.get(tailId) as View | undefined
  const head = repo.get(headId) as View | undefined
  const a = tail?.model
  const b = head?.model
  if (!isSquare(a) || !isSquare(b)) return undefined
  const ra = roleOf(a)
  const rb = roleOf(b)
  if (!ra || !rb || ra === rb) return undefined
  try {
    return env.engine.transact('Create Interaction', (builder) => {
      for (const model of [a, b]) if (model._type === 'RADActivity') retypeElement(builder, model, 'RADInteraction')
      const id = createEdgeBetween(env, layout, { kind: 'RADInteractionLink' }, tailId, headId, press)
      // Already linked: nothing is created and the activities stay as they were.
      if (!id) throw new Error('not linked')
      return id
    })
  } catch {
    return null
  }
}

function linked(el: Elem): boolean {
  const process = roleOf(el)?._parent
  return listField(process, 'interactions').some((l) => l['source'] === el || l['target'] === el)
}

function refId(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { $ref?: unknown }).$ref === 'string' ? (value as { $ref: string }).$ref : null
}

/**
 * Transaction hook: the interactions whose interaction link was removed in this operation and that
 * have no other link and no external party turn back into activities, in the same undo step.
 */
export function revertUnlinkedInteractions(b: OperationBuilder, repository: Repository): void {
  const ends = new Set<string>()
  for (const step of b.steps) {
    if (step.op !== 'R' || step.json['_type'] !== 'RADInteractionLink') continue
    for (const end of [refId(step.json['source']), refId(step.json['target'])]) if (end) ends.add(end)
  }
  for (const id of ends) {
    const el = repository.get(id)
    if (!el || el._type !== 'RADInteraction' || !repository.contains(el)) continue
    if (typeof el['externalParty'] === 'string' && el['externalParty'].trim() !== '') continue
    if (!linked(el)) retypeElement(b, el, 'RADActivity')
  }
}
