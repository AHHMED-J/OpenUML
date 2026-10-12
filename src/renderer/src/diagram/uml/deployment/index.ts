/** Deployment diagram notation (spec 22): nodes as 3D boxes, deployment and communication path edges. */
import { registerEdgeNotation, registerNodeNotation } from '../../render/registry'
import { communicationPathNotation, deploymentNotation } from './edges'
import { layoutNodeBox, nodeContainer } from './layout'
import { NodeBox } from './render'

export * from './layout'
export { deploymentNotation, communicationPathNotation } from './edges'

export function registerDeploymentNotations(): void {
  registerNodeNotation('UMLNodeView', { layout: layoutNodeBox, Render: NodeBox, container: nodeContainer })
  registerEdgeNotation('UMLDeploymentView', deploymentNotation)
  registerEdgeNotation('UMLCommunicationPathView', communicationPathNotation)
}
