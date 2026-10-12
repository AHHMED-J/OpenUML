import { afterEach, describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, deleteFromModel, ModelEngine } from '../commands'
import {
  EDGE_KINDS,
  NODE_KINDS,
  canConnect,
  createDefaultProject,
  isKindOf,
  planDiagram,
  planNode,
  radAutoThread,
  radProcessOf,
  setRadAutoThread,
  Repository,
  type Diagram,
  type Elem,
  type NodeView,
  type RadNodeKind,
  type View
} from '.'

function setup(autoThread = false) {
  setRadAutoThread(autoThread)
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const project = repository.project as Elem
  const diagram = createDiagram(engine, 'RADDiagram', project).diagram as Diagram
  const process = radProcessOf(diagram) as Elem
  const role = (left = 0, top = 0): NodeView => createNode(engine, { kind: 'RADRole', diagram, left, top }).view as NodeView
  const put = (kind: RadNodeKind, container: View, left: number, top: number, name?: string): View =>
    createNode(engine, { kind, diagram, left, top, container, ...(name ? { name } : {}) }).view as View
  return { repository, engine, project, diagram, process, role, put }
}

afterEach(() => setRadAutoThread(true))

describe('RAD diagram creation', () => {
  it('creates a process with the diagram inside when added to the project', () => {
    const { project, diagram, process } = setup()
    expect(process._type).toBe('RADProcess')
    expect(process['name']).toBe('RADProcess1')
    expect(process._parent).toBe(project)
    expect(diagram._type).toBe('RADDiagram')
    expect(diagram._parent).toBe(process)
    expect(process['roles']).toEqual([])
    expect(process['goal']).toBe('')
  })

  it('adds a second diagram to an existing process directly', () => {
    const { engine, process, diagram } = setup()
    const second = createDiagram(engine, 'RADDiagram', process).diagram
    expect(second._parent).toBe(process)
    expect(second['name']).not.toBe(diagram['name'])
    expect((process['ownedElements'] as Elem[]).filter((e) => isKindOf(e, 'RADDiagram'))).toHaveLength(2)
  })

  it('wraps the diagram in a process under a package too', () => {
    const t = setup()
    const model = (t.project['ownedElements'] as Elem[])[0] as Elem
    const plan = planDiagram('RADDiagram', model)
    expect(plan.model?._type).toBe('RADProcess')
    expect(plan.diagram._parent).toBe(plan.model)
  })
})

describe('roles and elements', () => {
  it('creates a role owned by the process with a gray rounded view', () => {
    const { process, role } = setup()
    const view = role(10, 20)
    const model = view.model as Elem
    expect(model._type).toBe('RADRole')
    expect(model._parent).toBe(process)
    expect(process['roles']).toEqual([model])
    expect(model['name']).toBe('Role1')
    expect(view._type).toBe('RADRoleView')
    expect([view.left, view.top, view.width, view.height]).toEqual([10, 20, 220, 360])
    expect(view.fillColor).toBe('#c0c0c0')
    expect(view.showShadow).toBe(false)
    expect(view['showGoal']).toBe(false)
    expect(view['headerOutside']).toBe(true)
    expect(view['nameLabel']).toBeTruthy()
  })

  it('numbers role names', () => {
    const { role } = setup()
    role()
    expect(role(300, 0).model?.['name']).toBe('Role2')
  })

  it('creates every element kind in a role, owned by it and contained in its view', () => {
    const { diagram, put, role } = setup()
    const rv = role()
    const roleModel = rv.model as Elem
    const kinds: Array<[RadNodeKind, string, string]> = [
      ['RADActivity', 'RADActivity', 'RADActivityView'],
      ['RADInteraction', 'RADInteraction', 'RADActivityView'],
      ['RADUndefinedProcess', 'RADUndefinedProcess', 'RADUndefinedProcessView'],
      ['RADStateMarker', 'RADStateMarker', 'RADStateMarkerView'],
      ['RADStartMarker', 'RADStateMarker', 'RADStateMarkerView'],
      ['RADEndMarker', 'RADStateMarker', 'RADStateMarkerView'],
      ['RADWait', 'RADWait', 'RADWaitView'],
      ['RADRoleStart', 'RADRoleStart', 'RADRoleStartView'],
      ['RADExternalRoleStart', 'RADRoleStart', 'RADRoleStartView']
    ]
    kinds.forEach(([kind, modelType, viewType], i) => {
      const view = put(kind, rv, 60 + i * 130, 60)
      expect(view._type).toBe(viewType)
      expect(view.model?._type).toBe(modelType)
      expect(view.model?._parent).toBe(roleModel)
      expect(roleModel['elements']).toContain(view.model)
      expect(view.containerView).toBe(rv)
      expect(rv.containedViews).toContain(view)
      expect(diagram.ownedViews).toContain(view)
      expect(view.showShadow).toBe(false)
    })
    const sizes = (roleModel['elements'] as Elem[]).map((e) => (diagram.ownedViews as NodeView[]).find((v) => v.model === e)).map((v) => [v?.width, v?.height])
    expect(sizes).toEqual([[24, 24], [24, 24], [44, 26], [30, 18], [30, 18], [30, 18], [24, 24], [26, 26], [26, 26]])
  })

  it('sets the marker kind, start texts and external role of the kinds', () => {
    const { put, role } = setup()
    const rv = role()
    expect(put('RADStartMarker', rv, 60, 40).model).toMatchObject({ kind: 'start', name: 'Start' })
    expect(put('RADEndMarker', rv, 60, 400).model).toMatchObject({ kind: 'end', name: 'End' })
    expect(put('RADStateMarker', rv, 60, 200).model).toMatchObject({ kind: 'state', name: '' })
    expect(put('RADExternalRoleStart', rv, 160, 40).model).toMatchObject({ externalRole: 'External role' })
    expect(put('RADRoleStart', rv, 260, 40).model).toMatchObject({ externalRole: '', name: '' })
  })

  it('refuses elements outside a role', () => {
    const { diagram } = setup()
    expect(() => planNode({ kind: 'RADActivity', diagram, left: 10, top: 10 })).toThrow(/inside a role/)
  })

  it('creates a case refinement with its Yes and No circles at the standard pitch', () => {
    const { diagram, put, role } = setup()
    const rv = role()
    const ref = put('RADCaseRefinement', rv, 40, 100, 'Is it fine?')
    const branches = (diagram.ownedViews as NodeView[]).filter((v) => v._type === 'RADBranchView')
    expect(branches.map((b) => b.model?.['name'])).toEqual(['Yes', 'No'])
    expect(branches.map((b) => b.left)).toEqual([40 + 120, 40 + 240])
    expect(branches.map((b) => b.top)).toEqual([100, 100])
    for (const b of branches) {
      expect(b.model?._type).toBe('RADCaseBranch')
      expect(b.model?.['refinement']).toBe(ref.model)
      expect(b.containerView).toBe(rv)
      expect(b.model?._parent).toBe(rv.model)
    }
    expect(diagram.ownedViews.filter((v) => v.model && isKindOf(v.model, 'EdgeView'))).toEqual([])
    expect(((rv.model as Elem)['stateLines'] as Elem[]).length).toBe(0)
  })

  it('creates a part refinement with two triangle branches', () => {
    const { diagram, put, role } = setup()
    const rv = role()
    put('RADPartRefinement', rv, 40, 100, 'Do both')
    const branches = (diagram.ownedViews as NodeView[]).filter((v) => v._type === 'RADBranchView')
    expect(branches.map((b) => b.model?._type)).toEqual(['RADPartBranch', 'RADPartBranch'])
    expect(branches.map((b) => [b.width, b.height])).toEqual([[26, 24], [26, 24]])
  })

  it('attaches a branch dropped on the row of a refinement and leaves other branches unattached', () => {
    const { put, role } = setup()
    const rv = role()
    const ref = put('RADCaseRefinement', rv, 40, 100)
    const row = put('RADCaseBranch', rv, 40 + 360, 103)
    const away = put('RADCaseBranch', rv, 40 + 360, 300)
    expect(row.model?.['refinement']).toBe(ref.model)
    expect(away.model?.['refinement']).toBeNull()
    // A part branch never attaches to a case refinement.
    expect(put('RADPartBranch', rv, 40 + 420, 100).model?.['refinement']).toBeNull()
  })

  it('exposes every RAD kind in NODE_KINDS / EDGE_KINDS', () => {
    for (const kind of ['RADRole', 'RADActivity', 'RADCaseBranch', 'RADExternalRoleStart']) expect(NODE_KINDS).toHaveProperty(kind)
    for (const kind of ['RADStateLine', 'RADInteractionLink']) expect(EDGE_KINDS).toHaveProperty(kind)
  })
})

describe('state lines', () => {
  it('connects two elements of one role and stores the line in the role', () => {
    const { engine, diagram, put, role } = setup()
    const rv = role()
    const a = put('RADActivity', rv, 60, 60)
    const b = put('RADActivity', rv, 60, 200)
    expect(canConnect('RADStateLine', a, b)).toBe(true)
    const plan = createEdge(engine, { kind: 'RADStateLine', diagram, tail: a, head: b })
    const line = plan.model as Elem
    expect(line._type).toBe('RADStateLine')
    expect(line._parent).toBe(rv.model)
    expect((rv.model as Elem)['stateLines']).toEqual([line])
    expect(line['source']).toBe(a.model)
    expect(line['target']).toBe(b.model)
    expect(line).toMatchObject({ loopBack: false, routing: 'auto', showArrow: true })
    expect(plan.view?._type).toBe('RADStateLineView')
  })

  it('flags a line whose target lies above (or upstream of) its source as a loop-back', () => {
    const { engine, diagram, put, role } = setup()
    const rv = role()
    const a = put('RADActivity', rv, 60, 60)
    const b = put('RADActivity', rv, 60, 200)
    const c = put('RADActivity', rv, 200, 200)
    createEdge(engine, { kind: 'RADStateLine', diagram, tail: a, head: b })
    const back = createEdge(engine, { kind: 'RADStateLine', diagram, tail: c, head: a }).model as Elem
    expect(back['loopBack']).toBe(true)
    // Upstream through existing lines, even when positions say otherwise.
    const d = put('RADActivity', rv, 60, 400)
    createEdge(engine, { kind: 'RADStateLine', diagram, tail: b, head: d })
    const viaGraph = createEdge(engine, { kind: 'RADStateLine', diagram, tail: d, head: b }).model as Elem
    expect(viaGraph['loopBack']).toBe(true)
  })

  it('rejects lines across roles, onto branches, into start markers, out of end markers and duplicates', () => {
    const { engine, diagram, put, role } = setup()
    const r1 = role(0, 0)
    const r2 = role(400, 0)
    const a = put('RADActivity', r1, 60, 60)
    const other = put('RADActivity', r2, 460, 60)
    expect(canConnect('RADStateLine', a, other)).toBe(false)
    const ref = put('RADCaseRefinement', r1, 40, 200)
    const branch = (diagram.ownedViews as View[]).find((v) => v._type === 'RADBranchView') as View
    expect(canConnect('RADStateLine', a, branch)).toBe(false)
    expect(canConnect('RADStateLine', branch, a)).toBe(true)
    expect(canConnect('RADStateLine', a, ref)).toBe(true)
    const start = put('RADStartMarker', r1, 60, 20)
    const end = put('RADEndMarker', r1, 60, 300)
    expect(canConnect('RADStateLine', a, start)).toBe(false)
    expect(canConnect('RADStateLine', end, a)).toBe(false)
    expect(canConnect('RADStateLine', a, a)).toBe(false)
    createEdge(engine, { kind: 'RADStateLine', diagram, tail: a, head: end })
    expect(canConnect('RADStateLine', a, end)).toBe(false)
  })

  it('merges: several lines may end at one element', () => {
    const { engine, diagram, put, role } = setup()
    const rv = role()
    const target = put('RADActivity', rv, 60, 300)
    for (const left of [60, 200, 340]) {
      const src = put('RADActivity', rv, left, 100)
      createEdge(engine, { kind: 'RADStateLine', diagram, tail: src, head: target })
    }
    expect(((rv.model as Elem)['stateLines'] as Elem[]).filter((l) => l['target'] === target.model)).toHaveLength(3)
  })
})

describe('interaction links', () => {
  it('links interactions of two roles, owned by the process', () => {
    const { engine, diagram, process, put, role } = setup()
    const r1 = role(0, 0)
    const r2 = role(400, 0)
    const a = put('RADInteraction', r1, 60, 60)
    const b = put('RADInteraction', r2, 460, 60)
    expect(canConnect('RADInteractionLink', a, b)).toBe(true)
    const plan = createEdge(engine, { kind: 'RADInteractionLink', diagram, tail: a, head: b })
    const link = plan.model as Elem
    expect(link._parent).toBe(process)
    expect(process['interactions']).toEqual([link])
    expect(link['source']).toBe(a.model)
    expect(link['target']).toBe(b.model)
    expect(link['showDirection']).toBe(false)
    expect(plan.view?._type).toBe('RADInteractionLinkView')
    expect(canConnect('RADInteractionLink', a, b)).toBe(false)
    expect(canConnect('RADInteractionLink', b, a)).toBe(false)
  })

  it('rejects links inside one role and links of plain activities', () => {
    const { put, role } = setup()
    const r1 = role(0, 0)
    const r2 = role(400, 0)
    const a = put('RADInteraction', r1, 60, 60)
    const a2 = put('RADInteraction', r1, 60, 200)
    const plain = put('RADActivity', r2, 460, 60)
    expect(canConnect('RADInteractionLink', a, a2)).toBe(false)
    expect(canConnect('RADInteractionLink', a, plain)).toBe(false)
  })
})

describe('auto-thread', () => {
  it('threads a new element below an open-ended element in the same single undo step', () => {
    const { engine, repository, put, role } = setup(true)
    const rv = role()
    const a = put('RADActivity', rv, 60, 60)
    const undoDepth = engine.undoName
    const b = put('RADActivity', rv, 66, 160)
    const lines = (rv.model as Elem)['stateLines'] as Elem[]
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ source: a.model, target: b.model })
    expect(repository.viewsOf(lines[0] as Elem)).toHaveLength(1)
    engine.undo()
    expect((rv.model as Elem)['stateLines']).toEqual([])
    expect((rv.model as Elem)['elements']).toHaveLength(1)
    expect(undoDepth).toBeTruthy()
  })

  it('does nothing when the option is off, the column differs or the gap is too large', () => {
    const { put, role } = setup(true)
    const rv = role()
    put('RADActivity', rv, 60, 60)
    put('RADActivity', rv, 140, 160)
    put('RADActivity', rv, 60, 400)
    expect((rv.model as Elem)['stateLines']).toEqual([])
    setRadAutoThread(false)
    expect(radAutoThread()).toBe(false)
    put('RADActivity', rv, 60, 160)
    expect((rv.model as Elem)['stateLines']).toEqual([])
  })

  it('skips sources that already continue, end markers and refinements; never threads branches or start markers', () => {
    const { put, role } = setup(true)
    const rv = role()
    put('RADActivity', rv, 60, 60)
    put('RADActivity', rv, 60, 160)
    put('RADActivity', rv, 60, 260)
    // The first activity already continues: a third one below the second is threaded from the second only.
    expect(((rv.model as Elem)['stateLines'] as Elem[]).map((l) => [(l['source'] as Elem)['name'], (l['target'] as Elem)['name']])).toEqual([
      ['Activity1', 'Activity2'],
      ['Activity2', 'Activity3']
    ])
    put('RADStartMarker', rv, 60, 340)
    expect(((rv.model as Elem)['stateLines'] as Elem[]).length).toBe(2)
    // An end marker is threaded from the open end of the path; nothing continues after it.
    put('RADEndMarker', rv, 60, 400)
    expect(((rv.model as Elem)['stateLines'] as Elem[]).length).toBe(3)
    put('RADCaseRefinement', rv, 60, 480)
    put('RADActivity', rv, 60, 560)
    expect(((rv.model as Elem)['stateLines'] as Elem[]).length).toBe(3)
  })
})

describe('deleting', () => {
  it('removes the branches (and their lines) with a refinement', () => {
    const { engine, repository, diagram, put, role } = setup()
    setRadAutoThread(false)
    const rv = role()
    const a = put('RADActivity', rv, 200, 200)
    const ref = put('RADCaseRefinement', rv, 40, 100)
    const branch = (diagram.ownedViews as View[]).find((v) => v._type === 'RADBranchView') as View
    createEdge(engine, { kind: 'RADStateLine', diagram, tail: branch, head: a })
    deleteFromModel(engine, [ref.model as Elem])
    expect(((rv.model as Elem)['elements'] as Elem[]).map((e) => e._type)).toEqual(['RADActivity'])
    expect((rv.model as Elem)['stateLines']).toEqual([])
    expect(diagram.ownedViews.filter((v) => v._type !== 'RADRoleView' && v !== a).length).toBe(0)
    engine.undo()
    expect(((rv.model as Elem)['elements'] as Elem[]).length).toBe(4)
    void repository
  })

  it('clears a role start reference to a deleted role', () => {
    const { engine, put, role } = setup()
    const r1 = role(0, 0)
    const r2 = role(400, 0)
    const start = put('RADRoleStart', r1, 60, 60)
    engine.transact('Set', (b) => b.set(start.model as Elem, 'role', r2.model))
    deleteFromModel(engine, [r2.model as Elem])
    expect(start.model?.['role']).toBeNull()
  })
})
