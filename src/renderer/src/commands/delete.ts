/** Deletion with the cascade rules: one gesture = one operation. */
import { childrenOf, fieldOf, isKindOf, type Elem, type Reference, type Repository, type View } from '../model'
import type { OperationBuilder } from './builder'
import type { ModelEngine } from './engine'

/** True for sub-views that their host links through an embedded field (compartments, labels). */
function isEmbeddedPart(el: Elem): boolean {
  const host = el._parent
  if (!host || !isKindOf(host, 'View')) return false
  for (const [name, value] of Object.entries(host)) {
    if (value === el && fieldOf(host, name)?.embedded) return true
  }
  return false
}

/**
 * Expands a selection into everything that must be deleted with it.
 *
 * `model` mode (Delete from Model): owned descendants, relationships attached to deleted
 * models, all views of deleted models, then the view rules below.
 * `view` mode (Delete from View): only views — sub-views, visually contained views, edges
 * attached to deleted views and parasitic views hosted by them. Model elements are ignored.
 *
 * The Project and embedded sub-view parts (compartments, labels) are never seeds.
 */
export function collectDeletion(repo: Repository, seeds: readonly Elem[], mode: 'model' | 'view'): Set<Elem> {
  const reverse = repo.buildReverseIndex()
  const result = new Set<Elem>()
  const queue: Elem[] = []
  const add = (el: Elem | null | undefined): void => {
    if (!el || result.has(el) || isKindOf(el, 'Project') || !repo.contains(el)) return
    if (mode === 'view' && !isKindOf(el, 'View')) return
    result.add(el)
    queue.push(el)
  }

  for (const seed of seeds) {
    if (isEmbeddedPart(seed)) continue
    if (mode === 'model' && isKindOf(seed, 'RelationshipEnd') && isKindOf(seed._parent, 'UndirectedRelationship')) {
      add(seed._parent)
    } else {
      add(seed)
    }
  }

  while (queue.length > 0) {
    const el = queue.pop() as Elem
    for (const child of childrenOf(el)) add(child)
    const isView = isKindOf(el, 'View')
    if (isView) for (const v of el.containedViews) add(v)

    for (const { source, field } of reverse.get(el._id) ?? []) {
      if (isView) {
        if ((field === 'head' || field === 'tail') && isKindOf(source, 'EdgeView')) add(source)
        else if (field === 'hostNode' || field === 'hostEdge' || field === 'containerView') add(source)
      } else if (mode === 'model') {
        if ((field === 'source' || field === 'target') && isKindOf(source, 'DirectedRelationship')) add(source)
        else if (field === 'reference' && isKindOf(source, 'RelationshipEnd')) add(source._parent)
        // RAD: removing a refinement removes its branches (and, through them, their state lines).
        else if (field === 'refinement' && isKindOf(source, 'RADBranch')) add(source)
        // A communication message only exists beside its connector; sequence messages keep theirs.
        else if (field === 'connector' && isKindOf(source, 'UMLMessage') && repo.viewsOf(source).every((v) => v._type === 'UMLCommMessageView')) add(source)
        else if (field === 'model' && isKindOf(source, 'View')) add(source)
      }
    }
  }
  return result
}

/**
 * Records the deletion of an already expanded set: clears references held by elements outside
 * the set, then removes the top-most deleted views, then the top-most deleted models.
 */
function deleteSet(engine: ModelEngine, set: Set<Elem>, name: string): void {
  if (set.size === 0) return
  const repo = engine.repository
  const reverse = repo.buildReverseIndex()
  engine.transact(name, (b) => {
    for (const el of set) {
      for (const ref of reverse.get(el._id) ?? []) clearReference(b, ref, el, set)
    }
    const tops = [...set].filter((el) => !el._parent || !set.has(el._parent))
    for (const el of tops) if (isKindOf(el, 'View')) b.remove(el)
    for (const el of tops) if (!isKindOf(el, 'View')) b.remove(el)
  })
}

function clearReference(b: OperationBuilder, ref: Reference, target: Elem, deleted: Set<Elem>): void {
  if (deleted.has(ref.source)) return
  const def = fieldOf(ref.source, ref.field)
  if (def?.kind === 'refs') b.removeRef(ref.source, ref.field, target)
  else b.set(ref.source, ref.field, null)
}

/** Delete from Model: removes the elements, their dependents and all their views (one undo step). */
export function deleteFromModel(engine: ModelEngine, elements: readonly Elem[], name = 'Delete from Model'): Set<Elem> {
  const set = collectDeletion(engine.repository, elements, 'model')
  deleteSet(engine, set, name)
  return set
}

/** Delete from View: removes views only (and attached edges / sub-views); model elements stay. */
export function deleteFromView(engine: ModelEngine, views: readonly View[], name = 'Delete'): Set<Elem> {
  const set = collectDeletion(engine.repository, views, 'view')
  deleteSet(engine, set, name)
  return set
}
