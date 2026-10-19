import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyPlan, ModelEngine, createDiagram } from '../../commands'
import { readMdj, writeMdj } from '../../format'
import { Repository, createDefaultProject, functionViewsOf, planBoundaryArrow, type Diagram, type EdgeView, type Elem, type NodeView, type Point, type View } from '../../model'
import { FixedWidthTextMeasurer } from '../core'
import { resizeNode, withGeometry, type DiagramEnv } from '../editor/actions'
import { alignViews } from '../editor/alignment'
import { hitTestDiagram } from '../editor/hitTest'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout } from '../layout/types'
import { ensureNotations } from '../notations'
import { addChildBoxes, removeChildBoxes } from './boxCount'
import { decomposeFunction, renumberBoxes } from './decompose'
import type { ArrowData } from './edges'
import { arrowRunAt, hasRouteHints, moveArrowRun, pickReconnect, reconnectIdef0, resetArrowRoutes } from './gestures'
import { busOf, resolveRun, routeArrowDetailed, type RouteEnd } from './routing'
import { hintsOf } from './runs'
import { wireLikeDecompose } from './testkit'

const measurer = new FixedWidthTextMeasurer(0.55)

interface Model {
  readonly repository: Repository
  readonly engine: ModelEngine
  readonly a0: Diagram
  readonly env: DiagramEnv
  readonly layout: () => DiagramLayout
  readonly text: () => string
}

/** A-0 with `controls` controls (plus input, output, mechanism), decomposed into six boxes: every control forks to all of them. */
function forkedModel(controls: number): Model {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const plan = createDiagram(engine, 'IDEF0Diagram', repository.project as Elem)
  const model = plan.model as Elem
  const context = plan.diagram as Diagram
  const box = functionViewsOf(context)[0] as View
  const add = (role: 'input' | 'control' | 'output' | 'mechanism', name: string): void => {
    const p = planBoundaryArrow(context, box, role, name)
    withGeometry({ engine, diagram: context, measurer }, 'Add', (b) => applyPlan(b, p))
  }
  add('input', 'Order')
  for (let i = 0; i < controls; i++) add('control', `Control ${i + 1}`)
  add('output', 'Result')
  add('mechanism', 'Staff')
  const a0 = decomposeFunction(engine, model['topFunction'] as Elem, 6)
  const env = { engine, diagram: a0, measurer }
  wireLikeDecompose(env)
  return {
    repository,
    engine,
    a0,
    env,
    layout: () => computeDiagramLayout(a0, repository, measurer),
    text: () => writeMdj(repository.project as Elem)
  }
}

const arrowViewsOf = (d: Diagram): EdgeView[] => d.ownedViews.filter((v) => v._type === 'IDEF0ArrowView') as EdgeView[]
const named = (d: Diagram, name: string): EdgeView => arrowViewsOf(d).find((v) => v.model?.['name'] === name) as EdgeView
const branchesOf = (d: Diagram, trunk: View): EdgeView[] => arrowViewsOf(d).filter((v) => v.tail === trunk)
const boxesOf = (d: Diagram): NodeView[] => functionViewsOf(d).sort((a, b) => ((a.model as Elem)['boxNumber'] as number) - ((b.model as Elem)['boxNumber'] as number))

/** Horizontal runs (y and x extent) of the arrows of one fork tree, excluding the last run into each box. */
function busRuns(layout: DiagramLayout, views: readonly View[]): Array<{ y: number; x0: number; x1: number }> {
  const out: Array<{ y: number; x0: number; x1: number }> = []
  for (const v of views) {
    const pts = layout.edges.get(v._id)?.points ?? []
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as Point
      const q = pts[i + 1] as Point
      if (p.y === q.y && p.x !== q.x) out.push({ y: p.y, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x) })
    }
  }
  return out
}

describe('IDEF0 route runs: automatic lanes', () => {
  for (const n of [2, 3, 4]) {
    it(`gives each of ${n} forked controls its own horizontal lane`, () => {
      const m = forkedModel(n)
      const layout = m.layout()
      const trees = Array.from({ length: n }, (_, i) => {
        const trunk = named(m.a0, `Control ${i + 1}`)
        return busRuns(layout, [trunk, ...branchesOf(m.a0, trunk)])
      })
      for (const runs of trees) {
        expect(runs.length).toBeGreaterThan(0)
        expect(new Set(runs.map((r) => r.y)).size).toBe(1)
      }
      const ys = trees.map((runs) => (runs[0] as { y: number }).y)
      expect(new Set(ys).size).toBe(n)
      // No two trees share a horizontal line where their runs overlap.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (const a of trees[i] ?? []) for (const b of trees[j] ?? []) if (a.x0 < b.x1 && b.x0 < a.x1) expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(8)
        }
      }
      // The buses stay above the boxes they feed.
      const firstTop = (boxesOf(m.a0)[0] as NodeView).top
      for (const y of ys) expect(y).toBeLessThanOrEqual(firstTop - 12)
    })
  }

  it('keeps the first control where it was and moves only the later ones aside', () => {
    const one = forkedModel(1)
    const three = forkedModel(3)
    const y = (m: Model, name: string): number => (busRuns(m.layout(), branchesOf(m.a0, named(m.a0, name)))[0] as { y: number }).y
    expect(y(three, 'Control 1')).toBe(y(one, 'Control 1'))
  })

  it('lays out the committed Software Release example exactly as stored (no hints, no lane changes)', () => {
    ensureNotations()
    const text = readFileSync(new URL('../../../../../examples/software-release-idef0.mdj', import.meta.url), 'utf8')
    const { repository } = readMdj(text)
    const diagrams = repository.diagrams().filter((d) => d._type === 'IDEF0Diagram')
    expect(diagrams.length).toBe(3)
    for (const diagram of diagrams) {
      const layout = computeDiagramLayout(diagram, repository, measurer)
      for (const view of arrowViewsOf(diagram)) {
        expect(hasRouteHints([view])).toBe(false)
        expect(layout.edges.get(view._id)?.points, `${diagram.name} ${(view.model as Elem)['name']}`).toEqual(view.points)
      }
    }
  })
})

describe('IDEF0 route runs: hints', () => {
  it('drags a branch run to move its trunk bus (snapped value kept, one undo step, exact undo)', () => {
    const m = forkedModel(2)
    const trunk = named(m.a0, 'Control 1')
    const branch = branchesOf(m.a0, trunk)[0] as EdgeView
    const layout = m.layout()
    const run = (layout.edges.get(branch._id)?.data as ArrowData).runs?.[0]
    expect(run).toBeDefined()
    expect(run?.viewId).toBe(trunk._id)
    expect(run?.axis).toBe('y')
    const before = m.text()
    const undoDepth = m.engine.undoDepth
    expect(moveArrowRun(m.env, layout, branch._id, run!.index, run!.value + 16)).toBe(true)
    expect(m.engine.undoDepth).toBe(undoDepth + 1)
    expect(m.engine.undoName).toBe('Move Arrow Segment')
    expect(trunk['routeY']).toBe(run!.value + 16)
    expect(hintsOf(trunk)).toEqual({ y: run!.value + 16 })
    const after = m.layout()
    for (const b of branchesOf(m.a0, trunk)) expect(busRuns(after, [b])[0]?.y).toBe(run!.value + 16)
    m.engine.undo()
    expect(m.text()).toBe(before)
  })

  it('round trips hints through .mdj and omits unset hints', () => {
    const m = forkedModel(1)
    expect(m.text()).not.toMatch(/routeX|routeY/)
    const trunk = named(m.a0, 'Control 1')
    m.engine.transact('Hint', (b) => b.set(trunk, 'routeY', 96))
    const text = m.text()
    expect(text).toMatch(/"routeY": 96/)
    expect(text).not.toMatch(/routeX/)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
    const view = back.repository.get(trunk._id) as View
    expect(view['routeY']).toBe(96)
    expect(view['routeX']).toBe(-1)
  })

  it('clamps hints into the valid range: inside the frame, before the branch heads, off the boxes', () => {
    const m = forkedModel(1)
    const trunk = named(m.a0, 'Control 1')
    const y = (): number => (busRuns(m.layout(), branchesOf(m.a0, trunk))[0] as { y: number }).y
    const firstTop = (boxesOf(m.a0)[0] as NodeView).top
    m.engine.transact('Hint', (b) => b.set(trunk, 'routeY', 2000))
    expect(y()).toBeLessThanOrEqual(firstTop - 12)
    m.engine.transact('Hint', (b) => b.set(trunk, 'routeY', 0))
    expect(y()).toBeGreaterThan(64)
    // A run never stops inside a box it passes.
    expect(resolveRun(150, 0, 400, [[100, 200]])).toBe(100)
    expect(resolveRun(160, 0, 400, [[100, 200]])).toBe(200)
    expect(resolveRun(150, 0, 400, [[100, 200], [190, 300]])).toBe(100)
  })

  it('moves the channel of an output-to-input arrow sideways and keeps it between the boxes', () => {
    const boxA = { left: 100, top: 100, width: 168, height: 88 }
    const boxB = { left: 500, top: 300, width: 168, height: 88 }
    const tail: RouteEnd = { point: { x: 269, y: 144 }, dir: 'E', box: boxA }
    const head: RouteEnd = { point: { x: 499, y: 344 }, dir: 'W', box: boxB }
    const auto = routeArrowDetailed({ tail, head })
    expect(auto.adjust?.axis).toBe('x')
    const moved = routeArrowDetailed({ tail, head, hint: { x: 320 } })
    expect(moved.points[1]).toEqual({ x: 320, y: 144 })
    const clamped = routeArrowDetailed({ tail, head, hint: { x: 900 } })
    expect(clamped.points[1]?.x).toBe(491)
    // A box standing in the channel pushes the hinted run out of it.
    const blocked = routeArrowDetailed({ tail, head, hint: { x: 340 }, obstacles: [{ left: 320, top: 200, width: 60, height: 60 }] })
    expect(blocked.points[1]?.x).toBe(312)
  })

  it('computes a fork bus between the trunk start and the branch heads', () => {
    const trunk = [{ x: 200, y: 64 }, { x: 200, y: 160 }]
    const heads: RouteEnd[] = [{ point: { x: 400, y: 200 }, dir: 'N' }]
    expect(busOf(trunk, heads)).toMatchObject({ axis: 'y', value: 80, min: 72, max: 148 })
    expect(busOf(trunk, heads, { hint: 120 })?.value).toBe(120)
    expect(busOf(trunk, heads, { hint: 500 })?.value).toBe(148)
  })

  it('resets the hints of the selected arrows and of the trunks of selected branches', () => {
    const m = forkedModel(2)
    const trunk = named(m.a0, 'Control 2')
    const branch = branchesOf(m.a0, trunk)[1] as EdgeView
    const layout = m.layout()
    const run = arrowRunAt(layout, branch._id, (layout.edges.get(branch._id)?.data as ArrowData).runs?.[0]?.index ?? -1)
    const before = m.text()
    moveArrowRun(m.env, layout, branch._id, run!.index, run!.value + 8)
    expect(hasRouteHints([branch])).toBe(true)
    expect(resetArrowRoutes(m.env, [branch])).toBe(1)
    expect(hasRouteHints([branch])).toBe(false)
    expect(m.text()).toBe(before)
    expect(resetArrowRoutes(m.env, [branch])).toBe(0)
  })
})

describe('IDEF0 boxes keep their size', () => {
  it('resizes a selected box from anywhere on its outline, not only from its handles', () => {
    const m = forkedModel(1)
    const b = boxesOf(m.a0)[1] as NodeView
    const layout = m.layout()
    const selected = new Set([b._id])
    const at = (x: number, y: number) => hitTestDiagram(layout, { x, y }, { selected, zoom: 1 })
    expect(at(b.left + b.width + 2, b.top + 20)).toMatchObject({ kind: 'handle', handle: 'e' })
    expect(at(b.left + 30, b.top + b.height)).toMatchObject({ kind: 'handle', handle: 's' })
    expect(at(b.left - 1, b.top + 1)).toMatchObject({ kind: 'handle', handle: 'nw' })
    expect(at(b.left + 40, b.top + 30)).toMatchObject({ kind: 'node' })
    // Unselected boxes keep their outline for arrow ends and moving.
    expect(hitTestDiagram(layout, { x: b.left + b.width + 2, y: b.top + 20 }, { selected: new Set(), zoom: 1 })?.kind).not.toBe('handle')
  })

  it('keeps a resized box through renumbering, more boxes, fewer boxes and the normalizer', () => {
    const m = forkedModel(1)
    const [, b2] = boxesOf(m.a0) as [NodeView, NodeView]
    resizeNode(m.env, b2._id, { left: b2.left, top: b2.top, width: 320, height: 160 })
    expect([b2.width, b2.height]).toEqual([320, 160])
    renumberBoxes(m.engine, m.a0)
    removeChildBoxes(m.env, [(boxesOf(m.a0)[5] as NodeView).model as Elem])
    addChildBoxes(m.env, 1)
    expect([b2.width, b2.height]).toEqual([320, 160])
    // Arrow slots spread over the new side length.
    const layout = m.layout()
    const tops = arrowViewsOf(m.a0).filter((v) => v.head === b2).map((v) => layout.edges.get(v._id)?.points.at(-1)?.x as number)
    expect(tops.every((x) => x > b2.left && x < b2.left + 320)).toBe(true)
  })

  it('keeps route hints valid after a box grows under them', () => {
    const m = forkedModel(1)
    const trunk = named(m.a0, 'Control 1')
    m.engine.transact('Hint', (b) => b.set(trunk, 'routeY', 96))
    const b1 = boxesOf(m.a0)[0] as NodeView
    resizeNode(m.env, b1._id, { left: b1.left, top: 90, width: b1.width, height: b1.height + b1.top - 90 })
    const runs = busRuns(m.layout(), branchesOf(m.a0, trunk))
    for (const r of runs) expect(r.y).toBeLessThanOrEqual(90 - 12)
  })
})

describe('Make Same Size', () => {
  it('gives the selected boxes the size of the first one, never below their minimum, in one undo step', () => {
    const m = forkedModel(1)
    const [b1, b2, b3] = boxesOf(m.a0) as [NodeView, NodeView, NodeView]
    resizeNode(m.env, b1._id, { left: b1.left, top: b1.top, width: 240, height: 120 })
    m.engine.transact('Rename', (b) => b.set(b3.model as Elem, 'name', 'Reconcile Intercontinental Shipments'))
    const before = m.text()
    const depth = m.engine.undoDepth
    alignViews(m.env, [b1._id, b2._id, b3._id], 'make-same-size')
    expect(m.engine.undoDepth).toBe(depth + 1)
    expect([b1.width, b1.height, b2.width, b2.height]).toEqual([240, 120, 240, 120])
    expect(b3.height).toBe(120)
    expect(b3.width).toBe(240)
    resizeNode(m.env, b1._id, { left: b1.left, top: b1.top, width: 120, height: 64 })
    alignViews(m.env, [b1._id, b3._id], 'make-same-size')
    const layout = m.layout()
    expect(b3.width).toBe(layout.nodes.get(b3._id)?.minWidth)
    expect(b3.width).toBeGreaterThan(120)
    m.engine.undo()
    m.engine.undo()
    m.engine.undo()
    expect(m.text()).toBe(before)
  })
})

describe('IDEF0 arrow ends', () => {
  it('reorders the controls of a box by dragging one end along the top side (one undo step)', () => {
    const m = forkedModel(3)
    const b1 = boxesOf(m.a0)[0] as NodeView
    const xOf = (name: string): number => m.layout().edges.get(named(m.a0, name)._id)?.points.at(-1)?.x as number
    const order = (): string[] => ['Control 1', 'Control 2', 'Control 3'].sort((p, q) => xOf(p) - xOf(q))
    expect(order()).toEqual(['Control 1', 'Control 2', 'Control 3'])
    const before = m.text()
    const c3 = named(m.a0, 'Control 3')
    expect(reconnectIdef0(m.env, c3, 'head', b1, { x: b1.left + b1.width * 0.2, y: b1.top + 1 })).toBe(true)
    expect(order()).toEqual(['Control 3', 'Control 1', 'Control 2'])
    expect(c3.model?.['role']).toBe('control')
    m.engine.undo()
    expect(m.text()).toBe(before)
  })

  it('drops a dragged end on a box when released on or just outside its outline', () => {
    const m = forkedModel(1)
    const b1 = boxesOf(m.a0)[0] as NodeView
    const layout = m.layout()
    expect(pickReconnect(layout, { x: b1.left + 20, y: b1.top - 4 })).toBe(b1._id)
    expect(pickReconnect(layout, { x: b1.left + 20, y: b1.top - 20 })).toBeNull()
  })

  it('still changes the role when the end is dropped on another side of the same box', () => {
    const m = forkedModel(2)
    const b1 = boxesOf(m.a0)[0] as NodeView
    const c2 = named(m.a0, 'Control 2')
    expect(reconnectIdef0(m.env, c2, 'head', b1, { x: b1.left + 2, y: b1.top + b1.height / 2 })).toBe(true)
    expect(c2.model?.['role']).toBe('input')
    // The right side is an output side: refused.
    expect(reconnectIdef0(m.env, c2, 'head', b1, { x: b1.left + b1.width - 1, y: b1.top + b1.height / 2 })).toBe(false)
  })

  it('keeps arrows attached when a box moves', () => {
    const m = forkedModel(1)
    const b3 = boxesOf(m.a0)[2] as NodeView
    resizeNode(m.env, b3._id, { left: b3.left + 40, top: b3.top + 24, width: b3.width, height: b3.height })
    const layout = m.layout()
    for (const v of arrowViewsOf(m.a0).filter((a) => a.head === b3)) {
      const end = layout.edges.get(v._id)?.points.at(-1) as Point
      expect(end.y).toBe(b3.top - 1)
      expect(end.x).toBeGreaterThan(b3.left)
    }
  })
})
