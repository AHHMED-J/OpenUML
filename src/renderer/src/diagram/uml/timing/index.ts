/**
 * Timing diagram notation: the timing frame, lifeline bands, state/condition rows, time segments,
 * ticks, time and duration constraints and messages between segments. Positions of the structural
 * views are derived by the frame-level arrangement in `arrange.ts`.
 *
 * Editor hooks used: container behaviors (frame ⊃ lifelines ⊃ rows ⊃ segments; `reparent`
 * re-links `invariant` / `covered` when a segment moves to another row), `derivedPosition`
 * (the arranged left/top are written back), `moveAxis`, and the `interval` quick-edit syntax.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import { timeConstraintLinkNotation, timingMessageNotation } from './edges'
import {
  layoutDurationConstraint,
  layoutTimeConstraint,
  layoutTimeSegment,
  layoutTimeTick,
  layoutTimingFrame,
  layoutTimingLifeline,
  layoutTimingState
} from './layout'
import { registerTimingQuickEdit } from './quickEdit'
import { DurationConstraintNode, TimeConstraintNode, TimeSegmentNode, TimeTickNode, TimingFrameNode, TimingLifelineNode, TimingStateNode } from './render'

export * from './arrange'
export * from './edges'
export * from './layout'
export { registerTimingQuickEdit } from './quickEdit'

/** The timing frame contains lifeline bands, ticks, duration constraints and annotations. */
export const timingFrameContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isKindOf(childModel, 'UMLLifeline') || isKindOf(childModel, 'UMLDurationConstraint')
  },
  ownerFor() {
    return null
  }
}

/** A lifeline band contains its state/condition rows (owned by the lifeline). */
export const timingLifelineContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel !== null && isKindOf(childModel, 'UMLConstraint') && !isKindOf(childModel, 'UMLIntervalConstraint')
  },
  ownerFor(container: View, childModel: Elem | null) {
    return container.model && childModel ? { owner: container.model, field: 'ownedElements' } : null
  },
  reparent({ builder, container, child }) {
    // Moving a row to another lifeline: its constraint moves with it and its segments now cover that lifeline.
    const row = child.model
    const lifeline = container?.model
    if (!row || !lifeline || !isKindOf(lifeline, 'UMLLifeline')) return true
    if (row._parent !== lifeline) builder.move(row, lifeline, 'ownedElements')
    for (const seg of child.containedViews ?? []) {
      if (seg.model && seg.model['covered'] !== lifeline) builder.set(seg.model, 'covered', lifeline)
    }
    return true
  }
}

/** A state/condition row contains time segments; dropping one re-links the segment to the row. */
export const timingStateContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel !== null && isKindOf(childModel, 'UMLStateInvariant')
  },
  ownerFor() {
    return null
  },
  reparent({ builder, container, child }) {
    const segment = child.model
    const row = container?.model
    if (!segment || !row) return true
    if (segment['invariant'] !== row) builder.set(segment, 'invariant', row)
    const lifeline = row._parent
    if (lifeline && segment['covered'] !== lifeline) builder.set(segment, 'covered', lifeline)
    return true
  }
}

export function registerTimingNotations(): void {
  registerTimingQuickEdit()
  registerNodeNotation('UMLTimingFrameView', { layout: layoutTimingFrame, Render: TimingFrameNode, container: timingFrameContainer })
  registerNodeNotation('UMLTimingLifelineView', { layout: layoutTimingLifeline, Render: TimingLifelineNode, container: timingLifelineContainer })
  registerNodeNotation('UMLTimingStateView', { layout: layoutTimingState, Render: TimingStateNode, container: timingStateContainer })
  registerNodeNotation('UMLTimeSegmentView', { layout: layoutTimeSegment, Render: TimeSegmentNode })
  registerNodeNotation('UMLTimeTickView', { layout: layoutTimeTick, Render: TimeTickNode })
  registerNodeNotation('UMLDurationConstraintView', { layout: layoutDurationConstraint, Render: DurationConstraintNode })
  registerNodeNotation('UMLTimeConstraintView', { layout: layoutTimeConstraint, Render: TimeConstraintNode })
  registerEdgeNotation('UMLTimingMessageView', timingMessageNotation)
  registerEdgeNotation('UMLTimeConstraintLinkView', timeConstraintLinkNotation)
}
