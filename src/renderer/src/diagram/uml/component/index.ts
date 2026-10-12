/**
 * Component diagram notation (spec 21): components, artifacts and the component realization edge.
 * Interfaces, dependencies and interface realizations (lollipop / socket) come from the class family.
 */
import { registerEdgeNotation, registerNodeNotation } from '../../render/registry'
import { relationshipEdgeNotation } from '../../render/generic'
import { InterfaceNode, layoutInterface } from './interface'
import { layoutArtifact, layoutComponent } from './layout'
import { ArtifactNode, ComponentNode } from './render'

export * from './layout'
export { lollipopKind, type LollipopKind } from './interface'

export function registerComponentNotations(): void {
  registerNodeNotation('UMLComponentView', { layout: layoutComponent, Render: ComponentNode })
  registerNodeNotation('UMLArtifactView', { layout: layoutArtifact, Render: ArtifactNode })
  registerNodeNotation('UMLInterfaceView', { layout: layoutInterface, Render: InterfaceNode })
  registerEdgeNotation('UMLComponentRealizationView', relationshipEdgeNotation('realization', 'ComponentRealization'))
}
