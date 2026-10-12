/**
 * Interaction overview notation (spec 28): reference nodes (`ref` tab) and inline nodes (`sd`
 * frame with a scaled preview of a sequence diagram) are actions of kind callBehavior; control
 * nodes and control flows are the activity notation. Double-clicking a node opens its target
 * (`openTarget` hook of the node notation).
 */
import { isKindOf } from '../../../model'
import { nodeNotationFor, registerNodeNotation, type NodeNotation } from '../../render/registry'
import { overviewNavigationTarget } from './analysis'
import { layoutOverviewInline, layoutOverviewUse } from './layout'
import { OverviewInlineNode } from './render'

export * from './analysis'
export * from './layout'

export function registerOverviewNotations(): void {
  // The reference view type is shared with sequence diagrams (model: interaction use); in an
  // overview its model is an action. Both layouts produce the same data, so the sequence renderer draws both.
  const sequence = nodeNotationFor({ _type: 'UMLInteractionUseView' } as never)
  registerNodeNotation('UMLInteractionUseView', {
    ...sequence,
    layout: (view, ctx) => (isKindOf(view.model, 'UMLAction') ? layoutOverviewUse(view, ctx) : sequence.layout(view, ctx)),
    openTarget: overviewNavigationTarget
  } as NodeNotation)
  registerNodeNotation('UMLInteractionInlineView', {
    layout: layoutOverviewInline,
    Render: OverviewInlineNode,
    openTarget: overviewNavigationTarget
  } as NodeNotation)
}
