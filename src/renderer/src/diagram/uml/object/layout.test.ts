import { describe, expect, it } from 'vitest'
import { addFeature, setFields } from '../../../commands'
import { isKindOf, type Elem, type NodeView } from '../../../model'
import { createNodeAt } from '../../editor/actions'
import { applyQuickEdit } from '../../editor/quickEditApply'
import type { InstanceData } from './layout'
import { parseObject, parseSlot, slotText } from './strings'
import { structureTest } from './testEnv'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).
const BOLD_CHAR = 13 * 0.6 * 1.1

describe('instance label and slot strings', () => {
  it('formats name: Type with the classifier name or raw string', () => {
    const t = structureTest('ObjectDiagram')
    const view = t.node('Object', 20, 20, { name: 'o1' })
    const object = view.model as Elem
    setFields(t.engine, object, { classifier: 'Customer' })
    const d = t.nodeLayout<InstanceData>(view).data
    expect(d.nameLines[0]?.text).toBe('o1: Customer')
    expect(d.nameLines[0]?.underline).toBe(true)
  })

  it('shows the value on the namespace line and slot rows in the slot compartment', () => {
    const t = structureTest('ObjectDiagram')
    const view = t.node('Object', 20, 20, { name: 'o1' })
    const object = view.model as Elem
    setFields(t.engine, object, { value: '42' })
    const slot = addFeature(t.engine, object, 'Slot', { name: 'age', type: 'int', value: '3' })
    const l = t.nodeLayout<InstanceData>(view)
    expect(l.data.nameLines.map((x) => x.text)).toEqual(['o1', '42'])
    expect(l.data.slots?.rows.map((r) => r.text)).toEqual(['+age: int = 3'])
    expect((view as NodeView & { slotCompartment: NodeView }).slotCompartment.subViews).toHaveLength(1)
    expect(slotText(slot, { showVisibility: false })).toBe('age: int = 3')
  })

  it('takes slot name, type and multiplicity from the defining attribute', () => {
    const attr = { _type: 'UMLAttribute', _id: 'a', _parent: null, name: 'items', type: 'Item', multiplicity: '0..*' } as Elem
    const slot = { _type: 'UMLSlot', _id: 's', _parent: null, name: 'ignored', definingFeature: attr, value: 'x', visibility: 'private' } as Elem
    expect(slotText(slot)).toBe('-items: Item[0..*] = x')
  })

  it('has no slot compartment without slots and grows with the widest slot row', () => {
    const t = structureTest('ObjectDiagram')
    const view = t.node('Object', 20, 20, { name: 'o' })
    expect(t.nodeLayout<InstanceData>(view).data.slots).toBeNull()
    addFeature(t.engine, view.model as Elem, 'Slot', { name: 'a-very-long-slot-name', type: 'String', value: '"hello world"' })
    const l = t.nodeLayout<InstanceData>(view)
    expect(l.data.slots).not.toBeNull()
    expect(l.minWidth).toBeGreaterThan(120)
  })
})

describe('quick edit syntaxes', () => {
  it('parses the object expression', () => {
    expect(parseObject('<<entity>> +o1 : Customer')).toEqual({ stereotype: 'entity', visibility: 'public', name: 'o1', type: 'Customer' })
    expect(parseObject(': Customer')).toMatchObject({ name: '', type: 'Customer' })
    expect(parseObject('o1')).toMatchObject({ name: 'o1', type: null })
    expect(parseObject('a=b')).toBeNull()
  })

  it('parses the slot expression', () => {
    expect(parseSlot('-age : int = 42')).toEqual({ stereotype: null, visibility: 'private', name: 'age', type: 'int', value: '42' })
    expect(parseSlot('name')).toMatchObject({ name: 'name', type: null, value: '' })
    expect(parseSlot(': int')).toBeNull()
  })

  it('resolves the type to a classifier by name, else keeps text; absent type clears it', () => {
    const t = structureTest('ObjectDiagram')
    const view = t.node('Object', 20, 20, { name: 'o' })
    const object = view.model as Elem
    const customer = { _type: 'UMLClass', _id: 'c1', _parent: t.model, name: 'Customer' } as Elem
    t.engine.transact('add', (b) => b.insert(t.model, 'ownedElements', customer))
    expect(applyQuickEdit(t.engine, { kind: 'custom', elementId: object._id, syntax: 'object' }, 'o2 : Customer')).toBe(true)
    expect(object['name']).toBe('o2')
    expect(object['classifier']).toBe(customer)
    expect(applyQuickEdit(t.engine, { kind: 'custom', elementId: object._id, syntax: 'object' }, 'o2 : Unknown')).toBe(true)
    expect(object['classifier']).toBe('Unknown')
    expect(applyQuickEdit(t.engine, { kind: 'custom', elementId: object._id, syntax: 'object' }, 'o2')).toBe(true)
    expect(object['classifier']).toBeNull()

    const slot = addFeature(t.engine, object, 'Slot')
    expect(applyQuickEdit(t.engine, { kind: 'custom', elementId: slot._id, syntax: 'slot' }, 'qty : int = 7')).toBe(true)
    expect(slot).toMatchObject({ name: 'qty', type: 'int', value: '7' })
    expect(applyQuickEdit(t.engine, { kind: 'custom', elementId: slot._id, syntax: 'slot' }, 'qty')).toBe(true)
    expect(slot).toMatchObject({ type: null, value: '' })
  })
})

describe('instance shapes', () => {
  it('draws node instances as a 3D box and component instances with tabs', () => {
    const t = structureTest('ObjectDiagram')
    const node = t.node('NodeInstance', 20, 20, { name: 'server' })
    const comp = t.node('ComponentInstance', 220, 20, { name: 'web' })
    const art = t.node('ArtifactInstance', 420, 20, { name: 'war' })
    const nd = t.nodeLayout<InstanceData>(node).data
    expect(nd.shape).toBe('node')
    expect(nd.faces).toHaveLength(2)
    expect(nd.body.height).toBe(t.nodeLayout(node).box.height - 10)
    expect(t.nodeLayout<InstanceData>(comp).data.tabs).toHaveLength(2)
    expect(t.nodeLayout<InstanceData>(art).data.shape).toBe('artifact')
    expect(isKindOf(art, 'UMLGeneralNodeView')).toBe(true)
  })

  it('minimum width follows the bold underlined name', () => {
    const t = structureTest('ObjectDiagram')
    const view = t.node('Object', 20, 20, { name: 'abcdefghij', width: 10 })
    const l = t.nodeLayout<InstanceData>(view)
    expect(l.minWidth).toBe(Math.ceil(10 * BOLD_CHAR) + 10)
    expect(l.box.height).toBeGreaterThanOrEqual(25)
  })
})

describe('links', () => {
  it('creates a link owned by the tail instance with both ends referencing instances', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 300, 20)
    const link = t.edge('Link', a, b)
    const model = link.model as Elem
    expect(model._type).toBe('UMLLink')
    expect(model._parent).toBe(a.model)
    expect((model['end1'] as Elem)['reference']).toBe(a.model)
    expect((model['end2'] as Elem)['reference']).toBe(b.model)
    expect(link._type).toBe('UMLLinkView')
    const l = t.edgeLayout(link)
    expect(l.dash).toBe('solid')
    expect(l.headEnd.style).toBe('flat')
  })

  it('a directed link has a navigable head end drawn as a stick arrow', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 300, 20)
    const link = t.edge('DirectedLink', a, b)
    expect(((link.model as Elem)['end2'] as Elem)['navigable']).toBe('navigable')
    expect(t.edgeLayout(link).headEnd.style).toBe('stickArrow')
    expect(t.edgeLayout(link).tailEnd.style).toBe('flat')
  })

  it('shows the link name and end role names / multiplicities', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 300, 20)
    const link = t.edge('Link', a, b, { name: 'owns' })
    const model = link.model as Elem
    setFields(t.engine, model['end2'] as Elem, { name: 'target', multiplicity: '1..*' })
    const texts = t.edgeLayout(link).labels.map((x) => x.text)
    expect(texts).toEqual(expect.arrayContaining(['owns', 'target', '1..*']))
  })

  it('only connects instances', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const note = t.node('Note', 300, 20)
    expect(() => t.edge('Link', a, note)).toThrow()
  })

  it('link object creates object, link and link-object link in one step', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 320, 20)
    const before = t.diagram.ownedViews.length
    const objectView = t.edge('LinkObject', a, b)
    expect(t.diagram.ownedViews.length - before).toBe(3)
    const views = t.diagram.ownedViews.slice(before)
    expect(views.map((v) => v._type).sort()).toEqual(['UMLLinkObjectLinkView', 'UMLLinkView', 'UMLObjectView'])
    const object = objectView.model as Elem
    expect(object['name']).toBe('LinkObject1')
    expect(object._parent).toBe(t.diagram._parent)
    const link = views.find((v) => v._type === 'UMLLinkView')!
    const loLinkView = views.find((v) => v._type === 'UMLLinkObjectLinkView') as unknown as { model: Elem; tail: unknown; head: unknown }
    expect(loLinkView.model['objectSide']).toBe(object)
    expect(loLinkView.model['linkSide']).toBe(link.model)
    expect(loLinkView.tail).toBe(objectView)
    expect(loLinkView.head).toBe(link)
    // The object sits 30 below the link's middle; the connector is dashed with no ends.
    const layout = t.layout()
    const linkL = layout.edges.get(link._id)!
    const objL = layout.nodes.get(objectView._id)!
    const mid = (linkL.points[0]!.y + linkL.points[linkL.points.length - 1]!.y) / 2
    expect(objL.box.top).toBeGreaterThanOrEqual(mid + 30 - 1)
    const loL = layout.edges.get((loLinkView as unknown as { _id: string })._id)!
    expect(loL.dash).toBe('dot')
    expect(loL.headEnd.style).toBe('flat')
    expect(loL.points.length).toBeGreaterThanOrEqual(2)
  })

  it('link-object link joins an existing object to an existing link', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 320, 20)
    const c = t.node('Object', 170, 200)
    const link = t.edge('Link', a, b)
    const lol = t.edge('LinkObjectLink', c, link)
    expect((lol.model as Elem)['objectSide']).toBe(c.model)
    expect((lol.model as Elem)['linkSide']).toBe(link.model)
    expect(() => t.edge('LinkObjectLink', a, b)).toThrow()
    expect(t.edgeLayout(lol).points.length).toBeGreaterThanOrEqual(2)
  })
})

describe('containment', () => {
  it('a package view accepts objects and re-parents their models', () => {
    const t = structureTest('ObjectDiagram')
    const pkg = t.node('Package', 20, 20, { width: 300, height: 200 })
    const id = createNodeAt(t, t.layout(), 'Object', { left: 60, top: 80, width: 0, height: 0 })
    expect(id).not.toBeNull()
    const view = t.repository.get(id as string) as NodeView
    expect(view.containerView).toBe(pkg)
    expect((view.model as Elem)._parent).toBe(pkg.model)
    // Classes are still accepted by packages.
    const cls = createNodeAt(t, t.layout(), 'Class', { left: 100, top: 120, width: 0, height: 0 })
    expect((t.repository.get(cls as string) as NodeView).containerView).toBe(pkg)
    // An object dropped outside stays under the diagram owner.
    const free = createNodeAt(t, t.layout(), 'Object', { left: 600, top: 400, width: 0, height: 0 })
    expect(((t.repository.get(free as string) as NodeView).model as Elem)._parent).toBe(t.diagram._parent)
  })
})
