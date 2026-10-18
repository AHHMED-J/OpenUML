/**
 * IDEF0 model edits that span several elements: decomposing a box, synchronizing boundary arrows
 * with the parent box, renumbering and tunneling. Each function is one undoable operation.
 */
import { applyPlan, type ModelEngine } from '../../commands'
import {
  isContextDiagram,
  isIdef0Function,
  planBoundaryArrow,
  planBoxNumberSwap,
  planDecompose,
  planRenumber,
  type Diagram,
  type Elem,
  type View
} from '../../model'
import { syncGeometry, withGeometry, type DiagramEnv } from '../editor/actions'
import type { TextMeasurer } from '../core'
import { getTextMeasurer } from '../layout/measurer'
import { addMissingPorts, missingPorts } from './assignment'
import { insertedPorts, propagateUp, removeCounterpartsUp } from './propagation'

/** Decomposes `fn` into `count` boxes, its arrows pending on the frame edge; returns the new child diagram. */
export function decomposeFunction(engine: ModelEngine, fn: Elem, count = 3): Diagram {
  const plan = planDecompose(fn, count)
  engine.transact('Decompose', (b) => {
    applyPlan(b, plan)
    syncGeometry({ engine, diagram: plan.diagram, measurer: getTextMeasurer() }, b)
  })
  return plan.diagram
}

/**
 * Adds the boundary ports a child diagram lacks for the untunneled arrows of its parent box, as
 * pending arrows (ports without a parent arrow are left alone). Every geometry operation does this
 * too (`normalize` hook); the command catches up a diagram nothing has edited yet. Returns the
 * number of ports added.
 */
export function syncPorts(engine: ModelEngine, diagram: Elem): number {
  const fn = diagram._parent
  if (!isIdef0Function(fn) || isContextDiagram(diagram) || missingPorts(fn).length === 0) return 0
  return engine.transact('Synchronize Boundary Arrows', (b) => addMissingPorts(b, fn))
}

/** Renumbers the boxes of a diagram along the staircase regardless of `autoNumber`. Returns the number of changes. */
export function renumberBoxes(engine: ModelEngine, diagram: Elem): number {
  const changes = planRenumber(diagram)
  if (changes.length === 0) return 0
  engine.transact('Renumber Boxes', (b) => {
    for (const change of changes) b.set(change.fn, 'boxNumber', change.boxNumber)
  })
  return changes.length
}

/**
 * Gives box `fn` the number `boxNumber` (Properties > Box Number), swapping with the box that had
 * it, in one undo step. Node numbers of its sub-tree, ICOM codes, titles and labels are derived and
 * follow. Returns the number of boxes renumbered (0 when unchanged); throws a `ModelRuleError` for
 * a number outside the diagram's range or the A-0 box.
 */
export function setBoxNumber(engine: ModelEngine, fn: Elem, boxNumber: number): number {
  const changes = planBoxNumberSwap(fn, boxNumber)
  if (changes.length === 0) return 0
  engine.transact('Change Box Number', (b) => {
    for (const change of changes) b.set(change.fn, 'boxNumber', change.boxNumber)
  })
  return changes.length
}

/**
 * Adds a boundary arrow of `role` to a function box (port aligned with the box, label to be
 * typed); on a child diagram it is propagated to the parent box in the same undo step.
 */
export function addBoundaryArrow(env: DiagramEnv, fnView: View, role: 'input' | 'control' | 'output' | 'mechanism'): string | null {
  const plan = planBoundaryArrow(env.diagram, fnView, role)
  withGeometry(env, 'Add Boundary Arrow', (b) => {
    applyPlan(b, plan)
    for (const port of insertedPorts(plan)) propagateUp(b, env, port)
  })
  return plan.view?._id ?? null
}

/**
 * Toggles the tunnel at one end of an arrow. Tunneling a port end (the unconnected end: the flow
 * is not needed at the parent level) unlinks the port and removes its parent counterpart when that
 * only carried this arrow (up through every level); untunneling it propagates the arrow up again.
 */
export function toggleTunnel(engine: ModelEngine, arrow: Elem, end: 'source' | 'target', measurer: TextMeasurer = getTextMeasurer()): void {
  const flag = end === 'source' ? 'tunnelSource' : 'tunnelTarget'
  const next = !arrow[flag]
  const env = { engine, measurer }
  engine.transact('Tunnel Arrow End', (b) => {
    b.set(arrow, flag, next)
    const other = arrow[end] as Elem | null
    if (!other || other._type !== 'IDEF0Port') return
    if (next) {
      removeCounterpartsUp(b, env, other)
      b.set(other, 'corresponds', null)
    } else {
      propagateUp(b, env, other)
    }
  })
}


