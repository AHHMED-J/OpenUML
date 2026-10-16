/**
 * Role Activity Diagram notation: roles as containers, symbols on threads (activities,
 * interactions, undefined processes, markers, waits, role starts), case/part refinements with
 * their branches, state lines and interaction links.
 *
 * Editor hooks used: `ContainerBehavior` of the role view (`accepts`, `ownerFor` into the role's
 * `elements`, `reparent` moving the model between roles and snapping children back when dropped
 * outside any role), `outerHitAreas` (labels beside symbols), the `radRoleTitle` and `radName`
 * quick-edit syntaxes, `connectKind` on both edge notations, the `moveGroup` diagram hook (a
 * refinement moves with its branches), the `createEdge` hook (a line between two roles is an
 * interaction) and a transaction hook (an interaction left without links is an activity again).
 */
import { isKindOf, listField, type Elem, type View } from '../../model'
import { registerTransactionHook } from '../../commands'
import { registerDiagramHooks, type DiagramEnv } from '../editor/actions'
import { connectRoles, revertUnlinkedInteractions } from './interactions'
import { registerEdgeNotation, registerNodeNotation, type ContainerBehavior } from '../render/registry'
import { interactionLinkNotation, stateLineNotation } from './edges'
import {
  layoutActivity,
  layoutBranch,
  layoutRefinement,
  layoutRole,
  layoutRoleStart,
  layoutStateMarker,
  layoutUndefinedProcess,
  layoutWait
} from './layout'
import { registerRadQuickEdit } from './quickEdit'
import { ActivityNode, BranchNode, RefinementNode, RoleNode, RoleStartNode, StateMarkerNode, UndefinedProcessNode, WaitNode } from './render'

export * from './edges'
export * from './layout'
export * from './render'
export * from './routing'
export * from './strings'
export * from './validation'

type ReparentBuilder = Parameters<NonNullable<ContainerBehavior['reparent']>>[0]['builder']

function isElementModel(model: Elem | null | undefined): model is Elem {
  return model != null && isKindOf(model, 'RADElement')
}

/** Removes a model element together with its views (used for lines that would cross roles). */
function removeWithViews(b: ReparentBuilder, repo: { viewsOf(m: Elem): readonly View[] }, el: Elem): void {
  for (const v of repo.viewsOf(el)) b.remove(v)
  b.remove(el)
}

/**
 * A role view contains the elements placed in it. Dropping an element there moves its model into
 * the role's `elements`; state lines to elements left behind (and interaction links that would
 * join a role to itself) are removed in the same operation. Dropping a contained view outside every
 * role keeps it in its role (the role grows to follow it).
 */
const roleContainer: ContainerBehavior = {
  accepts(_container: View, childModel: Elem | null): boolean {
    return childModel === null || isElementModel(childModel)
  },
  ownerFor(container: View, childModel: Elem | null) {
    const role = container.model
    return role && isElementModel(childModel) && isKindOf(role, 'RADRole') ? { owner: role, field: 'elements' } : null
  },
  reparent({ builder, child, container, previous }) {
    const model = child.model
    if (!isElementModel(model)) return false
    if (!container) {
      // Elements cannot leave their role by dragging: restore the containment.
      if (previous) {
        builder.set(child, 'containerView', previous)
        builder.addRef(previous, 'containedViews', child)
      }
      return true
    }
    const target = container.model
    if (!target || !isKindOf(target, 'RADRole')) return false
    const oldRole = isKindOf(model._parent, 'RADRole') ? model._parent : null
    if (oldRole === target) return true
    const repo = builder.repository
    if (oldRole) {
      // Lines that would now cross roles.
      for (const line of [...(oldRole['stateLines'] as Elem[])]) {
        if (line['source'] === model || line['target'] === model) removeWithViews(builder, repo, line)
      }
      // Branches and refinements must stay in one role.
      for (const e of oldRole['elements'] as Elem[]) {
        if (isKindOf(e, 'RADBranch') && e['refinement'] === model) builder.set(e, 'refinement', null)
      }
      if (isKindOf(model, 'RADBranch')) builder.set(model, 'refinement', null)
    }
    builder.move(model, target, 'elements')
    // Interaction links that now join a role to itself.
    const process = target._parent
    for (const link of [...(((process?.['interactions'] as Elem[] | undefined) ?? []))]) {
      const a = link['source'] as Elem | null
      const b = link['target'] as Elem | null
      if (a && b && a._parent === b._parent && (a === model || b === model)) removeWithViews(builder, repo, link)
    }
    return true
  }
}

/**
 * A refinement and its branches (the circle with its alternatives or parallel-path triangles) move
 * as one group: moving any of them moves the others on the same diagram too.
 */
function refinementGroup(env: DiagramEnv, views: readonly View[]): View[] {
  const repo = env.engine.repository
  const extra: View[] = []
  const seen = new Set<Elem>()
  for (const view of views) {
    const model = view.model
    const refinement = !model ? null : isKindOf(model, 'RADRefinement') ? model : isKindOf(model, 'RADBranch') ? (model['refinement'] as Elem | null) : null
    if (!refinement || seen.has(refinement)) continue
    seen.add(refinement)
    const members = [refinement, ...listField(refinement._parent, 'elements').filter((e) => isKindOf(e, 'RADBranch') && e['refinement'] === refinement)]
    for (const member of members) {
      for (const v of repo.viewsOf(member)) if (v._parent === env.diagram && !views.includes(v) && !extra.includes(v)) extra.push(v)
    }
  }
  return extra
}

export function registerRadNotations(): void {
  registerDiagramHooks('RADDiagram', { moveGroup: refinementGroup, createEdge: connectRoles })
  registerTransactionHook(revertUnlinkedInteractions)
  registerRadQuickEdit()
  registerNodeNotation('RADRoleView', { layout: layoutRole, Render: RoleNode, container: roleContainer })
  registerNodeNotation('RADActivityView', { layout: layoutActivity, Render: ActivityNode })
  registerNodeNotation('RADUndefinedProcessView', { layout: layoutUndefinedProcess, Render: UndefinedProcessNode })
  registerNodeNotation('RADStateMarkerView', { layout: layoutStateMarker, Render: StateMarkerNode })
  registerNodeNotation('RADWaitView', { layout: layoutWait, Render: WaitNode })
  registerNodeNotation('RADRoleStartView', { layout: layoutRoleStart, Render: RoleStartNode })
  registerNodeNotation('RADRefinementView', { layout: layoutRefinement, Render: RefinementNode })
  registerNodeNotation('RADBranchView', { layout: layoutBranch, Render: BranchNode })
  registerEdgeNotation('RADStateLineView', stateLineNotation)
  registerEdgeNotation('RADInteractionLinkView', interactionLinkNotation)
}
