/**
 * Information flow notation (spec 30): information items are classifier boxes with the fixed
 * «information» keyword; information flows are dashed «flow» edges.
 */
import { registerEdgeNotation, registerNodeNotation } from '../../render/registry'
import { layoutClassifier } from '../class/layout'
import { ClassifierNode } from '../class/render'
import { informationFlowNotation } from './edges'

export * from './edges'

export function registerInfoflowNotations(): void {
  registerNodeNotation('UMLInformationItemView', { layout: layoutClassifier, Render: ClassifierNode })
  registerEdgeNotation('UMLInformationFlowView', informationFlowNotation)
}
