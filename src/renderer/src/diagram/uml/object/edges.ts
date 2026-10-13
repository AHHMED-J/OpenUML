/**
 * Object-diagram edges (spec 23 §5): links are plain association-style lines (end symbols from
 * the link ends' navigability / aggregation, role names, properties and multiplicities at the
 * ends, name in the middle); a link-object link is a dashed line without ends from the object
 * to the middle of the link.
 */
import type { EdgeView, Elem } from '../../../model'
import { relationshipNotation, type AssociationEndInfo } from '../../core'
import { buildEdgeLayout, type EdgeLabelSpec } from '../../layout/edges'
import { nameEditText, nameOf } from '../../layout/helpers'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { endPropertyText, roleNameText } from '../class/strings'

function endInfo(end: Elem | null | undefined): AssociationEndInfo {
  if (!end) return {}
  return {
    navigable: (end['navigable'] as AssociationEndInfo['navigable']) ?? 'unspecified',
    aggregation: (end['aggregation'] as AssociationEndInfo['aggregation']) ?? 'none'
  }
}

/** Role name / property / multiplicity labels of one end of an association-style edge. */
function endLabelSpecs(edge: EdgeView, end: Elem | null | undefined, side: 'tail' | 'head'): EdgeLabelSpec[] {
  if (!end) return []
  return [
    {
      field: `${side}RoleNameLabel`,
      defaults: `${side}RoleName`,
      text: roleNameText(end, edge['showVisibility'] === true),
      edit: { kind: 'name', elementId: end._id },
      editText: nameEditText(end)
    },
    { field: `${side}PropertyLabel`, defaults: `${side}Property`, text: edge['showProperty'] === false ? '' : endPropertyText(end) },
    {
      field: `${side}MultiplicityLabel`,
      defaults: `${side}Multiplicity`,
      text: edge['showMultiplicity'] === false ? '' : String(end['multiplicity'] ?? ''),
      edit: { kind: 'field', elementId: end._id, field: 'multiplicity' }
    }
  ]
}

/**
 * Association-style edge notation for an undirected relationship with `end1` / `end2` (links
 * and connectors). `nameText` customizes the middle label (default: the model's name).
 */
export function undirectedEdgeNotation(connectKind: EdgeNotation['connectKind'], nameText?: (edge: EdgeView, model: Elem | null) => string): EdgeNotation {
  return {
    connectKind,
    layout(edge, ctx) {
      const model = edge.model
      const end1 = (model?.['end1'] as Elem | null | undefined) ?? null
      const end2 = (model?.['end2'] as Elem | null | undefined) ?? null
      const n = relationshipNotation('association', { end1: endInfo(end1), end2: endInfo(end2) })
      const labels = standardEdgeLabels(edge)
      if (nameText && labels[0]) labels[0] = { ...labels[0], text: nameText(edge, model) }
      return buildEdgeLayout(edge, ctx, {
        dash: n.dash,
        tailEnd: n.tail,
        headEnd: n.head,
        labels: [...labels, ...endLabelSpecs(edge, end1, 'tail'), ...endLabelSpecs(edge, end2, 'head')]
      })
    }
  }
}

export const linkNotation: EdgeNotation = undirectedEdgeNotation('Link', (_edge, model) => nameOf(model))

export const linkObjectLinkNotation: EdgeNotation = {
  layout(edge, ctx) {
    return buildEdgeLayout(edge, ctx, { dash: 'dot', tailEnd: { style: 'flat' }, headEnd: { style: 'flat' }, labels: [] })
  }
}
