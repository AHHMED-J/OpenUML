/**
 * The showcase model "Release a Software Change": an A-0 context diagram, an A0 decomposition with
 * six boxes and, below A3, a two-box A3 diagram (A31, A32). It is built through the same
 * operations as the editor (decomposition, boundary arrows with upward propagation, forks, joins,
 * call and tunnel), so it also exercises them. Everything here is original wording; the committed
 * `examples/software-release-idef0.mdj` is the output of `buildReleaseExample()` (see the test).
 *
 * Content, in short: a change request is triaged (A1), planned (A2), built and tested (A3),
 * approved (A4), deployed (A5) and monitored (A6). Rework flows back from the approval to the
 * build (feedback), lessons learned flow back to planning (feedback), the release policy controls
 * two boxes (fork), the schedule joins the approved build on its way to deployment (join),
 * deployment reuses the test suites of A32 (call arrow) and a build farm serves A3 without
 * appearing on its child diagram (tunneled end).
 */
import { applyPlan, ModelEngine, createDiagram } from '../../commands'
import {
  Repository,
  createDefaultProject,
  functionViewsOf,
  planBoundaryArrow,
  planIdef0Arrow,
  type Diagram,
  type Elem,
  type NodeView,
  type Project,
  type View
} from '../../model'
import { FixedWidthTextMeasurer } from '../core'
import { withGeometry, type DiagramEnv } from '../editor/actions'
import { ensureNotations } from '../notations'
import { decomposeFunction } from './decompose'
import { insertedPorts, propagateUp } from './propagation'

export interface ReleaseExample {
  readonly project: Project
  readonly repository: Repository
  readonly model: Elem
  readonly contextDiagram: Diagram
  readonly a0: Diagram
  readonly a3: Diagram
  /** A1 to A6 in order. */
  readonly boxes: readonly Elem[]
}

type Role = 'input' | 'control' | 'output' | 'mechanism'

/** Box slots of A0: six boxes on a compressed staircase with room for arrows between them. */
const A0_BOX = { width: 120, height: 72 }
const A0_STEP = { dx: 140, dy: 88, left: 118, top: 104 }
const A3_BOXES = [
  { left: 200, top: 190, width: 176, height: 96 },
  { left: 560, top: 380, width: 176, height: 96 }
]

export function buildReleaseExample(): ReleaseExample {
  ensureNotations()
  const measurer = new FixedWidthTextMeasurer(0.55)
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const project = repository.project as Project
  const envOf = (diagram: Diagram): DiagramEnv => ({ engine, diagram, measurer })
  const set = (el: Elem, values: Record<string, unknown>): void => {
    engine.transact('Set', (b) => b.setAll(el, values))
  }

  // --- Model, A-0 and A0
  const plan = createDiagram(engine, 'IDEF0Diagram', project)
  const model = plan.model as Elem
  const contextDiagram = plan.diagram as Diagram
  const top = model['topFunction'] as Elem
  set(project, { name: 'Software Release', author: 'OpenUML example' })
  set(model, {
    name: 'Software Release',
    abbreviation: 'SR',
    purpose: 'Show how a change becomes a monitored release.',
    viewpoint: 'Release manager.'
  })
  set(top, { name: 'Release a Software Change' })
  set(contextDiagram, { author: 'OpenUML example', status: 'recommended' })

  // The A-0 box is widened so that its many arrow labels sit side by side.
  const topView = functionViewsOf(contextDiagram)[0] as NodeView
  engine.transact('Resize', (b) => b.setAll(topView, { left: 170, width: 640 }))
  const a0 = decomposeFunction(engine, top, 6)
  set(a0, { author: 'OpenUML example', status: 'recommended' })
  const names = ['Triage Change Request', 'Plan Release', 'Build and Test Change', 'Approve Release', 'Deploy to Production', 'Monitor and Review Release']
  const functions = (top['functions'] as Elem[]).slice().sort((x, y) => (x['boxNumber'] as number) - (y['boxNumber'] as number))
  functions.forEach((fn, i) => set(fn, { name: names[i] }))
  withGeometry(envOf(a0), 'Layout', (b) => {
    functionViewsOf(a0)
      .sort((x, y) => ((x.model as Elem)['boxNumber'] as number) - ((y.model as Elem)['boxNumber'] as number))
      .forEach((v, i) => b.setAll(v, { left: A0_STEP.left + i * A0_STEP.dx, top: A0_STEP.top + i * A0_STEP.dy, ...A0_BOX }))
  })
  const boxView = (diagram: Diagram, fn: Elem): View => functionViewsOf(diagram).find((v) => v.model === fn) as View
  const [a1, a2, a3, a4, a5, a6] = functions as [Elem, Elem, Elem, Elem, Elem, Elem]
  const vb = (fn: Elem): View => boxView(a0, fn)
  const centerX = (v: View): number => (v as NodeView).left + (v as NodeView).width / 2
  const centerY = (v: View): number => (v as NodeView).top + (v as NodeView).height / 2

  // Arrows are added one operation at a time; boundary arrows on a child diagram propagate upward.
  const boundary = (diagram: Diagram, fn: Elem, role: Role, name: string, along?: number): View => {
    const view = boxView(diagram, fn)
    const at = along ?? (role === 'input' || role === 'output' ? centerY(view) : centerX(view))
    const arrowPlan = planBoundaryArrow(diagram, view, role, name, at)
    withGeometry(envOf(diagram), 'Add Boundary Arrow', (b) => {
      applyPlan(b, arrowPlan)
      for (const port of insertedPorts(arrowPlan)) propagateUp(b, { engine, measurer }, port)
    })
    return arrowPlan.view as View
  }
  const connect = (diagram: Diagram, tail: View, head: View, role: Role, name = ''): View => {
    const arrowPlan = planIdef0Arrow({ diagram, tail, head, role, name })
    withGeometry(envOf(diagram), 'Create Arrow', (b) => applyPlan(b, arrowPlan))
    return arrowPlan.view as View
  }

  /** Moves a label to the other side of its line (the default side collides with a neighbouring arrow). */
  const leftOfLine = (arrowView: View, distance: number): void => {
    const label = (arrowView as Elem)['nameLabel'] as Elem
    engine.transact('Move Label', (b) => b.setAll(label, { alpha: -Math.PI / 2, distance }))
  }

  // --- A0 arrows
  boundary(a0, a1, 'input', 'Change Request')
  const policy = boundary(a0, a1, 'control', 'Release Policy')
  connect(a0, policy, vb(a2), 'control')
  leftOfLine(connect(a0, vb(a1), vb(a2), 'input', 'Prioritized Change'), 100)
  connect(a0, vb(a2), vb(a3), 'input', 'Build Assignment')
  boundary(a0, a3, 'control', 'Quality Standards')
  leftOfLine(boundary(a0, a3, 'mechanism', 'Engineers', centerX(vb(a3)) - 50), 38)
  const pool = boundary(a0, a3, 'mechanism', 'Build Farm', centerX(vb(a3)) + 38)
  connect(a0, vb(a3), vb(a4), 'input', 'Package')
  connect(a0, vb(a4), vb(a3), 'input', 'Rework Request')
  boundary(a0, a4, 'control', 'Approval Rules')
  boundary(a0, a4, 'mechanism', 'Review Board')
  const approved = connect(a0, vb(a4), vb(a5), 'input', 'Sign-off')
  connect(a0, vb(a2), approved, 'input', 'Release Schedule')
  boundary(a0, a5, 'control', 'Change Window')
  boundary(a0, a5, 'mechanism', 'Pipeline')
  connect(a0, vb(a5), vb(a6), 'input', 'Rollout')
  boundary(a0, a5, 'output', 'Released Software', centerY(vb(a5)) - 16)
  boundary(a0, a6, 'control', 'Targets')
  connect(a0, vb(a6), vb(a2), 'control', 'Lessons Learned')
  boundary(a0, a6, 'output', 'Metrics')

  // The pool serves A3 itself: the arrow is tunneled at the box and has no boundary arrow below.
  const poolArrow = pool.model as Elem
  engine.transact('Tunnel', (b) => b.set(poolArrow, 'tunnelTarget', true))

  // --- A3: two boxes, seeded with the boundary arrows of A3, then refined.
  const a3Diagram = decomposeFunction(engine, a3, 2)
  set(a3Diagram, { author: 'OpenUML example', status: 'recommended' })
  const children = (a3['functions'] as Elem[]).slice().sort((x, y) => (x['boxNumber'] as number) - (y['boxNumber'] as number)) as [Elem, Elem]
  set(children[0], { name: 'Assemble Build' })
  set(children[1], { name: 'Run Test Suites' })
  withGeometry(envOf(a3Diagram), 'Layout', (b) => {
    boxViews(a3Diagram).forEach((v, i) => b.setAll(v, A3_BOXES[i] as Record<string, number>))
  })
  const [c1, c2] = children
  const wb = (fn: Elem): View => boxView(a3Diagram, fn)
  connect(a3Diagram, wb(c1), wb(c2), 'input', 'Build Candidate')
  connect(a3Diagram, wb(c2), wb(c1), 'control', 'Test Failures')
  // Calls: deployment reuses the test suites for its smoke checks.
  const callPlan = planIdef0Arrow({ diagram: a0, tail: vb(a5), head: wb(c2), call: true })
  withGeometry(envOf(a0), 'Create Call Arrow', (b) => applyPlan(b, callPlan))
  set(a0, { name: a0['name'] })
  return { project, repository, model, contextDiagram, a0, a3: a3Diagram, boxes: functions }

  function boxViews(diagram: Diagram): NodeView[] {
    return functionViewsOf(diagram).sort((x, y) => ((x.model as Elem)['boxNumber'] as number) - ((y.model as Elem)['boxNumber'] as number))
  }
}
