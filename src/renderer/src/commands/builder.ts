import { encodeFieldValue, serializeElement, type Json, type WriteOptions } from '../format'
import { fieldOf, findContainment, type Elem, type FieldDef, type Repository } from '../model'
import { OperationError, type Step } from './operation'

/** Snapshots keep every field so that re-materialized elements are exact copies. */
const SNAPSHOT: WriteOptions = { verbose: true }

function sameJson(a: Json, b: Json): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Records the primitive steps of one operation. Each call applies its change to the repository
 * immediately and records the matching step, so later calls see the updated state; the engine
 * reverts the recorded steps if the build fails. Obtain one through `ModelEngine.transact`.
 */
export class OperationBuilder {
  readonly steps: Step[] = []

  constructor(readonly repository: Repository) {}

  private field(el: Elem, name: string): FieldDef {
    const def = fieldOf(el, name)
    if (!def) throw new OperationError(`${el._type} has no field "${name}"`)
    return def
  }

  private list(owner: Elem, name: string, kinds: readonly string[]): Elem[] {
    const def = this.field(owner, name)
    const value = owner[name]
    if (!kinds.includes(def.kind) || !Array.isArray(value)) {
      throw new OperationError(`${owner._type}.${name} is not a ${kinds.join('/')} list`)
    }
    return value as Elem[]
  }

  private assign(el: Elem, name: string, def: FieldDef, value: unknown): void {
    const old = encodeFieldValue(def, el[name])
    const next = encodeFieldValue(def, value)
    if (sameJson(old, next)) return
    el[name] = value
    this.steps.push({ op: 'a', id: el._id, field: name, value: next, old })
  }

  /**
   * Inserts a detached element (with its subtree) into the containment field `owner[field]`
   * (`objs`: at `index`, default end; `obj`: assigned) and registers it.
   */
  insert(owner: Elem, field: string, el: Elem, index?: number): void {
    if (this.repository.contains(el)) throw new OperationError(`Element ${el._id} is already in the model`)
    const def = this.field(owner, field)
    if (def.kind !== 'obj' && def.kind !== 'objs') throw new OperationError(`${owner._type}.${field} is not a containment field`)
    el._parent = owner
    this.steps.push({ op: 'I', json: serializeElement(el, SNAPSHOT) })
    this.repository.register(el)
    if (def.kind === 'obj') {
      this.assign(owner, field, def, el)
      return
    }
    const list = this.list(owner, field, ['objs'])
    const at = Math.max(0, Math.min(index ?? list.length, list.length))
    list.splice(at, 0, el)
    this.steps.push({ op: 'i', owner: owner._id, field, elem: el._id, index: at })
  }

  /** Removes an element (with its subtree) from its owner and unregisters it. */
  remove(el: Elem): void {
    const c = findContainment(el)
    if (!c) throw new OperationError(`Element ${el._id} has no owner`)
    const json = serializeElement(el, SNAPSHOT)
    if (c.index >= 0) {
      ;(c.owner[c.field] as Elem[]).splice(c.index, 1)
      this.steps.push({ op: 'r', owner: c.owner._id, field: c.field, elem: el._id, index: c.index })
    } else {
      this.assign(c.owner, c.field, this.field(c.owner, c.field), null)
    }
    this.steps.push({ op: 'R', json })
    this.repository.unregister(el)
  }

  /** Assigns a non-containment field (primitive, enum, reference, variant, custom, or a whole reference list). */
  set(el: Elem, field: string, value: unknown): void {
    if (field === '_id' || field === '_parent') throw new OperationError(`Cannot set ${field} directly`)
    const def = this.field(el, field)
    if (def.kind === 'obj' || def.kind === 'objs') throw new OperationError(`Use insert/remove for ${el._type}.${field}`)
    this.assign(el, field, def, value)
  }

  /** Assigns several fields of one element. */
  setAll(el: Elem, values: Readonly<Record<string, unknown>>): void {
    for (const [field, value] of Object.entries(values)) this.set(el, field, value)
  }

  /** Inserts `target` into the reference list `owner[field]` (no-op if already present). */
  addRef(owner: Elem, field: string, target: Elem, index?: number): void {
    const list = this.list(owner, field, ['refs'])
    if (list.includes(target)) return
    const at = Math.max(0, Math.min(index ?? list.length, list.length))
    list.splice(at, 0, target)
    this.steps.push({ op: 'i', owner: owner._id, field, elem: target._id, index: at })
  }

  /** Removes `target` from the reference list `owner[field]` (no-op if absent). */
  removeRef(owner: Elem, field: string, target: Elem): void {
    const list = this.list(owner, field, ['refs'])
    const at = list.indexOf(target)
    if (at < 0) return
    list.splice(at, 1)
    this.steps.push({ op: 'r', owner: owner._id, field, elem: target._id, index: at })
  }

  /** Moves `el` to position `index` within the list `owner[field]` (containment or reference list). */
  reorder(owner: Elem, field: string, el: Elem, index: number): void {
    const list = this.list(owner, field, ['objs', 'refs'])
    const from = list.indexOf(el)
    if (from < 0) throw new OperationError(`Element ${el._id} not in ${owner._type}.${field}`)
    const to = Math.max(0, Math.min(index, list.length - 1))
    if (from === to) return
    list.splice(from, 1)
    list.splice(to, 0, el)
    this.steps.push({ op: 'o', owner: owner._id, field, elem: el._id, index: to, oldIndex: from })
  }

  /** Moves a contained element to `newOwner[field]` (a list), updating `_parent`. */
  move(el: Elem, newOwner: Elem, field: string, index?: number): void {
    const c = findContainment(el)
    if (!c || c.index < 0) throw new OperationError(`Element ${el._id} is not in a containment list`)
    const target = this.list(newOwner, field, ['objs'])
    ;(c.owner[c.field] as Elem[]).splice(c.index, 1)
    this.steps.push({ op: 'r', owner: c.owner._id, field: c.field, elem: el._id, index: c.index })
    const at = Math.max(0, Math.min(index ?? target.length, target.length))
    target.splice(at, 0, el)
    this.steps.push({ op: 'i', owner: newOwner._id, field, elem: el._id, index: at })
    this.assign(el, '_parent', this.field(el, '_parent'), newOwner)
  }
}
