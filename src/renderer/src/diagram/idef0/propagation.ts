/**
 * Links between the levels of an IDEF0 model. A boundary arrow on a child diagram stands for an
 * arrow of the parent box (its port's `corresponds`); these helpers keep both levels consistent:
 *
 * - **Upward propagation**: a boundary arrow drawn on a child diagram whose port has no counterpart
 *   adds the matching arrow to the parent box on the parent diagram (role from the port's edge,
 *   same name), and so on level by level up to the A-0 context diagram. An arrow tunneled at its
 *   unconnected end is not propagated.
 * - **Pass-through counterparts**: an arrow of the parent level that only carries a child boundary
 *   arrow (one end on the parent box, the other on a boundary port nothing else uses, no branches)
 *   is removed when its child boundary arrow is tunneled or deleted; the removal goes on upward.
 * - **Child counterparts**: the boundary arrows of a child diagram standing for an arrow of the
 *   decomposed box, with the arrows they feed (deleted with it).
 * - **Linked names**: renaming an arrow renames the arrows that carry the same flow on the other
 *   levels (through ports that carry a single arrow).
 *
 * Everything runs inside the caller's operation, so the gesture and its consequences on other
 * diagrams form one undo step. The downward direction (`syncPorts`) adds ports only for parent
 * arrows without a port, so both directions agree and never duplicate.
 */
import { applyPlan, deleteFromModel, type ModelEngine, type OperationBuilder } from '../../commands'
import {
  IDEF0_AREA,
  diagramOfScope,
  isIdef0Function,
  isKindOf,
  planBoundaryArrow,
  roleOf,
  type Diagram,
  type Elem,
  type NodeView,
  type View
} from '../../model'
import type { TextMeasurer } from '../core'
import { syncGeometry } from '../editor/actions'

export interface LevelEnv {
  readonly engine: ModelEngine
  readonly measurer: TextMeasurer
}

type BoundaryRole = 'input' | 'control' | 'output' | 'mechanism'
const BOUNDARY_ROLES: readonly string[] = ['input', 'control', 'output', 'mechanism']

function list(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

function isPort(el: unknown): el is Elem {
  return !!el && isKindOf(el as Elem, 'IDEF0Port')
}

/** The arrows of a port's scope that start or end at the port. */
export function arrowsAtPort(port: Elem): Elem[] {
  return list(port._parent, 'arrows').filter((a) => a['source'] === port || a['target'] === port)
}

/** Whether `arrow` is tunneled at its end on `port` (its unconnected end). */
function tunneledAt(arrow: Elem, port: Elem): boolean {
  return (arrow['source'] === port ? arrow['tunnelSource'] : arrow['tunnelTarget']) === true
}

/** The diagram drawing the box of `fn` (A-0 for the top function). */
function boxDiagramOf(fn: Elem): Elem | null {
  return diagramOfScope(fn._parent)
}

function nodeViewOf(diagram: Elem | null, model: Elem, type: string): NodeView | null {
  return (list(diagram, 'ownedViews').find((v) => v._type === type && (v as View)['model'] === model) as NodeView | undefined) ?? null
}

/**
 * Where the parent arrow attaches along the side of the parent box: the port's relative position
 * along its edge of the drawing area, mapped onto the box side, so the order of the arrows at the
 * parent box follows the order of the boundary arrows (and the ICOM codes read in the same order).
 */
function alongParentBox(port: Elem, role: BoundaryRole, box: NodeView): number {
  const view = nodeViewOf(diagramOfScope(port._parent), port, 'IDEF0PortView')
  const vertical = role === 'input' || role === 'output'
  const lo = vertical ? IDEF0_AREA.top : IDEF0_AREA.left
  const hi = vertical ? IDEF0_AREA.bottom : IDEF0_AREA.right
  const at = view ? (vertical ? view.top + view.height / 2 : view.left + view.width / 2) : (lo + hi) / 2
  const t = Math.max(0.1, Math.min(0.9, (at - lo) / (hi - lo)))
  return vertical ? box.top + t * box.height : box.left + t * box.width
}

/** Writes the routed geometry of diagrams changed on other levels (the edited diagram syncs itself). */
export function syncLevels(b: OperationBuilder, env: LevelEnv, diagrams: Iterable<Elem>): void {
  for (const diagram of new Set(diagrams)) {
    if (env.engine.repository.contains(diagram)) syncGeometry({ engine: env.engine, diagram: diagram as Diagram, measurer: env.measurer }, b)
  }
}

/**
 * Propagates the boundary port `port` of a child diagram upward: while the port has no
 * counterpart and its arrow is not tunneled at the port, the matching arrow is added to the parent
 * box (with a new boundary port on the parent diagram) and linked through `corresponds`; then the
 * new port is propagated in turn, up to the A-0 context diagram. Returns the arrows added, lowest
 * level first.
 */
export function propagateUp(b: OperationBuilder, env: LevelEnv, port: Elem): Elem[] {
  const added: Elem[] = []
  const touched: Elem[] = []
  let current: Elem | null = port
  for (let guard = 0; current && guard < 64; guard++) {
    const fn = current._parent
    const role = current['role'] as string
    if (!isIdef0Function(fn) || current['corresponds'] || !BOUNDARY_ROLES.includes(role)) break
    const arrows = arrowsAtPort(current)
    if (arrows.length === 0 || arrows.some((a) => tunneledAt(a, current as Elem))) break
    const parentDiagram = boxDiagramOf(fn)
    const box = nodeViewOf(parentDiagram, fn, 'IDEF0FunctionView')
    if (!parentDiagram || !box) break
    const name = arrows.map((a) => (a['name'] as string | undefined) ?? '').find((n) => n !== '') ?? ''
    const plan = planBoundaryArrow(parentDiagram as Diagram, box, role as BoundaryRole, name, alongParentBox(current, role as BoundaryRole, box))
    applyPlan(b, plan)
    const parentArrow = plan.model as Elem
    b.set(current, 'corresponds', parentArrow)
    added.push(parentArrow)
    touched.push(parentDiagram)
    const next = role === 'output' ? parentArrow['target'] : parentArrow['source']
    current = isPort(next) ? next : null
  }
  syncLevels(b, env, touched)
  return added
}

/** The new boundary ports a plan inserted (the free end of an arrow drawn to or from empty canvas). */
export function insertedPorts(plan: { readonly insertions: ReadonlyArray<{ readonly field: string; readonly element: Elem }> }): Elem[] {
  return plan.insertions.filter((i) => i.field === 'ports').map((i) => i.element)
}

/**
 * The boundary port of `arrow` when the arrow is a pure pass-through of its level: one end on a
 * box, the other on a port of the same scope that carries nothing but this arrow, no branches, and
 * no child port other than those in `excluded` standing for it. Null otherwise.
 */
export function passThroughPort(arrow: Elem, excluded: ReadonlySet<Elem> = new Set()): Elem | null {
  if (!isKindOf(arrow, 'IDEF0Arrow') || roleOf(arrow) === 'call') return null
  const source = arrow['source'] as Elem | null
  const target = arrow['target'] as Elem | null
  const box = isIdef0Function(target) ? target : isIdef0Function(source) ? source : null
  const port = box === target ? source : target
  if (!box || !isPort(port) || port._parent !== arrow._parent) return null
  const live = (a: Elem): boolean => a !== arrow && !excluded.has(a)
  const others = list(arrow._parent, 'arrows').filter(live)
  if (others.some((a) => a['source'] === arrow || a['target'] === arrow || a['source'] === port || a['target'] === port)) return null
  if (list(box, 'ports').some((p) => !excluded.has(p) && p['corresponds'] === arrow)) return null
  return port
}

/**
 * The chain of pass-through counterparts above the child port `port` (arrow, port, arrow, port,
 * ...), bottom up. `excluded` holds the elements already going away or being unlinked.
 */
export function counterpartChain(port: Elem, excluded: ReadonlySet<Elem>): Elem[] {
  const chain: Elem[] = []
  const gone = new Set(excluded)
  gone.add(port)
  let current: Elem = port
  for (let guard = 0; guard < 64; guard++) {
    const parent = current['corresponds'] as Elem | null
    if (!parent) break
    const parentPort = passThroughPort(parent, gone)
    if (!parentPort) break
    chain.push(parent, parentPort)
    gone.add(parent).add(parentPort)
    current = parentPort
  }
  return chain
}

/**
 * Removes the pass-through counterparts above `port` (see `counterpartChain`) with their views, in
 * the running operation. Returns the removed elements.
 */
export function removeCounterpartsUp(b: OperationBuilder, env: LevelEnv, port: Elem, excluded: ReadonlySet<Elem> = new Set()): Elem[] {
  const chain = counterpartChain(port, excluded)
  if (chain.length === 0) return chain
  const diagrams = chain.map((el) => diagramOfScope(el._parent)).filter((d): d is Elem => !!d)
  deleteFromModel(env.engine, chain)
  syncLevels(b, env, diagrams)
  return chain
}

/**
 * The child boundary arrows standing for `arrow` one level down: for every box end of `arrow` that
 * is decomposed, the ports of its child diagram linked to `arrow`, with the arrows (and their
 * branches) they feed. Used to cascade a deletion downward.
 */
export function childCounterparts(arrow: Elem): { ports: Elem[]; arrows: Elem[] } {
  const ports: Elem[] = []
  const arrows: Elem[] = []
  for (const end of [arrow['source'], arrow['target']] as Array<Elem | null>) {
    if (!isIdef0Function(end) || !end['childDiagram']) continue
    for (const port of list(end, 'ports')) {
      if (port['corresponds'] !== arrow || ports.includes(port)) continue
      ports.push(port)
      const queue = arrowsAtPort(port)
      while (queue.length > 0) {
        const a = queue.shift() as Elem
        if (arrows.includes(a)) continue
        arrows.push(a)
        queue.push(...list(end, 'arrows').filter((x) => x['source'] === a || x['target'] === a))
      }
    }
  }
  return { ports, arrows }
}

/**
 * The arrows carrying the same flow as `arrow` on the other levels: up through its boundary port's
 * counterpart, down through the child ports linked to it; only through ports that carry a single
 * arrow (a port feeding a join of several arrows is not one flow).
 */
export function linkedArrows(arrow: Elem): Elem[] {
  const seen = new Set<Elem>([arrow])
  const queue = [arrow]
  while (queue.length > 0) {
    const a = queue.shift() as Elem
    const next: Elem[] = []
    for (const end of [a['source'], a['target']] as Array<Elem | null>) {
      if (isPort(end)) {
        const up = end['corresponds'] as Elem | null
        if (up && arrowsAtPort(end).length === 1) next.push(up)
      } else if (isIdef0Function(end)) {
        for (const port of list(end, 'ports')) {
          if (port['corresponds'] !== a) continue
          const fed = arrowsAtPort(port)
          if (fed.length === 1) next.push(fed[0] as Elem)
        }
      }
    }
    for (const n of next) {
      if (seen.has(n) || roleOf(n) === 'call') continue
      seen.add(n)
      queue.push(n)
    }
  }
  seen.delete(arrow)
  return [...seen]
}

/** Gives the arrows linked to `arrow` on other levels its name (inside the rename operation). */
export function syncLinkedNames(b: OperationBuilder, arrow: Elem): void {
  if (!isKindOf(arrow, 'IDEF0Arrow')) return
  const name = (arrow['name'] as string | undefined) ?? ''
  for (const other of linkedArrows(arrow)) if (other['name'] !== name) b.set(other, 'name', name)
}
