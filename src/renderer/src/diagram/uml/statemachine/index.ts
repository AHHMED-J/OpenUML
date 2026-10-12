/**
 * State machine (statechart) diagram notation: states with internal activities, internal
 * transitions and regions; pseudostates; final states; connection point references; transitions.
 *
 * Editor hooks used: `subContainers` (a state's region views accept dropped vertices),
 * `ContainerBehavior.reparent` (moving a vertex view between regions moves its model into
 * `UMLRegion.vertices` as one operation), `dividers` (region heights), `fallbackEdit` (transition
 * string of an unlabeled transition) and the `transition` quick-edit syntax.
 */
import { isKindOf, type Elem, type View } from '../../../model'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../../render/registry'
import { transitionNotation } from './edges'
import { layoutConnectionPoint, layoutFinalState, layoutOrphanRegion, layoutPseudostate, layoutState } from './layout'
import { registerStateMachineQuickEdit } from './quickEdit'
import { ConnectionPointNode, EmptyNode, FinalStateNode, PseudostateNode, StateNode } from './render'

export * from './edges'
export * from './layout'
export * from './strings'
export { registerStateMachineQuickEdit } from './quickEdit'

/** Moves `views` (and what they contain) after everything else so they are drawn on top. */
function bringToFront(b: Parameters<NonNullable<ContainerBehavior['reparent']>>[0]['builder'], diagram: Elem, views: readonly View[]): void {
  const list = diagram['ownedViews'] as View[] | undefined
  if (!list) return
  const order: View[] = []
  const visit = (v: View): void => {
    if (order.includes(v)) return
    order.push(v)
    for (const c of v.containedViews ?? []) visit(c)
    for (const s of v.subViews ?? []) for (const c of s.containedViews ?? []) visit(c)
    for (const s of v.subViews ?? []) for (const x of s.subViews ?? []) for (const c of x.containedViews ?? []) visit(c)
  }
  views.forEach(visit)
  for (const v of order) {
    if (!list.includes(v)) continue
    b.reorder(diagram, 'ownedViews', v, list.length - 1)
  }
}

function isVertexModel(model: Elem | null): model is Elem {
  return model !== null && isKindOf(model, 'UMLVertex') && !isKindOf(model, 'UMLConnectionPointReference')
}

/** Whether `region` lies inside `vertex` (dropping a state into its own descendant is refused). */
function insideVertex(region: Elem | null | undefined, vertex: Elem): boolean {
  for (let e: Elem | null = region ?? null; e; e = e._parent) if (e === vertex) return true
  return false
}

/**
 * A region view contains the vertices placed in it. Dropping a state, pseudostate or final state
 * there moves its model into the region's `vertices`; dropping it onto the canvas moves it to the
 * first region of the diagram's state machine. Connection point references stay on their state.
 */
export const regionContainer: ContainerBehavior = {
  accepts(container: View, childModel: Elem | null): boolean {
    return isVertexModel(childModel) && !insideVertex(container.model, childModel)
  },
  ownerFor(container: View, childModel: Elem | null) {
    const region = container.model
    return region && isVertexModel(childModel) ? { owner: region, field: 'vertices' } : null
  },
  reparent({ builder, diagram, child, container, previous }) {
    const model = child.model
    if (!model || !isKindOf(model, 'UMLVertex') || isKindOf(model, 'UMLConnectionPointReference')) return false
    const machine = diagram._parent
    const target = container?.model ?? (Array.isArray(machine?.['regions']) ? (machine['regions'] as Elem[])[0] : undefined)
    if (!target || !isKindOf(target, 'UMLRegion') || target === model) return false
    if (model._parent !== target) builder.move(model, target, 'vertices')
    void previous
    bringToFront(builder, diagram, [child])
    return true
  }
}

/** A state view only keeps its own connection point references (pins-style); its regions are nested containers. */
export const stateContainer: ContainerBehavior = {
  accepts(container: View, childModel: Elem | null): boolean {
    return childModel !== null && isKindOf(childModel, 'UMLConnectionPointReference') && container.model != null && childModel._parent === container.model
  },
  ownerFor() {
    return null
  }
}

export function registerStateMachineNotations(): void {
  registerStateMachineQuickEdit()
  registerNodeNotation('UMLStateView', { layout: layoutState, Render: StateNode, container: stateContainer })
  registerNodeNotation('UMLFinalStateView', { layout: layoutFinalState, Render: FinalStateNode })
  registerNodeNotation('UMLPseudostateView', { layout: layoutPseudostate, Render: PseudostateNode })
  registerNodeNotation('UMLConnectionPointReferenceView', { layout: layoutConnectionPoint, Render: ConnectionPointNode })
  // Region views are drawn by their state; they are registered for their container behavior.
  registerNodeNotation('UMLRegionView', { layout: layoutOrphanRegion, Render: EmptyNode, container: regionContainer })
  registerEdgeNotation('UMLTransitionView', transitionNotation)
}
