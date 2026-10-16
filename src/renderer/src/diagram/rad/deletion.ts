/**
 * Deleting on a RAD diagram: the elements whose only views are being deleted (roles, symbols,
 * state lines, interaction links) leave the model too, so nothing is left behind in the Model
 * Explorer. An element still shown on another diagram only loses the deleted view. One undo step.
 */
import { collectDeletion, deleteFromModel, deleteFromView } from '../../commands'
import { isKindOf, type Elem, type View } from '../../model'
import type { DiagramEnv } from '../editor/actions'

const RAD_MODEL_TYPES = ['RADRole', 'RADElement', 'RADStateLine', 'RADInteractionLink']

function isRadModel(el: Elem | null | undefined): el is Elem {
  return !!el && RAD_MODEL_TYPES.some((type) => isKindOf(el, type))
}

/** `deleteViews` hook of RAD diagrams; handles the whole deletion (returns no views left over). */
export function deleteRadViews(env: DiagramEnv, views: readonly View[]): View[] {
  const repo = env.engine.repository
  // Everything the views take with them (contained symbols, attached lines, labels).
  const doomed = collectDeletion(repo, views, 'view')
  const models = new Set<Elem>()
  for (const el of doomed) {
    const model = isKindOf(el, 'View') ? (el as View).model : null
    if (isRadModel(model) && repo.viewsOf(model).every((v) => doomed.has(v))) models.add(model)
  }
  env.engine.transact('Delete', () => {
    if (models.size > 0) deleteFromModel(env.engine, [...models])
    const rest = views.filter((v) => repo.contains(v))
    if (rest.length > 0) deleteFromView(env.engine, rest)
  })
  return []
}
