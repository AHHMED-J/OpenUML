/** Deployment edges (spec 22 §5): the dashed «deploy» arrow and the communication path. */
import { relationshipNotation } from '../../core'
import { buildEdgeLayout } from '../../layout/edges'
import { standardEdgeLabels } from '../../render/generic'
import type { EdgeNotation } from '../../render/registry'
import { CLASS_EDGE_NOTATIONS } from '../class/edges'

/** Dependency look (dashed, open arrow) with a «deploy» label always shown in the middle. */
export const deploymentNotation: EdgeNotation = {
  connectKind: 'Deployment',
  layout(edge, ctx) {
    const n = relationshipNotation('dependency')
    return buildEdgeLayout(edge, ctx, {
      dash: n.dash,
      tailEnd: n.tail,
      headEnd: n.head,
      labels: standardEdgeLabels(edge, 'deploy')
    })
  }
}

const association = CLASS_EDGE_NOTATIONS.find(([type]) => type === 'UMLAssociationView')?.[1]

/** A communication path draws exactly like a plain association. */
export const communicationPathNotation: EdgeNotation = {
  connectKind: 'CommunicationPath',
  layout: (edge, ctx) => (association as EdgeNotation).layout(edge, ctx)
}
