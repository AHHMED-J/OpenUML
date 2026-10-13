/**
 * Links between the levels of an IDEF0 model. A boundary arrow on a child diagram stands for an
 * arrow of the parent box (its port's `corresponds`); these helpers keep both levels consistent:
 *
 * - **Pass-through counterparts**: an arrow of the parent level that only carries a child boundary
 *   arrow (one end on the parent box, the other on a boundary port nothing else uses, no branches)
 *   goes when its child boundary arrow is deleted; the removal goes on upward.
 * - **Child counterparts**: the boundary arrows of a child diagram standing for an arrow of the
 *   decomposed box, with the arrows they feed.
 *
 * Everything runs inside the caller's operation, so the gesture and its consequences on other
 * diagrams form one undo step.
 */
import { deleteFromModel, type ModelEngine, type OperationBuilder } from '../../commands'
import { diagramOfScope, isIdef0Function, isKindOf, roleOf, type Diagram, type Elem } from '../../model'
import type { TextMeasurer } from '../core'
import { syncGeometry } from '../editor/actions'

export interface LevelEnv {
  readonly engine: ModelEngine
  readonly measurer: TextMeasurer
}

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

/** Writes the routed geometry of diagrams changed on other levels (the edited diagram syncs itself). */
export function syncLevels(b: OperationBuilder, env: LevelEnv, diagrams: Iterable<Elem>): void {
  for (const diagram of new Set(diagrams)) {
    if (env.engine.repository.contains(diagram)) syncGeometry({ engine: env.engine, diagram: diagram as Diagram, measurer: env.measurer }, b)
  }
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
