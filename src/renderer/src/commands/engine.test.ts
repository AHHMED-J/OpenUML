import { describe, expect, it, vi } from 'vitest'
import { validateModel, writeFragment, writeMdj } from '../format'
import {
  createDefaultProject,
  createElement,
  Repository,
  type Diagram,
  type Elem,
  type NodeView,
  type UMLClassifierView,
  type UMLSeqLifelineView,
  type View
} from '../model'
import {
  addAttribute,
  addOperation,
  addParameter,
  CommandRegistry,
  collectDeletion,
  createDiagram,
  createEdge,
  createNode,
  deleteFromModel,
  deleteFromView,
  importFragment,
  ModelEngine,
  moveElement,
  moveViews,
  reorderElement,
  setFields,
  setViewBounds,
  syncItemViews
} from '.'

function setup() {
  const project = createDefaultProject()
  const repo = new Repository(project)
  const engine = new ModelEngine(repo)
  const diagram = repo.defaultDiagram() as Diagram
  const model = diagram._parent as Elem
  return { project, repo, engine, diagram, model }
}

/** Snapshot of the whole project as text: the strongest equality check for undo/redo. */
const snapshot = (root: Elem): string => writeMdj(root, { verbose: true })

describe('create / undo / redo', () => {
  it('creating a class is one operation; undo removes model and view; redo restores the same ids', () => {
    const { project, repo, engine, diagram, model } = setup()
    const before = snapshot(project)
    const plan = createNode(engine, { kind: 'Class', diagram, left: 10, top: 20 })
    const cls = plan.model as Elem
    const view = plan.view as View
    expect(engine.undoDepth).toBe(1)
    expect(engine.undoName).toBe('Create Class')
    expect(model['ownedElements']).toContain(cls)
    expect(diagram.ownedViews).toContain(view)
    expect(repo.get(view._id)).toBe(view)
    expect(repo.get((view as UMLClassifierView).nameCompartment?._id)).toBeDefined()
    const after = snapshot(project)

    engine.undo()
    expect(snapshot(project)).toBe(before)
    expect(repo.has(cls._id)).toBe(false)
    expect(repo.has(view._id)).toBe(false)
    expect(engine.canRedo).toBe(true)

    engine.redo()
    expect(snapshot(project)).toBe(after)
    const restored = repo.get(view._id) as View
    expect(restored.model).toBe(repo.get(cls._id))
    expect(restored._parent).toBe(diagram)
    expect(validateModel(project)).toEqual([])
  })

  it('set fields: undo/redo restores values (including custom values)', () => {
    const { engine, diagram } = setup()
    const { model, view } = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    const cls = model as Elem
    setFields(engine, cls, { name: 'Customer', isAbstract: true, visibility: 'package' })
    setFields(engine, view as Elem, { font: { face: 'Lato', size: 16, style: 2 }, fillColor: '#ffeecc' })
    expect(cls).toMatchObject({ name: 'Customer', isAbstract: true, visibility: 'package' })
    engine.undo()
    expect((view as View).font).toEqual({ face: 'Arial', size: 13, style: 0 })
    engine.undo()
    expect(cls).toMatchObject({ name: 'Class1', isAbstract: false, visibility: 'public' })
    engine.redo()
    engine.redo()
    expect(cls['name']).toBe('Customer')
    expect((view as View).font).toEqual({ face: 'Lato', size: 16, style: 2 })
  })

  it('ignores no-op changes and rejects unknown fields', () => {
    const { engine, diagram } = setup()
    setFields(engine, diagram, { name: 'Main' })
    expect(engine.undoDepth).toBe(0)
    expect(() => setFields(engine, diagram, { notAField: 1 })).toThrow(/no field/)
    expect(engine.undoDepth).toBe(0)
  })

  it('rolls back a failed transaction', () => {
    const { project, engine, model } = setup()
    const before = snapshot(project)
    expect(() =>
      engine.transact('Broken', (b) => {
        b.insert(model, 'ownedElements', createElement('UMLClass', { name: 'X' }))
        b.set(model, 'name', 'Changed')
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(snapshot(project)).toBe(before)
    expect(engine.undoDepth).toBe(0)
  })

  it('nested transactions join the outer operation', () => {
    const { engine, diagram } = setup()
    engine.transact('Class with members', () => {
      const cls = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 }).model as Elem
      addAttribute(engine, cls, { name: 'id', type: 'int' })
      const op = addOperation(engine, cls)
      addParameter(engine, op, { name: 'x' })
    })
    expect(engine.undoDepth).toBe(1)
    engine.undo()
    expect(diagram.ownedViews).toHaveLength(0)
  })

  it('caps history at 100 operations', () => {
    const { engine, model } = setup()
    for (let i = 0; i < 105; i++) setFields(engine, model, { name: `M${i}` })
    expect(engine.undoDepth).toBe(100)
    while (engine.canUndo) engine.undo()
    expect(model['name']).toBe('M4')
  })

  it('notifies listeners', () => {
    const { engine, model } = setup()
    const listener = vi.fn()
    const off = engine.subscribe(listener)
    setFields(engine, model, { name: 'A' })
    engine.undo()
    engine.redo()
    off()
    setFields(engine, model, { name: 'B' })
    expect(listener.mock.calls.map(([e]) => e.type)).toEqual(['execute', 'undo', 'redo'])
  })
})

describe('features and structure', () => {
  it('adding an attribute adds item views to every view of the classifier', () => {
    const { engine, diagram, repo } = setup()
    const first = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    const cls = first.model as Elem
    const second = createNode(engine, { kind: 'Class', diagram, left: 300, top: 0, owner: cls._parent as Elem })
    // A second view of the same class (e.g. on another diagram) also gets the row.
    engine.transact('Second view', (b) => {
      b.set(second.view as Elem, 'model', cls)
    })
    const attr = addAttribute(engine, cls)
    expect(attr).toMatchObject({ _type: 'UMLAttribute', name: 'Attribute1' })
    const compartments = repo.viewsOf(cls).map((v) => (v as UMLClassifierView).attributeCompartment as NodeView)
    expect(compartments).toHaveLength(2)
    for (const c of compartments) expect(c.subViews.map((v) => v.model)).toEqual([attr])
    engine.undo()
    for (const c of compartments) expect(c.subViews).toHaveLength(0)
  })

  it('syncItemViews adds missing and removes stale rows as a bypass operation', () => {
    const { engine, diagram } = setup()
    const { model, view } = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    const cls = model as Elem
    engine.transact('Raw insert', (b) => b.insert(cls, 'attributes', createElement('UMLAttribute', { name: 'a' })))
    const compartment = (view as UMLClassifierView).attributeCompartment as NodeView
    expect(compartment.subViews).toHaveLength(0)
    const depth = engine.undoDepth
    syncItemViews(engine, view as View)
    expect(compartment.subViews.map((v) => v.model)).toEqual(cls['attributes'])
    expect(engine.undoDepth).toBe(depth)
  })

  it('moves and reorders elements with undo', () => {
    const { engine, diagram, model } = setup()
    const pkg = createNode(engine, { kind: 'Package', diagram, left: 0, top: 0 }).model as Elem
    const cls = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 }).model as Elem
    moveElement(engine, cls, pkg)
    expect(cls._parent).toBe(pkg)
    expect(pkg['ownedElements']).toEqual([cls])
    expect(() => moveElement(engine, pkg, pkg)).toThrow()
    engine.undo()
    expect(cls._parent).toBe(model)
    expect((model['ownedElements'] as Elem[]).at(-1)).toBe(cls)
    const a1 = addAttribute(engine, cls)
    const a2 = addAttribute(engine, cls)
    reorderElement(engine, a2, 0)
    expect(cls['attributes']).toEqual([a2, a1])
    engine.undo()
    expect(cls['attributes']).toEqual([a1, a2])
  })

  it('moving views moves sub-views, contained views and edges between moved nodes', () => {
    const { engine, repo } = setup()
    const useCases = createDiagram(engine, 'UseCaseDiagram', repo.project as Elem).diagram
    const subject = createNode(engine, { kind: 'Subject', diagram: useCases, left: 0, top: 0 }).view as NodeView
    const u1 = createNode(engine, { kind: 'UseCase', diagram: useCases, left: 20, top: 20, container: subject })
      .view as NodeView
    const u2 = createNode(engine, { kind: 'UseCase', diagram: useCases, left: 20, top: 120, container: subject })
      .view as NodeView
    const edge = createEdge(engine, { kind: 'Include', diagram: useCases, tail: u1, head: u2 }).view as View
    const label = (u1 as UMLClassifierView).nameCompartment?.nameLabel as NodeView
    const labelLeft = label.left
    const points = edge['points']
    moveViews(engine, [subject], 10, 5)
    expect([subject.left, u1.left, u2.top, label.left]).toEqual([10, 30, 125, labelLeft + 10])
    expect(edge['points']).toEqual((points as { x: number; y: number }[]).map((p) => ({ x: p.x + 10, y: p.y + 5 })))
    expect(engine.undoName).toBe('Move Views')
    engine.undo()
    expect([subject.left, u1.left, label.left]).toEqual([0, 20, labelLeft])

    setViewBounds(engine, u1, { left: 100, width: 200 })
    expect([u1.left, u1.width, label.left]).toEqual([100, 200, labelLeft + 80])
  })
})

describe('delete', () => {
  function classDiagramWithRelations() {
    const ctx = setup()
    const { engine, diagram } = ctx
    const a = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    const b = createNode(engine, { kind: 'Class', diagram, left: 300, top: 0 })
    const assoc = createEdge(engine, { kind: 'Association', diagram, tail: a.view as View, head: b.view as View })
    const gen = createEdge(engine, { kind: 'Generalization', diagram, tail: b.view as View, head: a.view as View })
    const attr = addAttribute(engine, b.model as Elem, { type: a.model })
    const note = createNode(engine, { kind: 'Note', diagram, left: 0, top: 300 })
    const link = createEdge(engine, { kind: 'NoteLink', diagram, tail: note.view as View, head: a.view as View })
    return { ...ctx, a, b, assoc, gen, attr, note, link }
  }

  it('delete from model cascades to relationships, views and attached edges; clears outside references', () => {
    const ctx = classDiagramWithRelations()
    const { engine, repo, diagram, a, b, assoc, gen, attr, link, project } = ctx
    const before = snapshot(project)
    const set = collectDeletion(repo, [a.model as Elem], 'model')
    for (const el of [a.model, a.view, assoc.model, assoc.view, gen.model, gen.view, link.view]) {
      expect(set.has(el as Elem)).toBe(true)
    }
    expect(set.has(b.model as Elem)).toBe(false)

    deleteFromModel(engine, [a.model as Elem])
    expect(engine.undoDepth).toBeGreaterThan(0)
    for (const el of [a.model, a.view, assoc.model, gen.model, link.view]) expect(repo.has((el as Elem)._id)).toBe(false)
    expect(repo.has((b.model as Elem)._id)).toBe(true)
    expect(attr['type']).toBeNull()
    expect(diagram.ownedViews.map((v) => v._type)).toEqual(['UMLClassView', 'UMLNoteView'])
    expect(validateModel(project)).toEqual([])

    engine.undo()
    expect(snapshot(project)).toBe(before)
    expect(attr['type']).toBe(repo.get((a.model as Elem)._id))
    expect(validateModel(project)).toEqual([])
    engine.redo()
    expect(repo.has((a.model as Elem)._id)).toBe(false)
  })

  it('delete from view keeps the model and removes attached edges only', () => {
    const { engine, repo, diagram, a, assoc, link } = classDiagramWithRelations()
    deleteFromView(engine, [a.view as View])
    expect(repo.has((a.model as Elem)._id)).toBe(true)
    expect(repo.has((assoc.model as Elem)._id)).toBe(true)
    expect(repo.has((assoc.view as View)._id)).toBe(false)
    expect(repo.has((link.view as View)._id)).toBe(false)
    expect(diagram.ownedViews).toHaveLength(2)
    engine.undo()
    expect(diagram.ownedViews).toHaveLength(6)
  })

  it('deleting a diagram deletes its views; the project and embedded parts are never deleted', () => {
    const { engine, repo, diagram, a, project } = classDiagramWithRelations()
    const compartment = (a.view as UMLClassifierView).nameCompartment as View
    expect(collectDeletion(repo, [project, compartment], 'model').size).toBe(0)
    deleteFromModel(engine, [diagram])
    expect(repo.has((a.view as View)._id)).toBe(false)
    expect(repo.has((a.model as Elem)._id)).toBe(true)
  })

  it('deleting a lifeline deletes its messages, message views and attached activations', () => {
    const { engine, repo } = setup()
    const seq = createDiagram(engine, 'SequenceDiagram', repo.project?.ownedElements[0] as Elem).diagram
    const l1 = createNode(engine, { kind: 'Lifeline', diagram: seq, left: 50, top: 0 })
    const l2 = createNode(engine, { kind: 'Lifeline', diagram: seq, left: 250, top: 0 })
    const msg = createEdge(engine, { kind: 'Message', diagram: seq, tail: l1.view as View, head: l2.view as View })
    expect((msg.view as View)['tail']).toBe((l1.view as UMLSeqLifelineView).linePart)
    deleteFromModel(engine, [l2.model as Elem])
    expect(repo.has((msg.model as Elem)._id)).toBe(false)
    expect(repo.has((msg.view as View)._id)).toBe(false)
    expect(repo.has((l1.view as View)._id)).toBe(true)
    // The role attribute is kept, as in the reference behavior.
    expect(repo.has(((l2.model as Elem)['represent'] as Elem)._id)).toBe(true)
  })
})

describe('dirty flag', () => {
  it('tracks the saved point through execute, undo and redo', () => {
    const { engine, model } = setup()
    expect(engine.isDirty).toBe(false)
    setFields(engine, model, { name: 'A' })
    expect(engine.isDirty).toBe(true)
    engine.markSaved()
    expect(engine.isDirty).toBe(false)
    engine.undo()
    expect(engine.isDirty).toBe(true)
    engine.redo()
    expect(engine.isDirty).toBe(false)
    engine.undo()
    setFields(engine, model, { name: 'B' })
    expect(engine.isDirty).toBe(true)
  })

  it('stays dirty when the saved point falls off the bottom of the history', () => {
    const { engine, model } = setup()
    for (let i = 0; i < 101; i++) setFields(engine, model, { name: `M${i}` })
    while (engine.canUndo) engine.undo()
    expect(engine.isDirty).toBe(true)
  })

  it('read-only mode makes edits no-ops', () => {
    const { engine, model } = setup()
    engine.readOnly = true
    setFields(engine, model, { name: 'Nope' })
    expect(model['name']).toBe('Model')
    expect(engine.isDirty).toBe(false)
  })
})

describe('fragments', () => {
  it('imports a fragment with fresh ids as a bypass operation that marks the project dirty', () => {
    const { engine, diagram, repo, model } = setup()
    const a = createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    const b = createNode(engine, { kind: 'Class', diagram, left: 300, top: 0 })
    createEdge(engine, { kind: 'Dependency', diagram, tail: a.view as View, head: b.view as View })
    addAttribute(engine, a.model as Elem, { name: 'x' })
    engine.markSaved()
    const depth = engine.undoDepth

    const imported = importFragment(engine, writeFragment(a.model as Elem), model)
    expect(imported._id).not.toBe((a.model as Elem)._id)
    expect(imported._parent).toBe(model)
    const dep = (imported['ownedElements'] as Elem[])[0] as Elem
    expect(dep['source']).toBe(imported)
    expect(dep['target']).toBe(b.model)
    expect((imported['attributes'] as Elem[])[0]?._parent).toBe(imported)
    expect(repo.get(imported._id)).toBe(imported)
    expect(engine.undoDepth).toBe(depth)
    expect(engine.isDirty).toBe(true)
  })
})

describe('CommandRegistry', () => {
  it('registers, executes and reports enablement', () => {
    const registry = new CommandRegistry()
    let enabled = false
    const run = vi.fn(() => 42)
    const off = registry.register({ id: 'test.cmd', label: 'Test', run, isEnabled: () => enabled })
    expect(registry.isEnabled('test.cmd')).toBe(false)
    expect(registry.execute('test.cmd')).toBeUndefined()
    enabled = true
    expect(registry.execute('test.cmd', 'arg')).toBe(42)
    expect(run).toHaveBeenCalledWith('arg')
    expect(() => registry.register({ id: 'test.cmd', label: 'Dup', run })).toThrow()
    off()
    expect(registry.has('test.cmd')).toBe(false)
    expect(registry.isEnabled('missing')).toBe(false)
  })
})
