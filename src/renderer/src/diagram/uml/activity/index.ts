/**
 * Activity diagram notation: actions (opaque, call behavior, send signal, accept event, time
 * event), object nodes, control nodes (one view type drawn by model type), pins, partitions
 * (swimlanes, visual containers) and control/object flows.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import { ACTIVITY_EDGE_NOTATIONS } from './edges'
import { layoutAction, layoutControlNode, layoutObjectNode, layoutPin, layoutSwimlane } from './layout'
import { ActionNode, ControlNode, ObjectNode, PinNode, SwimlaneNode } from './render'

export * from './layout'
export { flowLabelText, flowNameLabel } from './edges'

/**
 * Swimlanes visually contain activity nodes (actions, object nodes, control nodes) and notes.
 * Partition membership is visual only (spec 01 §13): the models stay in `activity.nodes`.
 */
export const swimlaneContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isKindOf(childModel, 'UMLActivityNode')
  },
  ownerFor() {
    return null
  }
}

/**
 * An action view keeps its own pins: dropping a pin back onto its action leaves it contained
 * (pins are laid out on the action's border either way).
 */
export const actionContainer: ContainerBehavior = {
  accepts(container: View, childModel: Elem | null): boolean {
    return isKindOf(childModel, 'UMLPin') && childModel !== null && container.model != null && childModel._parent === container.model
  },
  ownerFor() {
    return null
  }
}

export function registerActivityNotations(): void {
  registerNodeNotation('UMLActionView', { layout: layoutAction, Render: ActionNode, container: actionContainer })
  registerNodeNotation('UMLObjectNodeView', { layout: layoutObjectNode, Render: ObjectNode })
  registerNodeNotation('UMLControlNodeView', { layout: layoutControlNode, Render: ControlNode })
  registerNodeNotation('UMLInputPinView', { layout: layoutPin, Render: PinNode })
  registerNodeNotation('UMLOutputPinView', { layout: layoutPin, Render: PinNode })
  registerNodeNotation('UMLSwimlaneView', { layout: layoutSwimlane, Render: SwimlaneNode, container: swimlaneContainer })
  for (const [type, notation] of ACTIVITY_EDGE_NOTATIONS) registerEdgeNotation(type, notation)
}
