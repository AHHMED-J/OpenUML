import { describe, expect, it } from 'vitest'
import { addOperation, addParameter, setFields } from '../../commands'
import { createElement, type EdgeView, type Elem, type NodeView, type UMLOperation, type UMLParameter, type View } from '../../model'
import { testDiagram } from '../testUtils'
import { createEdgeBetween, createNodeAt, findDropContainer, moveSelection, reconnectEnd, resizeNode, setEdgeVertices } from './actions'
import { alignBoxes } from './alignment'
import { hitTestDiagram, viewsInBand } from './hitTest'
import { applyQuickEdit } from './quickEditApply'
import { parseAttribute, parseName, parseOperation } from './quickEditSyntax'

describe('editor actions', () => {
  it('creates nodes inside packages (model owned by the package) and connects with canConnect', () => {
    const t = testDiagram()
    const pkg = t.node('Package', 0, 0, 400, 300)
    const id = createNodeAt(t, t.layout(), 'Class', { left: 40, top: 60, width: 120, height: 80 })
    const view = t.repository.get(id!) as View
    expect(view.containerView).toBe(pkg)
    expect(view.model?._parent).toBe(pkg.model)
    const other = t.node('Interface', 600, 50)
    const layout = t.layout()
    expect(createEdgeBetween(t, layout, { kind: 'Generalization' }, view._id, view._id, { x: 0, y: 0 })).toBeNull()
    const edgeId = createEdgeBetween(t, layout, { kind: 'InterfaceRealization' }, view._id, other._id, { x: 0, y: 0 })
    const edge = t.repository.get(edgeId!) as EdgeView
    expect(edge.model?.['source']).toBe(view.model)
    // Stored points are the routed ones (attached to both boxes).
    expect(edge.points).toEqual(t.layout().edges.get(edge._id)?.points)
  })

  it('moves views with snap-free deltas, re-routes attached edges and re-contains on drop', () => {
    const t = testDiagram()
    const pkg = t.node('Package', 400, 0, 300, 300)
    const a = t.node('Class', 0, 0, 100, 60) as NodeView
    const b = t.node('Class', 0, 200, 100, 60)
    const e = t.edge('Dependency', a, b) as EdgeView
    const layout = t.layout()
    expect(findDropContainer(t, layout, { x: 450, y: 100 }, [a])).toBe(pkg)
    moveSelection(t, [a._id], 420, 40, { container: pkg })
    expect([a.left, a.top]).toEqual([420, 40])
    expect(pkg.containedViews).toContain(a)
    expect(a.model?._parent).toBe(pkg.model)
    expect(e.points).toEqual(t.layout().edges.get(e._id)?.points)
    // Moving the package moves its contents.
    moveSelection(t, [pkg._id], 10, 0)
    expect(a.left).toBe(430)
    // Dragging out moves the model back to the diagram's owner.
    moveSelection(t, [a._id], -400, 0, { container: null })
    expect(a.containerView).toBeNull()
    expect(a.model?._parent).toBe(t.diagram._parent)
    // Each gesture is one undo step.
    t.engine.undo()
    expect(a.model?._parent).toBe(pkg.model)
  })

  it('resizes, edits bends and reconnects ends (updating the relationship)', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60) as NodeView
    const b = t.node('Class', 300, 0, 100, 60)
    const c = t.node('Class', 300, 200, 100, 60)
    const e = t.edge('Generalization', a, b) as EdgeView
    resizeNode(t, a._id, { left: 0, top: 0, width: 160, height: 90 })
    expect([a.width, a.height]).toEqual([160, 90])
    setEdgeVertices(t, e._id, [e.points[0]!, { x: 230, y: 150 }, e.points[1]!])
    expect(e.points).toHaveLength(3)
    expect(e.points[1]).toEqual({ x: 230, y: 150 })
    expect(reconnectEnd(t, e._id, 'head', a._id)).toBe(false) // self-generalization is invalid
    expect(reconnectEnd(t, e._id, 'head', c._id)).toBe(true)
    expect(e.head).toBe(c)
    expect(e.model?.['target']).toBe(c.model)
  })

  it('hit-tests handles, nodes and edges, and selects with a rubber band', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    const e = t.edge('Association', a, b)
    const layout = t.layout()
    expect(hitTestDiagram(layout, { x: 50, y: 10 }, { selected: new Set(), zoom: 1 })).toMatchObject({ kind: 'node', viewId: a._id, region: { target: { kind: 'name' } } })
    expect(hitTestDiagram(layout, { x: 200, y: 32 }, { selected: new Set(), zoom: 1 })).toMatchObject({ kind: 'edge', viewId: e._id })
    expect(hitTestDiagram(layout, { x: 104, y: 64 }, { selected: new Set([a._id]), zoom: 1 })).toMatchObject({ kind: 'handle', handle: 'se' })
    expect(viewsInBand(layout, { left: -5, top: -5, width: 120, height: 80 })).toEqual([a._id])
    expect(viewsInBand(layout, { left: -5, top: -5, width: 500, height: 80 }).sort()).toEqual([a._id, b._id, e._id].sort())
  })

  it('aligns, distributes and equalizes boxes', () => {
    const boxes = [
      { left: 10, top: 0, width: 50, height: 20 },
      { left: 100, top: 30, width: 30, height: 40 },
      { left: 200, top: 10, width: 40, height: 10 }
    ]
    expect(alignBoxes('align-left', boxes).map((b) => b.left)).toEqual([10, 10, 10])
    expect(alignBoxes('align-right', boxes).map((b) => b.left + b.width)).toEqual([240, 240, 240])
    expect(alignBoxes('align-bottom', boxes).map((b) => b.top + b.height)).toEqual([70, 70, 70])
    const spaced = alignBoxes('space-equally-horizontally', boxes)
    // Span 10..240 = 230, widths 120 → gap 55.
    expect(spaced.map((b) => b.left)).toEqual([10, 115, 200])
    expect(alignBoxes('set-size-equally', boxes).map((b) => [b.width, b.height])).toEqual([
      [50, 40],
      [50, 40],
      [50, 40]
    ])
  })
})

describe('quick edit', () => {
  it('parses the textual notations', () => {
    expect(parseName('<<entity>> -Customer')).toEqual({ stereotype: 'entity', visibility: 'private', name: 'Customer' })
    expect(parseName('Order Line')).toEqual({ stereotype: null, visibility: null, name: 'Order Line' })
    expect(parseName('bad(name)')).toBeNull()
    expect(parseAttribute('- count : int [0..1] = 0')).toEqual({ stereotype: null, visibility: 'private', name: 'count', type: 'int', multiplicity: '0..1', defaultValue: '0' })
    expect(parseAttribute('items: List<Item>[*]')).toMatchObject({ name: 'items', type: 'List<Item>', multiplicity: '*' })
    expect(parseAttribute('x []')).toMatchObject({ name: 'x', multiplicity: '' })
    expect(parseAttribute(': int')).toBeNull()
    expect(parseOperation('+ find(in key : String, limit : int = 10) : Item[*]')).toEqual({
      stereotype: null,
      visibility: 'public',
      name: 'find',
      parameters: [
        { direction: 'in', name: 'key', type: 'String', multiplicity: '', defaultValue: '' },
        { direction: 'in', name: 'limit', type: 'int', multiplicity: '', defaultValue: '10' }
      ],
      returnType: 'Item',
      returnMultiplicity: '*'
    })
    expect(parseOperation('run')).toMatchObject({ name: 'run', parameters: null, returnType: null })
    expect(parseOperation('f(: x)')).toBeNull()
  })

  it('applies an operation edit updating parameters in place (one undo step)', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0)
    const cls = t.node('Class', 300, 0).model as Elem
    const op = addOperation(t.engine, view.model as Elem, { name: 'old' }) as UMLOperation
    const p1 = addParameter(t.engine, op, { name: 'a' }) as UMLParameter
    addParameter(t.engine, op, { name: 'b' })
    const ok = applyQuickEdit(t.engine, { kind: 'operation', elementId: op._id, classifierId: (view.model as Elem)._id }, '#find(out key: Class2): int')
    expect(ok).toBe(true)
    expect(op.name).toBe('find')
    expect(op.visibility).toBe('protected')
    expect(op.parameters).toHaveLength(2)
    expect(op.parameters[0]).toBe(p1) // updated in place
    expect(p1.name).toBe('key')
    expect(p1.direction).toBe('out')
    expect(p1.type).toBe(cls) // resolved by name
    expect(op.parameters[1]?.direction).toBe('return')
    expect(op.parameters[1]?.type).toBe('int')
    t.engine.undo()
    expect(op.name).toBe('old')
    expect(op.parameters.map((p) => p.name)).toEqual(['a', 'b'])
    expect(applyQuickEdit(t.engine, { kind: 'operation', elementId: op._id, classifierId: '' }, 'f(')).toBe(false)
  })

  it('applies names, attributes and note text', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0)
    const model = view.model as Elem
    expect(applyQuickEdit(t.engine, { kind: 'name', elementId: model._id }, '<<entity>> Customer')).toBe(true)
    expect(model['name']).toBe('Customer')
    expect(model['stereotype']).toBe('entity')
    const note = t.node('Note', 200, 200)
    expect(applyQuickEdit(t.engine, { kind: 'text', viewId: note._id }, 'line 1\nline 2')).toBe(true)
    expect(note['text']).toBe('line 1\nline 2')
    const layout = t.layout().nodes.get(note._id)
    expect((layout?.data as { lines: unknown[] }).lines).toHaveLength(2)
  })

  it('applies typed names (name: Type[mult]) to pins and object nodes', () => {
    const t = testDiagram()
    const cls = t.node('Class', 0, 0).model as Elem
    setFields(t.engine, cls, { name: 'Money' })
    const pin = createElement('UMLInputPin', { name: 'InputPin1' })
    t.engine.transact('Add', (b) => b.insert(cls._parent as Elem, 'ownedElements', pin))
    expect(applyQuickEdit(t.engine, { kind: 'typedName', elementId: pin._id }, 'amount: Money[0..1]')).toBe(true)
    expect(pin['name']).toBe('amount')
    expect(pin['type']).toBe(cls)
    expect(pin['multiplicity']).toBe('0..1')
    expect(applyQuickEdit(t.engine, { kind: 'typedName', elementId: pin._id }, 'qty: Integer')).toBe(true)
    expect(pin['type']).toBe('Integer')
    expect(pin['multiplicity']).toBe('')
    expect(applyQuickEdit(t.engine, { kind: 'typedName', elementId: pin._id }, 'a(b')).toBe(false)
  })
})
