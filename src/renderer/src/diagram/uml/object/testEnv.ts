/** Test helper for the structural diagram families: a project with one diagram of a given kind. */
import { createDiagram, createEdge, createNode, ModelEngine } from '../../../commands'
import {
  createDefaultProject,
  Repository,
  type Diagram,
  type DiagramKind,
  type EdgeKind,
  type Elem,
  type NodeKind,
  type View
} from '../../../model'
import { FixedWidthTextMeasurer } from '../../core'
import type { DiagramEnv } from '../../editor/actions'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../../layout/types'
import { ensureNotations } from '../../notations'

export interface StructureTest extends DiagramEnv {
  readonly repository: Repository
  /** The default model package (owner of the created diagram's wrapper). */
  readonly model: Elem
  node(kind: NodeKind, left: number, top: number, extra?: { width?: number; height?: number; container?: View; name?: string }): View
  edge(kind: EdgeKind, tail: View, head: View, extra?: { messageSort?: string; name?: string }): View
  layout(): DiagramLayout
  nodeLayout<D = unknown>(view: View): NodeLayout<D>
  edgeLayout<D = unknown>(view: View): EdgeLayout<D>
}

export function structureTest(kind: DiagramKind): StructureTest {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const model = (repository.root?.['ownedElements'] as Elem[])[0] as Elem
  const diagram = createDiagram(engine, kind, model).diagram as Diagram
  const measurer = new FixedWidthTextMeasurer()
  const layout = (): DiagramLayout => computeDiagramLayout(diagram, repository, measurer)
  return {
    engine,
    diagram,
    measurer,
    repository,
    model,
    node(k, left, top, extra = {}) {
      return createNode(engine, {
        kind: k,
        diagram,
        left,
        top,
        ...(extra.width ? { width: extra.width } : {}),
        ...(extra.height ? { height: extra.height } : {}),
        ...(extra.container ? { container: extra.container } : {}),
        ...(extra.name ? { name: extra.name } : {})
      }).view as View
    },
    edge(k, tail, head, extra = {}) {
      return createEdge(engine, { kind: k, diagram, tail, head, ...(extra.messageSort ? { messageSort: extra.messageSort } : {}), ...(extra.name ? { name: extra.name } : {}) }).view as View
    },
    layout,
    nodeLayout<D>(view: View) {
      const l = layout().nodes.get(view._id)
      if (!l) throw new Error(`no node layout for ${view._type}`)
      return l as NodeLayout<D>
    },
    edgeLayout<D>(view: View) {
      const l = layout().edges.get(view._id)
      if (!l) throw new Error(`no edge layout for ${view._type}`)
      return l as EdgeLayout<D>
    }
  }
}
