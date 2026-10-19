/** Test helpers: a fresh project with an IDEF0 model (A-0 plus decomposed A0) and a deterministic measurer. */
import { ModelEngine, createDiagram } from '../../commands'
import { buildOrderExample, type OrderExample } from '../../model/idef0-example'
import { createDefaultProject, Repository, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { FixedWidthTextMeasurer } from '../core'
import type { DiagramEnv } from '../editor/actions'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../layout/types'
import { ensureNotations } from '../notations'
import { assignParentArrow } from './assignment'
import { pendingPorts } from './pending'
import { decomposeFunction } from './decompose'

export interface IdefKit {
  readonly repository: Repository
  readonly engine: ModelEngine
  readonly model: Elem
  readonly top: Elem
  readonly context: Diagram
  /** A0, the decomposition of the top function (3 boxes). */
  readonly child: Diagram
  readonly envOf: (diagram: Diagram) => DiagramEnv
  readonly layoutOf: (diagram: Diagram) => DiagramLayout
  /** Function views of a diagram in box-number order. */
  readonly boxes: (diagram: Diagram) => NodeView[]
}

export const measurer = new FixedWidthTextMeasurer()

function kitOf(repository: Repository, engine: ModelEngine, model: Elem, context: Diagram, child: Diagram): IdefKit {
  const top = model['topFunction'] as Elem
  return {
    repository,
    engine,
    model,
    top,
    context,
    child,
    envOf: (diagram) => ({ engine, diagram, measurer }),
    layoutOf: (diagram) => computeDiagramLayout(diagram, repository, measurer),
    boxes: (diagram) =>
      (diagram.ownedViews.filter((v) => v._type === 'IDEF0FunctionView') as NodeView[]).sort(
        (a, b) => ((a.model as Elem)['boxNumber'] as number) - ((b.model as Elem)['boxNumber'] as number)
      )
  }
}

/** A new model decomposed once: A-0 and A0 with three boxes and no arrows. */
export function newKit(): IdefKit {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const plan = createDiagram(engine, 'IDEF0Diagram', repository.project as Elem)
  const model = plan.model as Elem
  const child = decomposeFunction(engine, model['topFunction'] as Elem, 3)
  return kitOf(repository, engine, model, plan.diagram as Diagram, child)
}

/** The worked example of spec 11 §7 in a repository. */
export function exampleKit(): IdefKit & { readonly example: OrderExample } {
  ensureNotations()
  const example = buildOrderExample()
  const repository = new Repository(example.project)
  const engine = new ModelEngine(repository)
  return { ...kitOf(repository, engine, example.model, example.contextDiagram as Diagram, example.childDiagram as Diagram), example }
}

export function nodeLayoutOf<D>(layout: DiagramLayout, view: View): NodeLayout<D> {
  const l = layout.nodes.get(view._id)
  if (!l) throw new Error(`no node layout for ${view._type}`)
  return l as NodeLayout<D>
}

export function edgeLayoutOf<D>(layout: DiagramLayout, view: View): EdgeLayout<D> {
  const l = layout.edges.get(view._id)
  if (!l) throw new Error(`no edge layout for ${view._type}`)
  return l as EdgeLayout<D>
}

/** The arrow view of the arrow named `name` in `diagram`. */
export function arrowView(diagram: Diagram, name: string): View {
  const v = diagram.ownedViews.find((x) => x._type === 'IDEF0ArrowView' && (x.model as Elem | null)?.['name'] === name)
  if (!v) throw new Error(`no arrow ${name}`)
  return v
}

/**
 * Assigns the pending arrows of the diagram of `env` the way decomposition used to wire them:
 * inputs and mechanisms to the first box, controls forked to every box, outputs from the last box.
 */
export function wireLikeDecompose(env: DiagramEnv): void {
  const boxes = (env.diagram.ownedViews.filter((v) => v._type === 'IDEF0FunctionView') as NodeView[])
    .map((v) => v.model as Elem)
    .sort((a, b) => (a['boxNumber'] as number) - (b['boxNumber'] as number))
  for (const port of pendingPorts(env.diagram)) {
    const role = port['role'] as string
    assignParentArrow(env, port, role === 'control' ? boxes : role === 'output' ? boxes.slice(-1) : boxes.slice(0, 1))
  }
}

/** Decomposes `fn` and wires its pending arrows like decomposition used to (`wireLikeDecompose`). */
export function decomposeWired(k: IdefKit, fn: Elem, count = 3): Diagram {
  const diagram = decomposeFunction(k.engine, fn, count)
  wireLikeDecompose(k.envOf(diagram))
  return diagram
}
