/** Test helpers: a fresh project with an engine and a deterministic text measurer. */
import { createEdge, createNode, ModelEngine } from '../commands'
import { createDefaultProject, Repository, type Diagram, type EdgeKind, type NodeKind, type View } from '../model'
import { FixedWidthTextMeasurer } from './core'
import type { DiagramEnv } from './editor/actions'
import { computeDiagramLayout } from './layout/layoutDiagram'
import type { DiagramLayout } from './layout/types'
import { ensureNotations } from './notations'

/** Character widths of the default 13 px font with the test measurer (regular, bold). */
export const CHAR = 13 * 0.6
export const BOLD_CHAR = CHAR * 1.1
/** Width of a bold name compartment line of `n` characters (5 padding on each side). */
export const nameWidth = (n: number): number => Math.ceil(n * BOLD_CHAR) + 10

export interface TestDiagram extends DiagramEnv {
  readonly repository: Repository
  node(kind: NodeKind, left: number, top: number, width?: number, height?: number): View
  edge(kind: EdgeKind, tail: View, head: View): View
  layout(): DiagramLayout
}

export function testDiagram(): TestDiagram {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const diagram = repository.defaultDiagram() as Diagram
  const measurer = new FixedWidthTextMeasurer()
  return {
    engine,
    diagram,
    measurer,
    repository,
    node(kind, left, top, width, height) {
      const plan = createNode(engine, { kind, diagram, left, top, ...(width ? { width } : {}), ...(height ? { height } : {}) })
      return plan.view as View
    },
    edge(kind, tail, head) {
      return createEdge(engine, { kind, diagram, tail, head }).view as View
    },
    layout() {
      return computeDiagramLayout(diagram, repository, measurer)
    }
  }
}
