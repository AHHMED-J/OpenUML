/**
 * Quick-edit handlers of object-diagram elements (spec 23 §6), registered as custom syntaxes:
 * `object` (`<<st>> name : type`) and `slot` (`<<st>> name : type = value`). Absent clauses clear
 * their field; stereotype and type names resolve to elements by name, else are stored as text.
 */
import type { OperationBuilder } from '../../../commands'
import { fieldOf, type Elem, type Repository } from '../../../model'
import { registerQuickEditSyntax, resolveByName } from '../../editor/quickEditApply'
import { OBJECT_EDIT_HINTS, parseObject, parseSlot, type ParsedObject, type ParsedSlot } from './strings'

function setStereotype(b: OperationBuilder, repo: Repository, el: Elem, name: string | null): void {
  const field = fieldOf(el, 'stereotype')
  if (!field) return
  if (!name) b.set(el, 'stereotype', field.kind === 'prim' ? '' : null)
  else b.set(el, 'stereotype', field.kind === 'prim' ? name : (resolveByName(repo, el, name, 'UMLStereotype') ?? name))
}

function typeValue(repo: Repository, el: Elem, name: string | null): unknown {
  return name ? (resolveByName(repo, el, name, 'UMLClassifier') ?? name) : null
}

/** Applies a parsed object expression: the type goes to `classifier` (absent type clears it). */
function applyObject(b: OperationBuilder, repo: Repository, instance: Elem, p: ParsedObject): void {
  b.set(instance, 'name', p.name)
  if (fieldOf(instance, 'visibility')) b.set(instance, 'visibility', p.visibility ?? 'public')
  setStereotype(b, repo, instance, p.stereotype)
  b.set(instance, 'classifier', typeValue(repo, instance, p.type))
}

/** Applies a parsed slot expression (absent type / value clear them). */
function applySlot(b: OperationBuilder, repo: Repository, slot: Elem, p: ParsedSlot): void {
  b.set(slot, 'name', p.name)
  if (fieldOf(slot, 'visibility')) b.set(slot, 'visibility', p.visibility ?? 'public')
  setStereotype(b, repo, slot, p.stereotype)
  b.set(slot, 'type', typeValue(repo, slot, p.type))
  b.set(slot, 'value', p.value)
}

let registered = false

export function registerObjectQuickEdit(): void {
  if (registered) return
  registered = true
  registerQuickEditSyntax('object', { hint: OBJECT_EDIT_HINTS.object, parse: parseObject, apply: applyObject })
  registerQuickEditSyntax('slot', { hint: OBJECT_EDIT_HINTS.slot, parse: parseSlot, apply: applySlot })
}
