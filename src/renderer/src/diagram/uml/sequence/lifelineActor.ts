/**
 * Lifelines drawn as actors. The form is not a stored flag: a lifeline is an actor when the role
 * it represents is typed by a `UMLActor`, which is how the `.mdj` format writes it. Other tools
 * also need the lifeline's view on the `icon` stereotype display to draw the stick figure (with
 * `label` they keep the box), so the two always change together; see also `readMdj`.
 */
import type { ModelEngine, OperationBuilder } from '../../../commands'
import { createElement, defaultName, isKindOf, ModelRuleError, nextName, type Elem, type Repository } from '../../../model'
import { resolveByName } from '../../editor/quickEditApply'
import { nameOf } from '../../layout/helpers'
import { typeText } from '../class/strings'
import { lifelineType } from './strings'

export function isActorLifeline(lifeline: Elem | null | undefined): boolean {
  return isKindOf(lifelineType(lifeline) as Elem, 'UMLActor')
}

/** Sets the stereotype display that makes other tools draw the same form as `isActorLifeline`. */
export function syncLifelineDisplay(b: OperationBuilder, repo: Repository, lifeline: Elem, actor: boolean): void {
  for (const view of repo.viewsOf(lifeline)) {
    if (isKindOf(view, 'UMLSeqLifelineView')) b.set(view, 'stereotypeDisplay', actor ? 'icon' : 'label')
  }
}

/** The lifeline's role, added to the collaboration (or classifier) owning the interaction when missing. */
export function ensureLifelineRole(b: OperationBuilder, lifeline: Elem): Elem | null {
  const role = lifeline['represent'] as Elem | null | undefined
  if (role) return role
  const owner = lifeline._parent?._parent
  if (!owner || !isKindOf(owner, 'UMLClassifier')) return null
  const added = createElement('UMLAttribute', { name: nextName(owner.attributes ?? [], 'Role') })
  b.insert(owner, 'attributes', added)
  b.set(lifeline, 'represent', added)
  return added
}

/** The nearest package around the lifeline's interaction (new actors go there), else the top of the model. */
function actorHome(lifeline: Elem): Elem {
  let top = lifeline
  for (let p = lifeline._parent; p; p = p._parent) {
    if (isKindOf(p, 'UMLPackage')) return p
    top = p
  }
  return top
}

/** The actor called `name`, reusing the one the model already has. */
export function actorNamed(b: OperationBuilder, repo: Repository, lifeline: Elem, name: string): Elem {
  const found = resolveByName(repo, lifeline, name, 'UMLActor')
  if (found) return found
  const actor = createElement('UMLActor', { name })
  b.insert(actorHome(lifeline), 'ownedElements', actor)
  return actor
}

function makeActor(b: OperationBuilder, repo: Repository, lifeline: Elem): void {
  const role = ensureLifelineRole(b, lifeline)
  if (!role) throw new ModelRuleError('This lifeline has no collaboration to hold its role')
  const type = typeText(lifelineType(lifeline))
  const home = actorHome(lifeline)
  const name = type || nameOf(lifeline) || defaultName('UMLActor', (home['ownedElements'] as Elem[] | undefined) ?? [])
  b.set(role, 'type', actorNamed(b, repo, lifeline, name))
  // Without a type the name was the participant's: it is the actor's now, or it would read `Name: Name`.
  if (!type) b.set(lifeline, 'name', '')
  syncLifelineDisplay(b, repo, lifeline, true)
}

function makeObject(b: OperationBuilder, repo: Repository, lifeline: Elem): void {
  const role = lifeline['represent'] as Elem
  const actor = nameOf(role['type'] as Elem)
  b.set(role, 'type', resolveByName(repo, lifeline, actor, 'UMLClass'))
  if (!nameOf(lifeline)) b.set(lifeline, 'name', actor)
  syncLifelineDisplay(b, repo, lifeline, false)
}

/** Draws `lifelines` as actors or back as boxes, as one operation. The actors stay in the model. */
export function setLifelineActor(engine: ModelEngine, lifelines: readonly Elem[], actor: boolean): void {
  engine.transact(actor ? 'Show as Actor' : 'Show as Object', (b) => {
    for (const lifeline of lifelines) {
      if (isActorLifeline(lifeline) === actor) continue
      if (actor) makeActor(b, engine.repository, lifeline)
      else makeObject(b, engine.repository, lifeline)
    }
  })
}
