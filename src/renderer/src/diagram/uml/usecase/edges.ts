/**
 * Use case relationship edges (spec 03 §3.6, §4.3): include and extend are dotted lines with an
 * open (stick) arrowhead at the head and an always-shown «include» / «extend» keyword 30 above
 * the middle. A user stereotype is shown before the keyword; an extend's condition is shown as
 * `[condition]` below the middle (editable inline). Associations, generalizations and
 * dependencies between actors and use cases reuse the class-diagram edge notations.
 */
import type { EdgeView } from '../../../model'
import { guillemets, relationshipNotation } from '../../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../../layout/edges'
import { nameEditText, nameOf, stereotypeName } from '../../layout/helpers'
import { tagString } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'

export type UseCaseRelationshipKind = 'include' | 'extend'

/** Keyword label text: `«include»`, or `«st» «include»` with a (displayed) user stereotype. */
export function keywordText(edge: EdgeView, kind: UseCaseRelationshipKind): string {
  const st = stereotypeName(edge.model)
  const showStereotype = (edge['stereotypeDisplay'] ?? 'label') !== 'none'
  return showStereotype && st ? `${guillemets(st)} ${guillemets(kind)}` : guillemets(kind)
}

/** Name, keyword and property labels of an include/extend edge. */
export function useCaseEdgeLabels(edge: EdgeView, kind: UseCaseRelationshipKind): EdgeLabelSpec[] {
  const model = edge.model
  const name = nameOf(model)
  const tags = edge['showProperty'] === false ? '' : tagString(model)
  const condition = kind === 'extend' && typeof model?.['condition'] === 'string' ? model['condition'].trim() : ''
  const property = [condition ? `[${condition}]` : '', tags].filter(Boolean).join(' ')
  return [
    {
      field: 'nameLabel',
      defaults: 'name',
      text: name,
      ...(model ? { edit: { kind: 'name' as const, elementId: model._id }, editText: nameEditText(model) } : {})
    },
    { field: 'stereotypeLabel', defaults: 'stereotype', text: keywordText(edge, kind) },
    {
      field: 'propertyLabel',
      defaults: 'property',
      text: property,
      ...(model && condition ? { edit: { kind: 'field' as const, elementId: model._id, field: 'condition' }, editText: condition } : {})
    }
  ]
}

function useCaseRelationship(kind: UseCaseRelationshipKind, connectKind: EdgeNotation['connectKind']): EdgeNotation {
  return {
    connectKind,
    layout(edge, ctx) {
      const n = relationshipNotation(kind)
      return buildEdgeLayout(edge, ctx, { dash: n.dash, tailEnd: n.tail, headEnd: n.head, labels: useCaseEdgeLabels(edge, kind) })
    }
  }
}

export const USE_CASE_EDGE_NOTATIONS: ReadonlyArray<readonly [string, EdgeNotation]> = [
  ['UMLIncludeView', useCaseRelationship('include', 'Include')],
  ['UMLExtendView', useCaseRelationship('extend', 'Extend')]
]
