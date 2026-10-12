/**
 * Composite-structure edges (spec 25 §5): connectors are plain association-style lines (the
 * kind has no visual effect; the middle label adds `: ConnectorType` when typed); role bindings
 * are dashed with a stick arrow head and the role name at the head end.
 */
import { relationshipNotation } from '../../core'
import { buildEdgeLayout } from '../../layout/edges'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { undirectedEdgeNotation } from '../object/edges'
import { connectorLabelText } from './strings'

export const connectorNotation: EdgeNotation = undirectedEdgeNotation(undefined, (edge, model) => connectorLabelText(model, edge['showType'] !== false))

export const roleBindingNotation: EdgeNotation = {
  connectKind: 'RoleBinding',
  layout(edge, ctx) {
    const model = edge.model
    const n = relationshipNotation('dependency')
    const roleName = typeof model?.['roleName'] === 'string' ? (model['roleName'] as string) : ''
    return buildEdgeLayout(edge, ctx, {
      dash: 'dot',
      tailEnd: n.tail,
      headEnd: { style: 'stickArrow' },
      labels: [
        ...standardEdgeLabels(edge),
        {
          field: 'roleNameLabel',
          defaults: 'headRoleName',
          text: roleName,
          ...(model ? { edit: { kind: 'field' as const, elementId: model._id, field: 'roleName' }, editText: roleName } : {})
        }
      ]
    })
  }
}
