/**
 * Changing the type of a model element in place (e.g. a RAD activity becoming an interaction once
 * it is linked to another role): a new element of the new type takes the old one's place in its
 * owner, its values for the fields both types have, its owned elements and every reference to it
 * (views, lines, ...). The old element is removed. Runs inside a transaction (one undo step).
 */
import { containmentFields, createElement, fieldOf, fieldsOf, findContainment, type Elem } from '../model'
import { OperationError } from './operation'
import type { OperationBuilder } from './builder'

const SKIPPED = new Set(['_id', '_parent', '_type'])

/** Replaces `el` by an element of `type` (see the module comment); returns the new element. */
export function retypeElement(b: OperationBuilder, el: Elem, type: string): Elem {
  if (el._type === type) return el
  const repo = b.repository
  const place = findContainment(el)
  if (!place || place.index < 0) throw new OperationError(`Element ${el._id} is not in a containment list`)
  const references = repo.buildReverseIndex().get(el._id) ?? []
  const copy = createElement(type)
  // Plain values the new type also has (containment and references are moved below).
  for (const def of fieldsOf(copy)) {
    if (SKIPPED.has(def.name) || def.kind === 'obj' || def.kind === 'objs') continue
    if (fieldOf(el, def.name)?.kind === def.kind && el[def.name] !== undefined) copy[def.name] = Array.isArray(el[def.name]) ? [...(el[def.name] as unknown[])] : el[def.name]
  }
  b.insert(place.owner, place.field, copy, place.index)
  for (const def of containmentFields(el)) {
    if (def.kind !== 'objs' || fieldOf(copy, def.name)?.kind !== 'objs') continue
    for (const child of [...((el[def.name] as Elem[] | undefined) ?? [])]) b.move(child, copy, def.name)
  }
  for (const { source, field } of references) {
    if (source === el) continue
    const def = fieldOf(source, field)
    if (def?.kind === 'refs') {
      const list = source[field] as Elem[]
      const index = list.indexOf(el)
      b.removeRef(source, field, el)
      b.addRef(source, field, copy, index)
    } else {
      b.set(source, field, copy)
    }
  }
  b.remove(el)
  return copy
}
