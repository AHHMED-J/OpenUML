/**
 * Communication diagram notation (spec 26): lifelines, connectors (the composite-structure
 * connector edge) and the message arrows riding beside them. Messages reuse the sequence
 * message quick-edit syntax; the frame is the generic `UMLFrameView`.
 */
import { registerNodeNotation } from '../../render/registry'
import { registerSequenceQuickEdit } from '../sequence/quickEdit'
import { layoutCommLifeline, layoutCommMessage } from './layout'
import { CommLifelineNode, CommMessageNode } from './render'

export * from './layout'

export function registerCommunicationNotations(): void {
  registerSequenceQuickEdit()
  registerNodeNotation('UMLCommLifelineView', { layout: layoutCommLifeline, Render: CommLifelineNode })
  registerNodeNotation('UMLCommMessageView', { layout: layoutCommMessage, Render: CommMessageNode })
}
