import { describe, expect, it } from 'vitest'
import { addAttribute, ModelEngine } from '../../commands'
import { createDefaultProject, createElement, Repository, type Elem } from '../../model'
import { ADD_DIAGRAM_ITEMS, ADD_ITEMS, addDiagram, addDiagramItemsFor, addItemsFor, addModelElement } from '../modelActions'
import { dropField, expandableIds, explorerChildren, explorerLabel, hasExplorerChildren, pathTo } from './tree'

function setup(): { engine: ModelEngine; project: Elem; model: Elem } {
  const project = createDefaultProject()
  const engine = new ModelEngine(new Repository(project))
  const model = (project['ownedElements'] as Elem[])[0] as Elem
  return { engine, project, model }
}

const item = (id: string) => {
  const found = ADD_ITEMS.find((i) => i.id === id)
  if (!found) throw new Error(id)
  return found
}

describe('explorer tree', () => {
  it('groups diagrams first, then packages, classifiers and relationships; sorts by name on request', () => {
    const { engine, model } = setup()
    const zeta = addModelElement(engine, model, item('class'))
    engine.transact('rename', (b) => b.set(zeta, 'name', 'Zeta'))
    const alpha = addModelElement(engine, model, item('class'))
    engine.transact('rename', (b) => b.set(alpha, 'name', 'Alpha'))
    const pkg = addModelElement(engine, model, item('package'))
    const actor = addModelElement(engine, model, item('actor'))
    const children = explorerChildren(model)
    expect(children.map((c) => c._type)).toEqual(['UMLClassDiagram', 'UMLPackage', 'UMLClass', 'UMLClass', 'UMLActor'])
    expect(children.slice(2, 4)).toEqual([zeta, alpha])
    expect(explorerChildren(model, 'name').slice(2, 4)).toEqual([alpha, zeta])
    expect(children).toContain(pkg)
    expect(children).toContain(actor)
  })

  it('shows features but not views, tags or association ends', () => {
    const { engine, model } = setup()
    const cls = addModelElement(engine, model, item('class'))
    addAttribute(engine, cls)
    expect(hasExplorerChildren(cls)).toBe(true)
    expect(explorerChildren(cls).map((c) => c._type)).toEqual(['UMLAttribute'])
    const diagram = explorerChildren(model)[0] as Elem
    expect(hasExplorerChildren(diagram)).toBe(false)
    const assoc = createElement('UMLAssociation')
    assoc['end1'] = createElement('UMLAssociationEnd', { _parent: assoc })
    expect(explorerChildren(assoc)).toEqual([])
  })

  it('labels unnamed elements and relationships', () => {
    const a = createElement('UMLClass', { name: 'A' })
    const b = createElement('UMLClass', { name: 'B' })
    expect(explorerLabel(createElement('UMLGeneralization', { source: a, target: b }))).toBe('(A→B)')
    expect(explorerLabel(createElement('UMLDependency', { name: 'uses', source: a, target: b }))).toBe('uses (A→B)')
    const assoc = createElement('UMLAssociation')
    assoc['end1'] = createElement('UMLAssociationEnd', { reference: a })
    assoc['end2'] = createElement('UMLAssociationEnd', { reference: b })
    expect(explorerLabel(assoc)).toBe('(A—B)')
    expect(explorerLabel(createElement('UMLClass'))).toBe('(Class)')
    expect(explorerLabel(createElement('UMLClass', { name: 'X', stereotype: 'entity' }))).toBe('«entity»X')
    expect(explorerLabel(createElement('UMLClass', { name: 'X', stereotype: 'entity' }), false)).toBe('X')
  })

  it('validates drop targets for re-parenting', () => {
    const { engine, project, model } = setup()
    const pkg = addModelElement(engine, model, item('package'))
    const cls = addModelElement(engine, model, item('class'))
    const other = addModelElement(engine, model, item('class'))
    const attr = addAttribute(engine, cls)
    expect(dropField(pkg, cls)).toBe('ownedElements')
    expect(dropField(other, attr)).toBe('attributes')
    expect(dropField(pkg, attr)).toBeNull()
    expect(dropField(cls, cls)).toBeNull()
    expect(dropField(pkg, other)).toBe('ownedElements')
    expect(dropField(project, pkg)).toBe('ownedElements')
    expect(dropField(model, project)).toBeNull()
    // An element cannot be dropped into its own descendant.
    expect(dropField(cls, model)).toBeNull()
    expect(dropField(pkg, model)).toBeNull()
  })

  it('computes paths and expandable ids', () => {
    const { engine, project, model } = setup()
    const cls = addModelElement(engine, model, item('class'))
    expect(pathTo(cls)).toEqual([project, model, cls])
    expect(expandableIds(project)).toEqual([project._id, model._id])
  })
})

describe('Model > Add', () => {
  it('offers items according to the selected parent', () => {
    const { engine, project, model } = setup()
    const ids = (parent: Elem) => addItemsFor(parent).map((i) => i.id)
    expect(ids(project)).toEqual(expect.arrayContaining(['model', 'package', 'class', 'usecase', 'actor', 'collaboration']))
    expect(ids(project)).not.toContain('attribute')
    const cls = addModelElement(engine, model, item('class'))
    expect(ids(cls)).toEqual(expect.arrayContaining(['attribute', 'operation', 'class', 'interaction']))
    expect(ids(cls)).not.toContain('model')
    const en = addModelElement(engine, model, item('enumeration'))
    expect(ids(en)).toContain('enumeration-literal')
    const op = addModelElement(engine, cls, item('operation'))
    expect(ids(op)).toEqual(['parameter'])
    expect(addItemsFor(null)).toEqual([])
  })

  it('creates elements with unique default names, one undo step each', () => {
    const { engine, model } = setup()
    const c1 = addModelElement(engine, model, item('class'))
    const c2 = addModelElement(engine, model, item('class'))
    expect([c1['name'], c2['name']]).toEqual(['Class1', 'Class2'])
    const attr = addModelElement(engine, c1, item('attribute'))
    expect(attr._parent).toBe(c1)
    expect((c1['attributes'] as Elem[]).includes(attr)).toBe(true)
    const activity = addModelElement(engine, model, item('activity'))
    const action = addModelElement(engine, activity, item('action'))
    expect((activity['nodes'] as Elem[]).includes(action)).toBe(true)
    expect(engine.undoName).toBe('Add Action')
    engine.undo()
    expect((activity['nodes'] as Elem[]).length).toBe(0)
    expect(() => addModelElement(engine, model, item('attribute'))).toThrow(/cannot be placed here/)
  })

  it('creates diagrams and offers diagram kinds per parent', () => {
    const { engine, project, model } = setup()
    expect(addDiagramItemsFor(project).map((i) => i.kind)).toEqual(ADD_DIAGRAM_ITEMS.map((i) => i.kind))
    const cls = addModelElement(engine, model, item('class'))
    expect(addDiagramItemsFor(cls).map((i) => i.kind)).toEqual(['SequenceDiagram', 'ActivityDiagram'])
    const diagram = addDiagram(engine, project, 'ClassDiagram')
    expect(diagram._type).toBe('UMLClassDiagram')
    expect(diagram._parent?._type).toBe('UMLModel')
    const seq = addDiagram(engine, cls, 'SequenceDiagram')
    expect(seq._parent?._type).toBe('UMLInteraction')
    expect(() => addDiagram(engine, cls, 'ClassDiagram')).toThrow()
  })
})
