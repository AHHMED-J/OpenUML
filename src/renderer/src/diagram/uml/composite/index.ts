/**
 * Composite structure notation (spec 25): ports, parts, collaborations, collaboration uses,
 * connectors and role bindings. Classifier-like views host ports and parts.
 */
import { registerEdgeNotation, registerNodeNotation } from '../../render/registry'
import { registerStructureHosts, structureHostContainer } from './containers'
import { connectorNotation, roleBindingNotation } from './edges'
import { layoutCollaboration, layoutCollaborationUse, layoutPart, layoutPort } from './layout'
import { CollaborationNode, PartNode, PortNode } from './render'

export * from './containers'
export * from './edges'
export * from './layout'
export * from './strings'

export function registerCompositeNotations(): void {
  registerNodeNotation('UMLPortView', { layout: layoutPort, Render: PortNode })
  registerNodeNotation('UMLPartView', { layout: layoutPart, Render: PartNode, container: structureHostContainer })
  registerNodeNotation('UMLCollaborationView', { layout: layoutCollaboration, Render: CollaborationNode })
  registerNodeNotation('UMLCollaborationUseView', { layout: layoutCollaborationUse, Render: CollaborationNode })
  registerEdgeNotation('UMLConnectorView', connectorNotation)
  registerEdgeNotation('UMLRoleBindingView', roleBindingNotation)
  registerStructureHosts()
}
