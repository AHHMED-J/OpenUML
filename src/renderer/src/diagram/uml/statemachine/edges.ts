/**
 * Transition edge notation (spec 20 §5): solid line, no tail decoration, stick arrow head. The
 * middle label holds the transition string (`trigger [guard] / effect`, prefixed by `name : `
 * when the transition is named). Internal transitions are drawn inside their state, never as edges.
 */
import type { EdgeView } from '../../../model'
import { relationshipNotation } from '../../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../../layout/edges'
import { nameEditText } from '../../layout/helpers'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { transitionLabel, transitionText } from './strings'

/** The name label spec of a transition: edits the `trigger [guard] / effect` string. */
export function transitionLabelSpec(edge: EdgeView): EdgeLabelSpec {
  const model = edge.model
  const text = transitionLabel(model)
  if (!model) return { field: 'nameLabel', defaults: 'name', text }
  const hasName = typeof model['name'] === 'string' && model['name'].trim() !== ''
  return {
    field: 'nameLabel',
    defaults: 'name',
    text,
    // A named transition without a string edits its name; otherwise the string is edited.
    edit: hasName && transitionText(model) === '' ? { kind: 'name', elementId: model._id } : { kind: 'custom', elementId: model._id, syntax: 'transition' },
    editText: hasName && transitionText(model) === '' ? nameEditText(model) : transitionText(model)
  }
}

export const transitionNotation: EdgeNotation = {
  connectKind: 'Transition',
  layout(edge, ctx) {
    const n = relationshipNotation('controlFlow')
    const labels = standardEdgeLabels(edge)
    labels[0] = transitionLabelSpec(edge)
    const base = buildEdgeLayout(edge, ctx, { dash: n.dash, tailEnd: n.tail, headEnd: n.head, labels })
    const model = edge.model
    return model ? { ...base, fallbackEdit: { target: { kind: 'custom', elementId: model._id, syntax: 'transition' }, text: transitionText(model) } } : base
  }
}
