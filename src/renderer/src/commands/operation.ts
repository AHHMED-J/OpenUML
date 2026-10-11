/**
 * Operation records: one user gesture = one operation = one undo step, composed of primitive
 * steps. Steps reference elements by ID and carry JSON values only, so operations stay valid
 * when elements are re-created by undo/redo.
 */
import { decodeFieldValue, ElementReader, type Json, type JsonObject } from '../format'
import { fieldOf, type Elem, type Repository } from '../model'

export type Step =
  /** Insert element: snapshot JSON of the new element and its subtree (registers it). */
  | { readonly op: 'I'; readonly json: JsonObject }
  /** Remove element: snapshot JSON of the removed element and its subtree (unregisters it). */
  | { readonly op: 'R'; readonly json: JsonObject }
  /** Assign field. Values are encoded with `encodeFieldValue`. */
  | { readonly op: 'a'; readonly id: string; readonly field: string; readonly value: Json; readonly old: Json }
  /** Insert `elem` into the list `owner[field]` at `index`. */
  | { readonly op: 'i'; readonly owner: string; readonly field: string; readonly elem: string; readonly index: number }
  /** Remove `elem` (at `index`) from the list `owner[field]`. */
  | { readonly op: 'r'; readonly owner: string; readonly field: string; readonly elem: string; readonly index: number }
  /** Move `elem` within the list `owner[field]` from `oldIndex` to `index`. */
  | {
      readonly op: 'o'
      readonly owner: string
      readonly field: string
      readonly elem: string
      readonly index: number
      readonly oldIndex: number
    }

export type FieldStep = Extract<Step, { op: 'a' | 'i' | 'r' | 'o' }>

export interface Operation {
  readonly id: string
  readonly time: number
  /** Human label shown in Undo/Redo menu items, e.g. "Create Class". */
  readonly name: string
  /** Bypass operations are applied but never enter the undo history. */
  readonly bypass: boolean
  readonly steps: readonly Step[]
}

export class OperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperationError'
  }
}

function invert(step: FieldStep): FieldStep {
  switch (step.op) {
    case 'a':
      return { ...step, value: step.old, old: step.value }
    case 'i':
      return { ...step, op: 'r' }
    case 'r':
      return { ...step, op: 'i' }
    case 'o':
      return { ...step, index: step.oldIndex, oldIndex: step.index }
  }
}

function must(repo: Repository, id: string): Elem {
  const el = repo.get(id)
  if (!el) throw new OperationError(`Element ${id} not found`)
  return el
}

function listOf(owner: Elem, field: string): Elem[] {
  const list = owner[field]
  if (!Array.isArray(list)) throw new OperationError(`${owner._type}.${field} is not a list`)
  return list as Elem[]
}

function applyFieldStep(repo: Repository, step: FieldStep): void {
  switch (step.op) {
    case 'a': {
      const el = must(repo, step.id)
      const def = fieldOf(el, step.field)
      el[step.field] = def ? decodeFieldValue(def, step.value, (id) => repo.get(id)) : step.value
      return
    }
    case 'i': {
      const list = listOf(must(repo, step.owner), step.field)
      list.splice(Math.min(step.index, list.length), 0, must(repo, step.elem))
      return
    }
    case 'r': {
      const list = listOf(must(repo, step.owner), step.field)
      const at = list[step.index]?._id === step.elem ? step.index : list.findIndex((e) => e._id === step.elem)
      if (at < 0) throw new OperationError(`Element ${step.elem} not in ${step.owner}.${step.field}`)
      list.splice(at, 1)
      return
    }
    case 'o': {
      const list = listOf(must(repo, step.owner), step.field)
      const from = list.findIndex((e) => e._id === step.elem)
      if (from < 0) throw new OperationError(`Element ${step.elem} not in ${step.owner}.${step.field}`)
      const [el] = list.splice(from, 1)
      list.splice(Math.min(step.index, list.length), 0, el as Elem)
      return
    }
  }
}

/**
 * Applies (`forward`) or reverts steps against the repository:
 * 1. materialize and register created elements (`I` forward / `R` backward) and resolve their refs;
 * 2. apply field steps in order (inverted and in reverse order when reverting);
 * 3. unregister removed elements (`R` forward / `I` backward).
 */
export function runSteps(repo: Repository, steps: readonly Step[], forward: boolean): void {
  const createOp = forward ? 'I' : 'R'
  const deleteOp = forward ? 'R' : 'I'

  const reader = new ElementReader({ generateId: () => repo.generateId() })
  const created: Elem[] = []
  for (const step of steps) {
    if (step.op !== createOp) continue
    const el = reader.read(step.json)
    if (el) created.push(el)
  }
  for (const el of created) repo.register(el)
  reader.resolve((id) => repo.get(id))

  const fieldSteps = steps.filter((s): s is FieldStep => s.op !== 'I' && s.op !== 'R')
  if (forward) for (const s of fieldSteps) applyFieldStep(repo, s)
  else for (let i = fieldSteps.length - 1; i >= 0; i--) applyFieldStep(repo, invert(fieldSteps[i] as FieldStep))

  for (const step of steps) {
    if (step.op !== deleteOp) continue
    const el = repo.get(step.json['_id'] as string)
    if (el) repo.unregister(el)
  }
}

export function applyOperation(repo: Repository, op: Operation): void {
  runSteps(repo, op.steps, true)
}

export function revertOperation(repo: Repository, op: Operation): void {
  runSteps(repo, op.steps, false)
}
