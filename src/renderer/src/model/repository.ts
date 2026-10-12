import { generateId } from './id'
import { containmentFields, isElem, isKindOf, referenceFields } from './metamodel'
import type { Diagram, Elem, Project, View } from './types'

/** A reference from `source.field` to some element. */
export interface Reference {
  readonly source: Elem
  readonly field: string
}

/** Where an element sits in its owner. `index` is -1 for single-valued (`obj`) fields. */
export interface Containment {
  readonly owner: Elem
  readonly field: string
  readonly index: number
}

/**
 * The in-memory project: an ID index over a containment tree rooted at the Project.
 *
 * The repository does not record history. Mutations that must be undoable go through
 * `commands/` (operations); `register`/`unregister` are the low-level hooks they use.
 */
export class Repository {
  private readonly index = new Map<string, Elem>()
  private rootElement: Elem | null = null

  constructor(root?: Elem) {
    if (root) this.setRoot(root)
  }

  get root(): Elem | null {
    return this.rootElement
  }

  get project(): Project | null {
    return isKindOf(this.rootElement, 'Project') ? this.rootElement : null
  }

  /** Replaces the whole content with the tree under `root`. */
  setRoot(root: Elem): void {
    this.index.clear()
    this.rootElement = root
    this.register(root)
  }

  get size(): number {
    return this.index.size
  }

  get(id: string | null | undefined): Elem | undefined {
    return id == null ? undefined : this.index.get(id)
  }

  has(id: string): boolean {
    return this.index.has(id)
  }

  /** True when this exact object is the indexed element for its ID. */
  contains(el: Elem): boolean {
    return this.index.get(el._id) === el
  }

  elements(): IterableIterator<Elem> {
    return this.index.values()
  }

  /** Indexes `el` and all its contained descendants. Throws on duplicate IDs. */
  register(el: Elem): void {
    for (const e of walk(el)) {
      const existing = this.index.get(e._id)
      if (existing && existing !== e) throw new Error(`Duplicate element id ${e._id}`)
      this.index.set(e._id, e)
    }
  }

  /** Removes `el` and its contained descendants from the index. */
  unregister(el: Elem): void {
    for (const e of walk(el)) {
      if (this.index.get(e._id) === e) this.index.delete(e._id)
    }
  }

  /** Generates an ID not used in this repository. */
  generateId(): string {
    let id = generateId()
    while (this.index.has(id)) id = generateId()
    return id
  }

  // ---------------------------------------------------------------------------------------------
  // Containment queries

  /** Finds which field of `_parent` holds `el`. */
  containmentOf(el: Elem): Containment | null {
    return findContainment(el)
  }

  children(el: Elem): Elem[] {
    return childrenOf(el)
  }

  /** Contained descendants (depth-first, pre-order). */
  descendants(el: Elem, includeSelf = false): Elem[] {
    const all = [...walk(el)]
    return includeSelf ? all : all.slice(1)
  }

  /** `_parent` chain, nearest first. */
  ancestors(el: Elem): Elem[] {
    const result: Elem[] = []
    for (let p = el._parent; p; p = p._parent) result.push(p)
    return result
  }

  /** True when `ancestor` contains `el` (directly or indirectly). */
  isAncestor(ancestor: Elem, el: Elem): boolean {
    for (let p = el._parent; p; p = p._parent) if (p === ancestor) return true
    return false
  }

  /** The diagram a view belongs to (walking up through host views). */
  diagramOf(view: Elem): Diagram | null {
    for (let p: Elem | null = view; p; p = p._parent) if (isKindOf(p, 'Diagram')) return p
    return null
  }

  // ---------------------------------------------------------------------------------------------
  // Reference queries

  /** Elements that hold a non-owning reference to `target` (excluding `_parent`). */
  findReferencing(target: Elem): Reference[] {
    const result: Reference[] = []
    for (const el of this.index.values()) {
      for (const field of referenceFields(el)) {
        if (refersTo(el[field.name], target)) result.push({ source: el, field: field.name })
      }
    }
    return result
  }

  /** Builds a reverse-reference map (target id → references) in one pass over the index. */
  buildReverseIndex(): Map<string, Reference[]> {
    const map = new Map<string, Reference[]>()
    const add = (target: unknown, ref: Reference): void => {
      if (!isElem(target)) return
      const list = map.get(target._id)
      if (list) list.push(ref)
      else map.set(target._id, [ref])
    }
    for (const el of this.index.values()) {
      for (const field of referenceFields(el)) {
        const value = el[field.name]
        const ref = { source: el, field: field.name }
        if (Array.isArray(value)) for (const v of value) add(v, ref)
        else add(value, ref)
      }
    }
    return map
  }

  /** Views (on any diagram) whose `model` is `model`, excluding sub-views of those views. */
  viewsOf(model: Elem): View[] {
    const result: View[] = []
    for (const el of this.index.values()) {
      if (isKindOf(el, 'View') && el.model === model && !(isKindOf(el._parent, 'View') && el._parent.model === model)) {
        result.push(el)
      }
    }
    return result
  }

  /** All elements of `type` (including subtypes). */
  findByType(type: string): Elem[] {
    return [...this.index.values()].filter((el) => isKindOf(el, type))
  }

  diagrams(): Diagram[] {
    return [...walk(this.rootElement)].filter((el): el is Diagram => isKindOf(el, 'Diagram'))
  }

  /** The diagram flagged `defaultDiagram`, else the first diagram in tree order. */
  defaultDiagram(): Diagram | null {
    const all = this.diagrams()
    return all.find((d) => d.defaultDiagram) ?? all[0] ?? null
  }
}

function refersTo(value: unknown, target: Elem): boolean {
  return Array.isArray(value) ? value.includes(target) : value === target
}

export function childrenOf(el: Elem): Elem[] {
  const result: Elem[] = []
  for (const field of containmentFields(el)) {
    const value = el[field.name]
    if (Array.isArray(value)) {
      for (const child of value) if (isElem(child)) result.push(child)
    } else if (isElem(value)) {
      result.push(value)
    }
  }
  return result
}

/** Depth-first pre-order traversal of the containment tree under `root` (inclusive). */
export function* walk(root: Elem | null | undefined): Generator<Elem> {
  if (!root) return
  const stack: Elem[] = [root]
  while (stack.length > 0) {
    const el = stack.pop() as Elem
    yield el
    const children = childrenOf(el)
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as Elem)
  }
}

export function findContainment(el: Elem): Containment | null {
  const owner = el._parent
  if (!owner) return null
  for (const field of containmentFields(owner)) {
    const value = owner[field.name]
    if (Array.isArray(value)) {
      const index = value.indexOf(el)
      if (index >= 0) return { owner, field: field.name, index }
    } else if (value === el) {
      return { owner, field: field.name, index: -1 }
    }
  }
  return null
}
