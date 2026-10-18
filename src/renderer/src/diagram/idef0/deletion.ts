/**
 * Deleting IDEF0 views (spec 11 §3.4): deleting a box removes the box with its sub-tree; arrows
 * that only touched boundary ports or nothing else are removed with it, arrows that also reach
 * another box turn into boundary arrows with a new port; deleting an arrow with branches promotes
 * its first branch to the trunk.
 *
 * Across levels: deleting an arrow attached to a decomposed box also deletes the boundary arrows
 * standing for it on the child diagram (their port and the arrows it feeds), level by level down.
 * Deleting a boundary arrow of a child diagram whose port stands for a parent arrow leaves the
 * port as a pending arrow (the parent level is not touched); an unlinked port left with no arrow
 * goes with it. Deleting the port itself removes, when the parent box's counterpart only carried
 * that flow (a pass-through boundary arrow nothing else uses), that counterpart too, level by level
 * up; when the counterpart is still used on its own level (connected to another box, branched, or
 * feeding other arrows) the port stays, pending, since the parent arrow still needs it.
 */
import { deleteFromModel, type ModelEngine, type OperationBuilder } from '../../commands'
import { createElement, diagramOfScope, drawingAreaOf, isKindOf, listField, planCloseGaps, portBounds, roleOf, type Diagram, type Elem, type Idef0Role, type NodeView, type View } from '../../model'
import type { TextMeasurer } from '../core'
import { withGeometry, type DiagramEnv } from '../editor/actions'
import { childCounterparts, counterpartChain, syncLevels } from './propagation'

function arrowsOf(scope: Elem): Elem[] {
  return ((scope['arrows'] as Elem[] | undefined) ?? []).filter((a) => isKindOf(a, 'IDEF0Arrow'))
}

function arrowViewsOf(env: DiagramEnv, arrow: Elem): View[] {
  return env.engine.repository.viewsOf(arrow).filter((v) => v._type === 'IDEF0ArrowView')
}

/** Branches hanging off `trunk`: forks (source is the trunk) and joins (target is the trunk). */
function branchesOf(scope: Elem, trunk: Elem): { forks: Elem[]; joins: Elem[] } {
  const arrows = arrowsOf(scope)
  return { forks: arrows.filter((a) => a['source'] === trunk), joins: arrows.filter((a) => a['target'] === trunk) }
}

/** Re-points the branches of `trunk` so that the first branch of each kind takes its place. */
function promoteBranches(b: OperationBuilder, env: DiagramEnv, scope: Elem, trunk: Elem, doomed: Set<Elem>): void {
  const { forks, joins } = branchesOf(scope, trunk)
  const trunkViews = arrowViewsOf(env, trunk)
  const trunkView = trunkViews[0] as View | undefined
  const live = (a: Elem): boolean => !doomed.has(a)
  const [firstFork, ...otherForks] = forks.filter(live)
  if (firstFork) {
    b.set(firstFork, 'source', trunk['source'])
    for (const v of arrowViewsOf(env, firstFork)) b.set(v, 'tail', trunkView?.['tail'] ?? null)
    for (const other of otherForks) {
      b.set(other, 'source', firstFork)
      for (const v of arrowViewsOf(env, other)) b.set(v, 'tail', arrowViewsOf(env, firstFork)[0] ?? null)
    }
  }
  const [firstJoin, ...otherJoins] = joins.filter(live)
  if (firstJoin) {
    b.set(firstJoin, 'target', trunk['target'])
    b.set(firstJoin, 'role', trunk['role'])
    for (const v of arrowViewsOf(env, firstJoin)) b.set(v, 'head', trunkView?.['head'] ?? null)
    for (const other of otherJoins) {
      b.set(other, 'target', firstJoin)
      for (const v of arrowViewsOf(env, other)) b.set(v, 'head', arrowViewsOf(env, firstJoin)[0] ?? null)
    }
  }
}

function viewCenter(view: View | null | undefined): { x: number; y: number } {
  const v = view as NodeView | null | undefined
  return v ? { x: v.left + v.width / 2, y: v.top + v.height / 2 } : { x: 0, y: 0 }
}

/** A new boundary port for `arrow`'s end that used to touch a deleted box, aligned with the box at the other end. */
function addBoundaryPort(b: OperationBuilder, env: DiagramEnv, scope: Elem, role: Idef0Role, near: { x: number; y: number }): { port: Elem; view: NodeView } {
  const port = createElement('IDEF0Port', { role })
  b.insert(scope, 'ports', port)
  const vertical = role === 'input' || role === 'output'
  const along = vertical ? near.y : near.x
  const area = drawingAreaOf(env.diagram)
  const lo = (vertical ? area.top : area.left) + 16
  const hi = (vertical ? area.bottom : area.right) - 16
  const view = createElement<NodeView>('IDEF0PortView', { model: port, ...portBounds(role, Math.max(lo, Math.min(hi, Math.round(along / 8) * 8)), area) })
  b.insert(env.diagram, 'ownedViews', view)
  return { port, view }
}

/** Deletes `functionViews`' functions, handling their arrows. */
function deleteFunctions(b: OperationBuilder, env: DiagramEnv, scope: Elem, functions: Elem[], doomed: Set<Elem>): void {
  const repo = env.engine.repository
  for (const fn of functions) {
    for (const arrow of arrowsOf(scope)) {
      if (doomed.has(arrow) || (arrow['source'] !== fn && arrow['target'] !== fn)) continue
      const other = arrow['source'] === fn ? (arrow['target'] as Elem | null) : (arrow['source'] as Elem | null)
      const otherIsBox = !!other && other._type === 'IDEF0Function' && !functions.includes(other)
      if (!otherIsBox || roleOf(arrow) === 'call') {
        doomed.add(arrow)
        continue
      }
      const otherView = repo.viewsOf(other as Elem).find((v) => env.engine.repository.diagramOf(v) === env.diagram) as View | undefined
      const views = arrowViewsOf(env, arrow)
      if (arrow['source'] === fn) {
        const role = roleOf(arrow) as Idef0Role
        const { port, view } = addBoundaryPort(b, env, scope, role === 'output' ? 'input' : role, viewCenter(otherView))
        b.set(arrow, 'source', port)
        for (const v of views) b.set(v, 'tail', view)
      } else {
        const { port, view } = addBoundaryPort(b, env, scope, 'output', viewCenter(otherView))
        b.set(arrow, 'target', port)
        b.set(arrow, 'role', 'output')
        for (const v of views) b.set(v, 'head', view)
      }
    }
  }
  void repo
}

/**
 * Deletes IDEF0 arrows and ports picked outside a diagram (Model Explorer) with the same rules as
 * the delete gesture, one diagram at a time, inside the caller's operation when there is one.
 * Returns the elements left to the generic deletion (other types, or elements without a view).
 */
export function deleteIdef0Elements(engine: ModelEngine, elements: readonly Elem[], measurer: TextMeasurer): Elem[] {
  const rest: Elem[] = []
  const byDiagram = new Map<Diagram, View[]>()
  for (const el of elements) {
    const view = isKindOf(el, 'IDEF0Arrow') || isKindOf(el, 'IDEF0Port') ? engine.repository.viewsOf(el)[0] : undefined
    const diagram = view ? engine.repository.diagramOf(view) : null
    if (!view || !diagram || diagram._type !== 'IDEF0Diagram') {
      rest.push(el)
      continue
    }
    byDiagram.set(diagram, [...(byDiagram.get(diagram) ?? []), view])
  }
  engine.transact('Delete', () => {
    for (const [diagram, views] of byDiagram) {
      const live = views.filter((v) => engine.repository.contains(v))
      if (live.length > 0) deleteIdef0Views({ engine, diagram, measurer }, live)
    }
  })
  return rest
}

/**
 * Handles the IDEF0 part of a delete gesture. Returns the views left to the default deletion
 * (notes and text); the sheet frame is never deleted.
 */
export function deleteIdef0Views(env: DiagramEnv, views: readonly View[]): View[] {
  const scope = env.diagram._parent
  const rest = views.filter((v) => v._type !== 'IDEF0FrameView')
  if (!scope) return []
  const functionViews = rest.filter((v) => v._type === 'IDEF0FunctionView' && v.model)
  const arrowViews = rest.filter((v) => v._type === 'IDEF0ArrowView' && v.model)
  const portViews = rest.filter((v) => v._type === 'IDEF0PortView' && v.model)
  if (functionViews.length + arrowViews.length + portViews.length === 0) return rest.filter((v) => !v._type.startsWith('IDEF0'))
  const contextDiagram = env.diagram['diagramKind'] === 'context'
  const functions = functionViews.map((v) => v.model as Elem).filter((f) => !(contextDiagram && f === scope['topFunction']))
  withGeometry(env, 'Delete', (b) => {
    const doomed = new Set<Elem>()
    for (const v of arrowViews) doomed.add(v.model as Elem)
    for (const v of portViews) {
      const port = v.model as Elem
      doomed.add(port)
      for (const a of arrowsOf(scope)) if (a['source'] === port || a['target'] === port) doomed.add(a)
    }
    // Boundary ports the user deleted: candidates for the upward cascade.
    const touchedPorts = new Set<Elem>(portViews.map((v) => v.model as Elem))
    deleteFunctions(b, env, scope, functions, doomed)
    for (const arrow of [...doomed]) if (isKindOf(arrow, 'IDEF0Arrow')) promoteBranches(b, env, scope, arrow, doomed)
    // Branches of a doomed arrow that could not be promoted go with it (deleteFromModel cascades references).
    const targets: Elem[] = [...functions, ...doomed]
    const gone = new Set<Elem>(targets)
    const otherLevels = new Set<Elem>()
    // Downward: the child boundary arrows standing for a deleted arrow go with it, level by level.
    const queue = [...doomed].filter((a) => isKindOf(a, 'IDEF0Arrow'))
    while (queue.length > 0) {
      const { ports, arrows } = childCounterparts(queue.shift() as Elem)
      for (const el of [...ports, ...arrows]) {
        if (gone.has(el)) continue
        gone.add(el)
        targets.push(el)
        const diagram = diagramOfScope(el._parent)
        if (diagram) otherLevels.add(diagram)
        if (isKindOf(el, 'IDEF0Arrow')) queue.push(el)
      }
    }
    // A boundary port left with no arrow is removed with its arrow unless it stands for a parent
    // arrow (it waits as a pending arrow). A deleted port with a counterpart goes only when that
    // counterpart is a pass-through removed with it (upward cascade); otherwise it stays pending.
    const ends = new Set<Elem>()
    for (const arrow of doomed) for (const end of [arrow['source'], arrow['target']] as Array<Elem | null>) if (end && end._type === 'IDEF0Port') ends.add(end)
    for (const port of [...ends, ...touchedPorts]) {
      const stillUsed = arrowsOf(scope).some((a) => !gone.has(a) && (a['source'] === port || a['target'] === port))
      if (stillUsed) continue
      if (!port['corresponds']) {
        if (!gone.has(port)) {
          gone.add(port)
          targets.push(port)
        }
        continue
      }
      if (!touchedPorts.has(port)) continue
      const chain = counterpartChain(port, gone)
      if (chain.length === 0) {
        gone.delete(port)
        if (targets.includes(port)) targets.splice(targets.indexOf(port), 1)
        continue
      }
      for (const el of [port, ...chain]) {
        if (gone.has(el)) continue
        gone.add(el)
        targets.push(el)
      }
      for (const el of chain) {
        const diagram = diagramOfScope(el._parent)
        if (diagram) otherLevels.add(diagram)
      }
    }
    deleteFromModel(env.engine, targets)
    // Deleting boxes closes the gaps in the numbers of the boxes left (in their order); nothing else
    // renumbers boxes implicitly.
    if (functions.length > 0) for (const change of planCloseGaps(listField(scope, 'functions'))) b.set(change.fn, 'boxNumber', change.boxNumber)
    otherLevels.delete(env.diagram)
    syncLevels(b, env, otherLevels)
  })
  return rest.filter((v) => !v._type.startsWith('IDEF0'))
}
