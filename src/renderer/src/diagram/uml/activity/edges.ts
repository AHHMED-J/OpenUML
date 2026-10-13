/**
 * Activity edges (spec 03 §3.6, §4.5): control flow and object flow are solid lines with an
 * open stick arrow at the head. The name label (middle, 15 above) reads `name [guard] {weight=w}`
 * from the parts present; stereotype and tag labels are the standard relationship labels.
 */
import type { EdgeView, Elem } from '../../../model'
import { relationshipNotation, type RelationshipKind } from '../../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../../layout/edges'
import { nameEditText, nameOf } from '../../layout/helpers'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** `name [guard] {weight=w}` of an activity edge, built from the non-empty parts. */
export function flowLabelText(flow: Elem | null | undefined): string {
  const parts: string[] = []
  const name = nameOf(flow)
  const guard = str(flow?.['guard'])
  const weight = str(flow?.['weight'])
  if (name) parts.push(name)
  if (guard) parts.push(`[${guard}]`)
  if (weight) parts.push(`{weight=${weight}}`)
  return parts.join(' ')
}

/**
 * The name label of a flow. Double-clicking it edits the name; when the flow shows only a guard
 * (the usual case for a decision's outgoing flows) it edits the guard instead.
 */
function flowNameLabel(edge: EdgeView): EdgeLabelSpec {
  const model = edge.model
  const text = flowLabelText(model)
  if (!model) return { field: 'nameLabel', defaults: 'name', text }
  const guardOnly = !nameOf(model) && str(model['guard']) !== ''
  return guardOnly
    ? { field: 'nameLabel', defaults: 'name', text, edit: { kind: 'field', elementId: model._id, field: 'guard' }, editText: str(model['guard']) }
    : { field: 'nameLabel', defaults: 'name', text, edit: { kind: 'name', elementId: model._id }, editText: nameEditText(model) }
}

function flowNotation(kind: RelationshipKind, connectKind: EdgeNotation['connectKind']): EdgeNotation {
  return {
    connectKind,
    layout(edge, ctx) {
      const n = relationshipNotation(kind)
      const labels = standardEdgeLabels(edge)
      labels[0] = flowNameLabel(edge)
      return buildEdgeLayout(edge, ctx, { dash: n.dash, tailEnd: n.tail, headEnd: n.head, labels })
    }
  }
}

export const ACTIVITY_EDGE_NOTATIONS: ReadonlyArray<readonly [string, EdgeNotation]> = [
  ['UMLControlFlowView', flowNotation('controlFlow', 'ControlFlow')],
  ['UMLObjectFlowView', flowNotation('objectFlow', 'ObjectFlow')]
]
