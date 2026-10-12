import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyPlan, createDiagram, createEdge, createNode, ModelEngine } from '../commands'
import { readMdj, validateModel, writeMdj } from '../format'
import { buildOrderExample } from './idef0-example'
import {
  buildNodeIndex,
  contextDiagramOf,
  diagramNodeNumber,
  functionViewsOf,
  icomCodes,
  nodeNumber,
  nodeReference,
  parentDiagramOf,
  planRenumber,
  slotOffsets,
  staircaseOrder
} from './idef0-numbering'
import { canConnect, createDefaultProject, getEnumLiterals, getTypeInfo, initialValue, instantiate, isKindOf, planDiagram, planIdef0Arrow, planNode, typeDisplayName } from './index'
import { Repository } from './repository'
import type { Diagram, Elem, NodeView, View } from './types'

const FIXTURE = new URL('../format/fixtures/idef0-order.mdj', import.meta.url)

function newProject() {
  const project = createDefaultProject()
  const repository = new Repository(project)
  const engine = new ModelEngine(repository)
  return { project, repository, engine }
}

function list(el: Elem, field: string): Elem[] {
  return el[field] as Elem[]
}

describe('IDEF0 metamodel', () => {
  it('declares the enumerations and defaults of the spec', () => {
    expect(getEnumLiterals('IDEF0ArrowRole')).toEqual(['input', 'control', 'output', 'mechanism', 'call'])
    expect(getEnumLiterals('IDEF0DiagramKind')).toEqual(['context', 'decomposition'])
    expect(getEnumLiterals('IDEF0Status')).toEqual(['working', 'draft', 'recommended', 'publication'])
    const fn = instantiate('IDEF0Function')
    expect(fn).toMatchObject({ boxNumber: 0, childDiagram: null, calledFunction: null, definition: '' })
    expect(Array.isArray(fn['functions']) && Array.isArray(fn['arrows']) && Array.isArray(fn['ports'])).toBe(true)
    const arrow = instantiate('IDEF0Arrow')
    expect(arrow).toMatchObject({ role: 'input', tunnelSource: false, tunnelTarget: false, sourceSlot: -1, targetSlot: -1, calledNode: '' })
    const diagram = instantiate('IDEF0Diagram')
    expect(diagram).toMatchObject({ diagramKind: 'decomposition', status: 'working', autoNumber: true, showTitleBlock: true, showWorkingBand: true })
    const info = getTypeInfo('IDEF0ArrowView')
    expect(initialValue(info, info!.fieldMap.get('lineStyle')!)).toBe(2)
    expect(typeDisplayName('IDEF0Function')).toBe('Function')
  })

  it('makes models, functions and ports scopes that own arrows and ports', () => {
    expect(isKindOf(instantiate('IDEF0Model'), 'IDEF0Scope')).toBe(true)
    expect(isKindOf(instantiate('IDEF0Function'), 'IDEF0Scope')).toBe(true)
    expect(isKindOf(instantiate('IDEF0Arrow'), 'DirectedRelationship')).toBe(true)
    expect(isKindOf(instantiate('IDEF0Diagram'), 'Diagram')).toBe(true)
  })
})

describe('IDEF0 numbering', () => {
  it('derives node numbers from containment (A0, A1, A21, A252)', () => {
    const ex = buildOrderExample()
    expect(nodeNumber(ex.top)).toBe('A0')
    expect(nodeNumber(ex.a1)).toBe('A1')
    expect(nodeNumber(ex.a3)).toBe('A3')
    const sub = instantiate('IDEF0Function')
    sub['boxNumber'] = 1
    sub._parent = ex.a2
    expect(nodeNumber(sub)).toBe('A21')
    const deep = instantiate('IDEF0Function')
    deep['boxNumber'] = 2
    deep._parent = { ...sub, _parent: ex.a2 } as Elem
    ;(deep._parent as Elem)['boxNumber'] = 5
    expect(nodeNumber(deep)).toBe('A252')
    expect(diagramNodeNumber(ex.contextDiagram)).toBe('A-0')
    expect(diagramNodeNumber(ex.childDiagram)).toBe('A0')
    expect(nodeReference(ex.model, 'A21')).toBe('OM/A21')
    expect(nodeReference({ ...ex.model, abbreviation: '' }, 'A21')).toBe('A21')
  })

  it('navigates between context and child diagram', () => {
    const ex = buildOrderExample()
    expect(contextDiagramOf(ex.model)).toBe(ex.contextDiagram)
    expect(parentDiagramOf(ex.childDiagram)).toBe(ex.contextDiagram)
    expect(parentDiagramOf(ex.contextDiagram)).toBeNull()
  })

  it('computes ICOM codes of the A0 boundary ports and none on A-0', () => {
    const ex = buildOrderExample()
    const codes = icomCodes(ex.childDiagram)
    const byRole = Object.fromEntries(list(ex.top, 'ports').map((p) => [p['role'] as string, codes.get(p._id)]))
    expect(byRole).toEqual({ input: 'I1', control: 'C1', output: 'O1', mechanism: 'M1' })
    expect(icomCodes(ex.contextDiagram).size).toBe(0)
  })

  it('numbers codes by position along the parent side and skips ports without a counterpart', () => {
    const ex = buildOrderExample()
    // A second control entering the parent box, to the left of "Sales Policy".
    const extra = instantiate('IDEF0Arrow')
    extra._id = 'extraCtl'
    Object.assign(extra, { name: 'Standards', role: 'control', target: ex.top, source: list(ex.model, 'ports')[1] })
    list(ex.model, 'arrows').push(extra)
    extra._parent = ex.model
    const view = instantiate('IDEF0ArrowView') as View
    Object.assign(view, { model: extra, points: [{ x: 300, y: 64 }, { x: 300, y: 289 }] })
    ;(ex.contextDiagram['ownedViews'] as View[]).push(view)
    const port = instantiate('IDEF0Port')
    Object.assign(port, { _id: 'pExtra', role: 'control', corresponds: extra })
    port._parent = ex.top
    list(ex.top, 'ports').push(port)
    const orphan = instantiate('IDEF0Port')
    Object.assign(orphan, { _id: 'pOrphan', role: 'input', corresponds: null })
    list(ex.top, 'ports').push(orphan)
    const codes = icomCodes(ex.childDiagram)
    expect(codes.get('pExtra')).toBe('C1')
    expect(codes.get('PtC1000000000000000001')).toBe('C2')
    expect(codes.has('pOrphan')).toBe(false)
  })

  it('orders boxes on the staircase and renumbers them', () => {
    const ex = buildOrderExample()
    const views = functionViewsOf(ex.childDiagram)
    expect(staircaseOrder(views).map((v) => (v.model as Elem)['name'])).toEqual(['Receive Order', 'Check Credit and Stock', 'Ship and Invoice'])
    expect(planRenumber(ex.childDiagram)).toEqual([])
    // Swap the first and last boxes: numbers follow the layout.
    const [v1, , v3] = views as [NodeView, NodeView, NodeView]
    ;[v1.left, v3.left] = [v3.left, v1.left]
    ;[v1.top, v3.top] = [v3.top, v1.top]
    const changes = planRenumber(ex.childDiagram)
    expect(changes.map((c) => [c.fn['name'], c.boxNumber])).toEqual([
      ['Ship and Invoice', 1],
      ['Receive Order', 3]
    ])
  })

  it('numbers off-diagonal boxes after the diagonal ones', () => {
    const ex = buildOrderExample()
    const views = functionViewsOf(ex.childDiagram)
    const off = instantiate('IDEF0FunctionView') as NodeView
    Object.assign(off, { model: ex.a3, left: 700, top: 100, width: 168, height: 88 })
    expect(staircaseOrder([off, ...views]).at(-1)).toBe(off)
  })

  it('spreads slots evenly and keeps them away from corners', () => {
    expect(slotOffsets(88, 1)).toEqual([44])
    expect(slotOffsets(168, 2)).toEqual([56, 112])
    expect(slotOffsets(64, 5).every((o) => o >= 12 && o <= 52)).toBe(true)
    expect(slotOffsets(100, 0)).toEqual([])
  })

  it('builds the node index outline', () => {
    const ex = buildOrderExample()
    expect(buildNodeIndex(ex.model).map((e) => [e.nodeNumber, e.depth])).toEqual([
      ['A-0', 0],
      ['A0', 1],
      ['A1', 2],
      ['A2', 2],
      ['A3', 2]
    ])
    expect(buildNodeIndex(ex.model)[1]?.diagramId).toBe(ex.childDiagram._id)
  })
})

describe('IDEF0 creation', () => {
  it('creates the model, top function and A-0 diagram on a project as one undo step', () => {
    const { project, engine } = newProject()
    const plan = createDiagram(engine, 'IDEF0Diagram', project)
    const model = plan.model as Elem
    const diagram = plan.diagram as Diagram
    expect(model._type).toBe('IDEF0Model')
    expect(model._parent).toBe(project)
    expect(diagram['diagramKind']).toBe('context')
    expect(diagram._parent).toBe(model)
    const top = model['topFunction'] as Elem
    expect(top._parent).toBe(model)
    expect(top['boxNumber']).toBe(0)
    expect(diagram['name']).toBe(top['name'])
    expect(diagram.ownedViews.map((v) => v._type)).toEqual(['IDEF0FrameView', 'IDEF0FunctionView'])
    expect(diagram.ownedViews[1]).toMatchObject({ width: 240, height: 120 })
    expect(validateModel(project)).toEqual([])
    engine.undo()
    expect(project.ownedElements.includes(model)).toBe(false)
  })

  it('refuses another A-0 diagram on a model and a second box on A-0', () => {
    const { project, engine } = newProject()
    const plan = createDiagram(engine, 'IDEF0Diagram', project)
    expect(() => planDiagram('IDEF0Diagram', plan.model as Elem)).toThrow()
    expect(() => planNode({ kind: 'IDEF0Function', diagram: plan.diagram as Diagram, left: 0, top: 0 })).toThrow()
  })

  it('creates boxes owned by the detailed function with consecutive box numbers', () => {
    const { project, engine } = newProject()
    const ctx = createDiagram(engine, 'IDEF0Diagram', project)
    const top = (ctx.model as Elem)['topFunction'] as Elem
    const child = createDiagram(engine, 'IDEF0Diagram', top).diagram as Diagram
    expect(top['childDiagram']).toBe(child)
    expect(list(top, 'functions').map((f) => f['boxNumber'])).toEqual([1, 2, 3])
    const extra = createNode(engine, { kind: 'IDEF0Function', diagram: child, left: 900, top: 500 })
    expect((extra.model as Elem)._parent).toBe(top)
    expect((extra.model as Elem)['boxNumber']).toBe(4)
    expect(nodeNumber(extra.model as Elem)).toBe('A4')
  })

  it('creates numbered model notes in the scope', () => {
    const { project, engine } = newProject()
    const ctx = createDiagram(engine, 'IDEF0Diagram', project)
    const n1 = createNode(engine, { kind: 'IDEF0ModelNote', diagram: ctx.diagram as Diagram, left: 100, top: 100 })
    const n2 = createNode(engine, { kind: 'IDEF0ModelNote', diagram: ctx.diagram as Diagram, left: 140, top: 100 })
    expect([(n1.model as Elem)['number'], (n2.model as Elem)['number']]).toEqual([1, 2])
    expect((n1.model as Elem)._parent).toBe(ctx.model)
  })

  it('creates an arrow between boxes and rejects an output into the right side', () => {
    const { project, engine } = newProject()
    const ctx = createDiagram(engine, 'IDEF0Diagram', project)
    const top = (ctx.model as Elem)['topFunction'] as Elem
    const child = createDiagram(engine, 'IDEF0Diagram', top).diagram as Diagram
    const [, b1, b2] = child.ownedViews as View[]
    const edge = createEdge(engine, { kind: 'IDEF0Arrow', diagram: child, tail: b1 as View, head: b2 as View, name: 'Data' })
    const arrow = edge.model as Elem
    expect(arrow).toMatchObject({ role: 'input', name: 'Data', source: b1?.model, target: b2?.model })
    expect(arrow._parent).toBe(top)
    expect((edge.view as View)['lineStyle']).toBe(2)
    expect(canConnect('IDEF0Arrow', b1 as View, b2 as View)).toBe(true)
    expect(validateModel(project)).toEqual([])
  })
})

describe('IDEF0 boundary arrows', () => {
  it('gives an arrow released on empty canvas the output role and a boundary output port', () => {
    const { project, engine } = newProject()
    const ctx = createDiagram(engine, 'IDEF0Diagram', project)
    const diagram = ctx.diagram as Diagram
    const box = diagram.ownedViews[1] as View
    const plan = planIdef0Arrow({ diagram, tail: box, head: null, at: { x: 900, y: 349 } })
    engine.transact('Create', (b) => applyPlan(b, plan))
    const arrow = plan.model as Elem
    expect(arrow).toMatchObject({ role: 'output', source: box.model })
    const port = arrow['target'] as Elem
    expect(port).toMatchObject({ _type: 'IDEF0Port', role: 'output', corresponds: null })
    expect(port._parent).toBe(ctx.model)
    expect(validateModel(project)).toEqual([])
  })
})

describe('IDEF0 decomposition seeding', () => {
  it('seeds ports and default wiring from the parent arrows and sets childDiagram', () => {
    const ex = buildOrderExample()
    const repo = new Repository(ex.project)
    const engine = new ModelEngine(repo)
    // Detail box A2: it has an input (Validated Order), a control fork branch and an output.
    const plan = createDiagram(engine, 'IDEF0Diagram', ex.a2)
    const diagram = plan.diagram as Diagram
    expect(ex.a2['childDiagram']).toBe(diagram)
    expect(diagram._parent).toBe(ex.a2)
    expect(diagram['name']).toBe('Check Credit and Stock')
    const roles = list(ex.a2, 'ports').map((p) => p['role'])
    expect(roles).toEqual(['input', 'control', 'output'])
    const corresponds = list(ex.a2, 'ports').map((p) => (p['corresponds'] as Elem)['name'])
    expect(corresponds).toEqual(['Validated Order', '', 'Approved Order'])
    expect(list(ex.a2, 'functions').map((f) => nodeNumber(f))).toEqual(['A21', 'A22', 'A23'])
    // Control is forked to the controls of the other boxes.
    const arrows = list(ex.a2, 'arrows')
    expect(arrows.filter((a) => a['role'] === 'control')).toHaveLength(3)
    expect(validateModel(ex.project)).toEqual([])
    engine.undo()
    expect(ex.a2['childDiagram']).toBeNull()
    expect(list(ex.a2, 'ports')).toHaveLength(0)
    expect(list(ex.a2, 'functions')).toHaveLength(0)
  })

  it('skips tunneled and call arrows and honors the box count', () => {
    const ex = buildOrderExample()
    ex.model['topFunction'] = ex.top
    const arrow = list(ex.top, 'arrows').find((a) => a['name'] === 'Order Staff') as Elem
    arrow['tunnelTarget'] = true
    const call = instantiate('IDEF0Arrow')
    Object.assign(call, { _id: 'call1', role: 'call', source: ex.a1 })
    call._parent = ex.top
    list(ex.top, 'arrows').push(call)
    const repo = new Repository(ex.project)
    const engine = new ModelEngine(repo)
    const plan = createDiagram(engine, 'IDEF0Diagram', ex.a1)
    expect(plan.diagram).toBeTruthy()
    // A1 has Customer Order (input), Sales Policy (control), Validated Order (output); Order Staff is tunneled.
    expect(list(ex.a1, 'ports').map((p) => p['role'])).toEqual(['input', 'control', 'output'])
    expect(list(ex.a1, 'ports').some((p) => (p['corresponds'] as Elem)['role'] === 'call')).toBe(false)
  })
})

describe('IDEF0 .mdj round trip', () => {
  it('matches the committed fixture byte for byte', () => {
    const text = writeMdj(buildOrderExample().project)
    if (process.env['UPDATE_FIXTURES']) writeFileSync(FIXTURE, text)
    expect(readFileSync(FIXTURE, 'utf8')).toBe(text)
  })

  it('reads the fixture back to an identical file and a valid model', () => {
    const text = readFileSync(FIXTURE, 'utf8')
    const { project, repository, warnings } = readMdj(text)
    expect(warnings).toEqual([])
    expect(validateModel(project)).toEqual([])
    expect(writeMdj(project)).toBe(text)
    const model = repository.get('OMmodel000000000000001') as Elem
    expect(model).toMatchObject({ abbreviation: 'OM', viewpoint: 'Order desk supervisor.' })
    const top = repository.get('FnTop00000000000000001') as Elem
    expect(top['childDiagram']).toBe(repository.get('DgA0000000000000000001'))
    expect(list(top, 'ports')).toHaveLength(4)
    expect(list(top, 'arrows')).toHaveLength(8)
    const branch = repository.get('ArrCtl200000000000000001') as Elem
    expect(isKindOf(branch['source'] as Elem, 'IDEF0Arrow')).toBe(true)
  })

  it('omits default values (status, boxNumber 0, autoNumber)', () => {
    const text = writeMdj(buildOrderExample().project)
    expect(text).not.toContain('"status"')
    expect(text).not.toContain('"autoNumber"')
    expect(text).not.toContain('"tunnelSource"')
    expect(text).toContain('"diagramKind": "context"')
  })
})
