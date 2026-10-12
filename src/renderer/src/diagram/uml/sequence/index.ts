/**
 * Sequence diagram notation (spec 03 §4.4): lifelines with their dashed lines, activation bars
 * and destruction X; self-routing horizontal messages with sequence numbers; combined fragments
 * with resizable operands; lost/found endpoints and gates; interaction uses, continuations and
 * state invariants. The diagram frame is the generic `UMLFrameView` notation.
 *
 * Editor hooks used: `moveAxis` (lifelines move horizontally), `hitAreas` (fragments hit on their
 * border, label, guards and dividers; lifelines on header and line), `dividers` (operand heights),
 * `dragAxis` + `labelPoints` on messages, and the `lifeline` / `message` / `guard` quick-edit
 * syntaxes.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import {
  layoutCombinedFragment,
  layoutInteractionUse,
  layoutLifeline,
  layoutMessageEndpoint,
  layoutOrphanSubView,
  layoutRoundedLabelBox
} from './layout'
import { messageNotationEntry } from './messages'
import { registerSequenceQuickEdit } from './quickEdit'
import {
  CombinedFragmentNode,
  InteractionUseNode,
  LifelineNode,
  MessageEndpointNode,
  OrphanSubViewNode,
  RoundedLabelBoxNode
} from './render'

export * from './analysis'
export * from './layout'
export * from './messages'
export * from './strings'
export { applyLifeline, applyMessage } from './quickEdit'

/** Combined fragments visually contain nested fragments and annotations (no model re-parenting). */
export const fragmentContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isKindOf(childModel, 'UMLCombinedFragment')
  },
  ownerFor() {
    return null
  }
}

export function registerSequenceNotations(): void {
  registerSequenceQuickEdit()
  registerNodeNotation('UMLSeqLifelineView', { layout: layoutLifeline, Render: LifelineNode })
  registerNodeNotation('UMLCombinedFragmentView', { layout: layoutCombinedFragment, Render: CombinedFragmentNode, container: fragmentContainer })
  registerNodeNotation('UMLMessageEndpointView', { layout: layoutMessageEndpoint, Render: MessageEndpointNode })
  registerNodeNotation('UMLEndpointView', { layout: layoutMessageEndpoint, Render: MessageEndpointNode })
  registerNodeNotation('UMLGateView', { layout: layoutMessageEndpoint, Render: MessageEndpointNode })
  registerNodeNotation('UMLInteractionUseView', { layout: layoutInteractionUse, Render: InteractionUseNode })
  registerNodeNotation('UMLContinuationView', { layout: layoutRoundedLabelBox, Render: RoundedLabelBoxNode })
  registerNodeNotation('UMLStateInvariantView', { layout: layoutRoundedLabelBox, Render: RoundedLabelBoxNode })
  // Sub-views drawn by their hosts (lifeline, message, fragment); used only if found at the top level.
  registerNodeNotation('UMLLinePartView', { layout: layoutOrphanSubView('line'), Render: OrphanSubViewNode })
  registerNodeNotation('UMLActivationView', { layout: layoutOrphanSubView('activation'), Render: OrphanSubViewNode })
  registerNodeNotation('UMLInteractionOperandView', { layout: layoutOrphanSubView('operand'), Render: OrphanSubViewNode })
  registerEdgeNotation('UMLSeqMessageView', messageNotationEntry)
}
