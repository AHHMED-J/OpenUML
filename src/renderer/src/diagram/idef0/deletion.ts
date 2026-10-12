/**
 * Deleting IDEF0 views (spec 11 §3.4): deleting a box removes the box with its sub-tree; arrows
 * that only touched boundary ports or nothing else are removed with it, arrows that also reach
 * another box turn into boundary arrows with a new port; deleting an arrow with branches promotes
 * its first branch to the trunk.
 */
import { deleteFromModel, type OperationBuilder } from '../../commands'
import { IDEF0_AREA, createElement, isKindOf, portBounds, roleOf, type Elem, type Idef0Role, type NodeView, type View } from '../../model'
import { withGeometry, type DiagramEnv } from '../editor/actions'

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
  const lo = (vertical ? IDEF0_AREA.top : IDEF0_AREA.left) + 16
  const hi = (vertical ? IDEF0_AREA.bottom : IDEF0_AREA.right) - 16
  const view = createElement<NodeView>('IDEF0PortView', { model: port, ...portBounds(role, Math.max(lo, Math.min(hi, Math.round(along / 8) * 8))) })
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
    deleteFunctions(b, env, scope, functions, doomed)
    for (const arrow of [...doomed]) if (isKindOf(arrow, 'IDEF0Arrow')) promoteBranches(b, env, scope, arrow, doomed)
    // Branches of a doomed arrow that could not be promoted go with it (deleteFromModel cascades references).
    const targets: Elem[] = [...functions, ...doomed]
    // A boundary port left with no arrow and no counterpart is removed with its arrow.
    for (const arrow of doomed) {
      for (const end of [arrow['source'], arrow['target']] as Array<Elem | null>) {
        if (!end || end._type !== 'IDEF0Port' || doomed.has(end) || end['corresponds']) continue
        const stillUsed = arrowsOf(scope).some((a) => !doomed.has(a) && (a['source'] === end || a['target'] === end))
        if (!stillUsed) targets.push(end)
      }
    }
    deleteFromModel(env.engine, targets)
  })
  return rest.filter((v) => !v._type.startsWith('IDEF0'))
}
