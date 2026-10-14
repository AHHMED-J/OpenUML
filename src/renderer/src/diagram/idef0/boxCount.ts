/**
 * Changing the number of boxes of a decomposition ("Set Number of Child Boxes"). Adding boxes
 * appends numbered boxes and removing boxes reuses the delete gesture of `deletion.ts`
 * (`deleteIdef0Views`): the box leaves with its sub-tree (its child diagrams), arrows that only
 * touched it or boundary ports go with it, arrows that also reach another box turn into boundary
 * arrows (propagated to the parent box so the levels stay consistent), and the boundary
 * counterparts on other levels follow the existing propagation rules.
 * Every change is one undo step.
 */
import {
  IDEF0_AREA,
  createElement,
  functionViewsOf,
  isContextDiagram,
  isKindOf,
  nextName,
  planCloseGaps,
  scopeOf,
  staircaseBox,
  staircaseOrder,
  type Elem,
  type NodeView
} from '../../model'
import { withGeometry, type DiagramEnv } from '../editor/actions'
import { deleteIdef0Views } from './deletion'
import { propagateUp } from './propagation'

/** Most boxes of a decomposition (IDEF0 recommends 3 to 6). */
const MAX_CHILD_BOXES = 6

/** A box of a decomposition as offered for removal. */
export interface ChildBoxInfo {
  readonly fn: Elem
  readonly view: NodeView
  /** Number of arrows ending or starting at the box. */
  readonly arrows: number
  /** The box has its own child diagram (it is removed with it). */
  readonly decomposed: boolean
}

function scopeFunction(diagram: Elem): Elem {
  const scope = scopeOf(diagram)
  if (!scope || isContextDiagram(diagram)) throw new Error('Only a decomposition diagram has child boxes')
  return scope
}

/** The boxes of a decomposition in staircase (numbering) order, with what removing each would lose. */
export function childBoxes(diagram: Elem): ChildBoxInfo[] {
  const scope = scopeFunction(diagram)
  const arrows = ((scope['arrows'] as Elem[] | undefined) ?? []).filter((a) => isKindOf(a, 'IDEF0Arrow'))
  const views = functionViewsOf(diagram).filter((v) => (v.model as Elem)._parent === scope)
  return staircaseOrder(views).map((view) => {
    const fn = view.model as Elem
    return {
      fn,
      view,
      arrows: arrows.filter((a) => a['source'] === fn || a['target'] === fn).length,
      decomposed: !!fn['childDiagram']
    }
  })
}

/** Whether the views still sit where the default staircase of `count` boxes puts them (untouched by hand). */
function isDefaultStaircase(views: readonly NodeView[], count: number): boolean {
  return views.every((v, i) => {
    const s = staircaseBox(i, count)
    return v.left === s.left && v.top === s.top && v.width === s.width && v.height === s.height
  })
}

/**
 * Where an extra box goes when the existing boxes were arranged by hand: one step further along
 * the last step of the diagonal, kept inside the sheet.
 */
function appendedBox(views: readonly NodeView[], index: number, total: number): { left: number; top: number; width: number; height: number } {
  const last = views[views.length - 1]
  const prev = views[views.length - 2]
  const base = staircaseBox(index, total)
  if (!last) return base
  const dx = prev ? last.left - prev.left : 280
  const dy = prev ? last.top - prev.top : 150
  const steps = index - (views.length - 1)
  const width = last.width
  const height = last.height
  const left = Math.max(IDEF0_AREA.left + 16, Math.min(IDEF0_AREA.right - 16 - width, last.left + Math.max(dx, 0) * steps))
  const top = Math.max(IDEF0_AREA.top + 16, Math.min(IDEF0_AREA.bottom - 16 - height, last.top + Math.max(dy, 0) * steps))
  return { left, top, width, height }
}

/** Appends `count` boxes to a decomposition; returns the new functions. */
export function addChildBoxes(env: DiagramEnv, count: number): Elem[] {
  const diagram = env.diagram
  const scope = scopeFunction(diagram)
  const views = staircaseOrder(functionViewsOf(diagram).filter((v) => (v.model as Elem)._parent === scope))
  const old = views.length
  const total = Math.min(MAX_CHILD_BOXES, old + Math.max(0, Math.round(count)))
  if (total === old) return []
  const relayout = isDefaultStaircase(views, old)
  return withGeometry(env, 'Set Number of Child Boxes', (b) => {
    if (relayout) views.forEach((v, i) => b.setAll(v, staircaseBox(i, total)))
    const added: Elem[] = []
    const siblings = [...((scope['functions'] as Elem[] | undefined) ?? [])]
    for (let i = old; i < total; i++) {
      const fn = createElement('IDEF0Function', { name: nextName(siblings, 'New Function '), boxNumber: i + 1 })
      siblings.push(fn)
      added.push(fn)
      b.insert(scope, 'functions', fn)
      const bounds = relayout ? staircaseBox(i, total) : appendedBox(views, i, total)
      b.insert(diagram, 'ownedViews', createElement<NodeView>('IDEF0FunctionView', { model: fn, ...bounds }))
    }
    return added
  })
}

/**
 * Removes the given boxes of a decomposition (never all of them) with the delete-function rules,
 * then closes the gaps in the numbers of the remaining boxes (they keep their relative order, 1..n).
 * Returns the number of boxes removed.
 */
export function removeChildBoxes(env: DiagramEnv, doomed: readonly Elem[]): number {
  const diagram = env.diagram
  const scope = scopeFunction(diagram)
  const boxes = childBoxes(diagram)
  const victims = boxes.filter((c) => doomed.includes(c.fn))
  if (victims.length === 0) return 0
  if (victims.length >= boxes.length) throw new Error('A decomposition keeps at least one box')
  const relayout = isDefaultStaircase(boxes.map((c) => c.view), boxes.length)
  withGeometry(env, 'Set Number of Child Boxes', (b) => {
    const portsBefore = new Set((scope['ports'] as Elem[] | undefined) ?? [])
    deleteIdef0Views(env, victims.map((v) => v.view))
    // Arrows that used to reach a removed box now leave or enter the decomposition through a new
    // boundary arrow; the parent box gets its counterpart so both levels stay consistent (no W08).
    for (const port of (scope['ports'] as Elem[] | undefined) ?? []) if (!portsBefore.has(port)) propagateUp(b, env, port)
    const rest = staircaseOrder(functionViewsOf(diagram).filter((v) => (v.model as Elem)._parent === scope))
    if (relayout) rest.forEach((v, i) => b.setAll(v, staircaseBox(i, rest.length)))
    for (const change of planCloseGaps((scope['functions'] as Elem[] | undefined) ?? [])) b.set(change.fn, 'boxNumber', change.boxNumber)
  })
  return victims.length
}
