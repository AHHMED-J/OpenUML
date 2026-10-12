/**
 * Quick-edit handlers of sequence elements (spec 02 §7.7), registered as custom syntaxes:
 * `lifeline` (`<<st>> name[selector]: Type`), `message` (`<<st>> target = name(arguments)`) and
 * `guard` (operand guards). Absent clauses clear their field; stereotype and type names resolve
 * to elements by name, else are stored as text.
 */
import type { OperationBuilder } from '../../../commands'
import { createElement, fieldOf, isKindOf, nextName, type Elem, type Repository } from '../../../model'
import { registerQuickEditSyntax, resolveByName } from '../../editor/quickEditApply'
import { messageDisplayName, parseGuard, parseLifeline, parseMessage, SEQUENCE_EDIT_HINTS, type ParsedLifeline, type ParsedMessage } from './strings'

function setStereotype(b: OperationBuilder, repo: Repository, el: Elem, name: string | null): void {
  const field = fieldOf(el, 'stereotype')
  if (!field) return
  if (!name) b.set(el, 'stereotype', field.kind === 'prim' ? '' : null)
  else b.set(el, 'stereotype', field.kind === 'prim' ? name : (resolveByName(repo, el, name, 'UMLStereotype') ?? name))
}

/** Applies a parsed lifeline notation; the type goes to the represented role (created when missing). */
export function applyLifeline(b: OperationBuilder, repo: Repository, lifeline: Elem, p: ParsedLifeline): void {
  b.set(lifeline, 'name', p.name)
  if (fieldOf(lifeline, 'visibility')) b.set(lifeline, 'visibility', p.visibility ?? 'public')
  setStereotype(b, repo, lifeline, p.stereotype)
  b.set(lifeline, 'selector', p.selector)
  let role = lifeline['represent'] as Elem | null | undefined
  if (!role && p.type) {
    // A lifeline without a role: add one to the collaboration (or classifier) owning the interaction.
    const owner = lifeline._parent?._parent
    if (isKindOf(owner, 'UMLClassifier')) {
      role = createElement('UMLAttribute', { name: nextName(owner.attributes ?? [], 'Role') })
      b.insert(owner, 'attributes', role)
      b.set(lifeline, 'represent', role)
    }
  }
  if (role) b.set(role, 'type', p.type ? (resolveByName(repo, lifeline, p.type, 'UMLClassifier') ?? p.type) : null)
}

/** Applies a parsed message notation; a signature whose name no longer matches is dropped. */
export function applyMessage(b: OperationBuilder, repo: Repository, message: Elem, p: ParsedMessage): void {
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
