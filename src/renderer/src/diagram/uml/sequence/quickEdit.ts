/**
 * Quick-edit handlers of sequence elements (spec 02 §7.7), registered as custom syntaxes:
 * `lifeline` (`<<st>> name[selector]: Type`), `message` (`<<st>> target = name(arguments)`) and
 * `guard` (operand guards). Absent clauses clear their field; stereotype and type names resolve
 * to elements by name, else are stored as text.
 */
import type { OperationBuilder } from '../../../commands'
import { fieldOf, type Elem, type Repository } from '../../../model'
import { registerQuickEditSyntax, resolveByName, setStereotype } from '../../editor/quickEditApply'
import { actorNamed, ensureLifelineRole, isActorLifeline, syncLifelineDisplay } from './lifelineActor'
import { messageDisplayName, parseGuard, parseLifeline, parseMessage, SEQUENCE_EDIT_HINTS, type ParsedLifeline, type ParsedMessage } from './strings'

/** The element or text a typed lifeline type resolves to; an actor stays an actor until its box is unchecked. */
function resolveLifelineType(b: OperationBuilder, repo: Repository, lifeline: Elem, type: string, actor: boolean): Elem | string {
  if (!actor) return resolveByName(repo, lifeline, type, 'UMLClassifier') ?? type
  return resolveByName(repo, lifeline, type, 'UMLActor') ?? resolveByName(repo, lifeline, type, 'UMLClassifier') ?? actorNamed(b, repo, lifeline, type)
}

/** Applies a parsed lifeline notation; the type goes to the represented role (created when missing). */
function applyLifeline(b: OperationBuilder, repo: Repository, lifeline: Elem, p: ParsedLifeline): void {
  const actor = isActorLifeline(lifeline)
  // Under the stick figure a bare name is the actor's, not an instance name beside it.
  const bare = actor && p.name !== '' && !p.type
  const type = bare ? p.name : p.type
  b.set(lifeline, 'name', bare ? '' : p.name)
  if (fieldOf(lifeline, 'visibility')) b.set(lifeline, 'visibility', p.visibility ?? 'public')
  setStereotype(b, repo, lifeline, p.stereotype)
  b.set(lifeline, 'selector', p.selector)
  const role = type ? ensureLifelineRole(b, lifeline) : ((lifeline['represent'] as Elem | null | undefined) ?? null)
  if (role) b.set(role, 'type', type ? resolveLifelineType(b, repo, lifeline, type, actor) : null)
  if (isActorLifeline(lifeline) !== actor) syncLifelineDisplay(b, repo, lifeline, !actor)
}

/** Applies a parsed message notation; a signature whose name no longer matches is dropped. */
function applyMessage(b: OperationBuilder, repo: Repository, message: Elem, p: ParsedMessage): void {
  setStereotype(b, repo, message, p.stereotype)
  b.set(message, 'assignmentTarget', p.assignmentTarget)
  b.set(message, 'arguments', p.arguments)
  const sig = message['signature'] as Elem | null | undefined
  if (sig && messageDisplayName(message) === p.name) return
  if (sig) b.set(message, 'signature', null)
  b.set(message, 'name', p.name)
}

let registered = false

export function registerSequenceQuickEdit(): void {
  if (registered) return
  registered = true
  registerQuickEditSyntax('lifeline', { hint: SEQUENCE_EDIT_HINTS.lifeline, parse: parseLifeline, apply: applyLifeline })
  registerQuickEditSyntax('message', { hint: SEQUENCE_EDIT_HINTS.message, parse: parseMessage, apply: applyMessage })
  registerQuickEditSyntax('guard', {
    hint: SEQUENCE_EDIT_HINTS.guard,
    parse: parseGuard,
    apply: (b, _repo, operand, guard) => b.set(operand, 'guard', guard)
  })
}
