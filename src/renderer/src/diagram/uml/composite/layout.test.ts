import { describe, expect, it } from 'vitest'
import { setFields } from '../../../commands'
import { canConnect, isKindOf, type Elem, type NodeView } from '../../../model'
import { createNodeAt, moveSelection } from '../../editor/actions'
import { structureTest } from '../object/testEnv'
import { collaborationUseText, connectorLabelText, typedFeatureText } from './strings'
import { snapToBorder, type CollaborationData, type PartData, type PortData } from './layout'

const HOST = { left: 100, top: 100, width: 200, height: 100 }

describe('port snapping', () => {
  it('projects axis-aligned drags orthogonally onto the border', () => {
    expect(snapToBorder(HOST, { x: 340, y: 150 })).toEqual({ point: { x: 300, y: 150 }, side: 'right' })
    expect(snapToBorder(HOST, { x: 200, y: 60 })).toEqual({ point: { x: 200, y: 100 }, side: 'top' })
    expect(snapToBorder(HOST, { x: 20, y: 150 }).point).toEqual({ x: 100, y: 150 })
  })

  it('intersects the ray from the center through an outside point with the border', () => {
    // Center (200, 150); direction (200, 100) hits the right side at x = 300, y = 200 (corner).
    const corner = snapToBorder(HOST, { x: 400, y: 250 })
    expect(corner.point).toEqual({ x: 300, y: 200 })
    // Direction (200, 50): right side at y = 150 + 50 * (100 / 200) = 175.
    expect(snapToBorder(HOST, { x: 400, y: 200 })).toEqual({ point: { x: 300, y: 175 }, side: 'right' })
  })

  it('snaps an inside drag to the nearest border crossing', () => {
    expect(snapToBorder(HOST, { x: 290, y: 140 })).toEqual({ point: { x: 300, y: 140 }, side: 'right' })
    expect(snapToBorder(HOST, { x: 150, y: 190 })).toEqual({ point: { x: 150, y: 200 }, side: 'bottom' })
  })

  it('follows an ellipse outline radially', () => {
    const p = snapToBorder(HOST, { x: 200, y: 300 }, 'ellipse')
    expect(p.point.x).toBeCloseTo(200)
    expect(p.point.y).toBeCloseTo(200)
    expect(p.side).toBe('bottom')
  })
})

describe('strings', () => {
  it('formats name: Type[mult] without visibility by default', () => {
    expect(typedFeatureText({ _type: 'UMLAttribute', _id: '', _parent: null, name: 'p', type: 'Engine', multiplicity: '2', visibility: 'private' } as Elem)).toBe('p: Engine[2]')
    expect(typedFeatureText({ _type: 'UMLAttribute', _id: '', _parent: null, name: 'p', visibility: 'private' } as Elem, { showVisibility: true })).toBe('-p')
    expect(collaborationUseText({ _type: 'UMLCollaborationUse', _id: '', _parent: null, name: 'cu', type: { name: 'Observer' } } as unknown as Elem)).toBe('cu: Observer')
    expect(connectorLabelText({ _type: 'UMLConnector', _id: '', _parent: null, name: 'c', type: { name: 'link' } } as unknown as Elem, false)).toBe('c')
  })
})

describe('ports and parts', () => {
  it('creates a port as an attribute of the host classifier, glued to its border', () => {
    const t = structureTest('CompositeStructureDiagram')
    const host = t.node('Class', 100, 100, { width: 200, height: 100 })
    // Created through the editor: the click lands inside the class view.
    const id = createNodeAt(t, t.layout(), 'Port', { left: 290, top: 140, width: 0, height: 0 })
    expect(id).not.toBeNull()
    const port = t.repository.get(id as string) as NodeView
    const model = port.model as Elem
    expect(model._type).toBe('UMLPort')
    expect(model._parent).toBe(host.model)
    expect((host.model as Elem)['attributes']).toContain(model)
    expect(model['name']).toBe('Port1')
    expect(port.containerView).toBe(host)
    expect(host.containedViews).toContain(port)
    const l = t.nodeLayout<PortData>(port)
    expect(l.box).toMatchObject({ width: 14, height: 14 })
    expect(l.box.left + 7).toBe(300)
    expect(l.data.side).toBe('right')
    // The label sits up-left of the port: alpha 3pi/4, d = 20.
    expect(l.data.labels[0]?.text).toBe('Port1')
    expect(l.data.labels[0]?.box.top).toBeLessThan(l.box.top)
  })

  it('keeps the port on the border when the host is resized or moved', () => {
    const t = structureTest('CompositeStructureDiagram')
    const host = t.node('Class', 100, 100, { width: 200, height: 100 })
    const id = createNodeAt(t, t.layout(), 'Port', { left: 290, top: 140, width: 0, height: 0 }) as string
    const port = t.repository.get(id) as NodeView
    moveSelection(t, [host._id], 50, 20)
    const l = t.nodeLayout<PortData>(port)
    const hb = t.nodeLayout(host).box
    expect(l.box.left + 7).toBe(hb.left + hb.width)
  })

  it('shows name: Type[mult] on the port label', () => {
    const t = structureTest('CompositeStructureDiagram')
    t.node('Class', 100, 100, { width: 200, height: 100 })
    const id = createNodeAt(t, t.layout(), 'Port', { left: 290, top: 140, width: 0, height: 0 }) as string
    const port = t.repository.get(id) as NodeView
    setFields(t.engine, port.model as Elem, { name: 'p', type: 'Iface', multiplicity: '1..*' })
    expect(t.nodeLayout<PortData>(port).data.labels[0]?.text).toBe('p: Iface[1..*]')
  })

  it('refuses a port on an untyped part', () => {
    const t = structureTest('CompositeStructureDiagram')
    const part = t.node('Part', 100, 100, { width: 200, height: 100 })
    expect(() => t.node('Port', 290, 140, { container: part })).toThrow('Type should be assigned to have Ports')
    // Once the part is typed, the port is created in the type classifier.
    const cls = t.node('Class', 400, 100)
    setFields(t.engine, part.model as Elem, { type: cls.model })
    const port = t.node('Port', 290, 140, { container: part })
    expect((port.model as Elem)._parent).toBe(cls.model)
  })

  it('creates a composite part drawn solid, and non-composite attributes dashed', () => {
    const t = structureTest('CompositeStructureDiagram')
    const host = t.node('Class', 100, 100, { width: 300, height: 200 })
    const id = createNodeAt(t, t.layout(), 'Part', { left: 130, top: 150, width: 0, height: 0 }) as string
    const part = t.repository.get(id) as NodeView
    const model = part.model as Elem
    expect(model).toMatchObject({ _type: 'UMLAttribute', name: 'Part1', aggregation: 'composite' })
    expect(model._parent).toBe(host.model)
    expect(part.containerView).toBe(host)
    expect(t.nodeLayout<PartData>(part).data.composite).toBe(true)
    setFields(t.engine, model, { aggregation: 'none', type: 'Engine' })
    const l = t.nodeLayout<PartData>(part)
    expect(l.data.composite).toBe(false)
    expect(l.data.nameLines[0]?.text).toBe('Part1: Engine')
    expect(l.box.height).toBe(40)
    expect(l.box.width).toBe(l.minWidth)
    expect(t.nodeLayout<PartData>(t.node('Part', 600, 600, { name: 'p' })).box).toMatchObject({ width: 80, height: 40 })
  })

  it('a part on the empty canvas belongs to the diagram owner classifier', () => {
    const t = structureTest('CompositeStructureDiagram')
    const part = t.node('Part', 40, 40)
    expect((part.model as Elem)._parent).toBe(t.diagram._parent)
    expect(isKindOf(t.diagram._parent, 'UMLCollaboration')).toBe(true)
  })

  it('hosts never accept an existing port from another host (no re-hosting)', () => {
    const t = structureTest('CompositeStructureDiagram')
    const a = t.node('Class', 100, 100, { width: 200, height: 100 })
    const b = t.node('Class', 500, 100, { width: 200, height: 100 })
    const id = createNodeAt(t, t.layout(), 'Port', { left: 290, top: 140, width: 0, height: 0 }) as string
    const port = t.repository.get(id) as NodeView
    moveSelection(t, [port._id], 400, 0, { container: b })
    expect(port.containerView).toBe(a)
  })
})

describe('collaboration and uses', () => {
  it('draws a dashed ellipse at least 70 × 32, sized by the √2 rule', () => {
    const t = structureTest('CompositeStructureDiagram')
    const small = t.node('Collaboration', 20, 20, { name: 'C', width: 10, height: 10 })
    const sl = t.nodeLayout<CollaborationData>(small)
    expect(sl.outline).toBe('ellipse')
    expect(sl.box.width).toBe(70)
    expect(sl.box.height).toBe(Math.floor(Math.SQRT2 * 25))
    const wide = t.node('Collaboration', 20, 200, { name: 'A long collaboration name', width: 10, height: 10 })
    const w = t.nodeLayout<CollaborationData>(wide)
    const nameWidth = Math.ceil('A long collaboration name'.length * 13 * 0.6 * 1.1) + 10
    expect(w.minWidth).toBe(Math.floor(Math.SQRT2 * nameWidth))
  })

  it('names a typed collaboration use name: Collaboration', () => {
    const t = structureTest('CompositeStructureDiagram')
    const collab = t.node('Collaboration', 20, 20, { name: 'Observer' })
    const use = t.node('CollaborationUse', 220, 20, { name: 'obs' })
    setFields(t.engine, use.model as Elem, { type: collab.model })
    expect(t.nodeLayout<CollaborationData>(use).data.nameLines[0]?.text).toBe('obs: Observer')
  })
})

describe('connectors and role bindings', () => {
  it('connects features (parts / ports / attributes) and nothing else', () => {
    const t = structureTest('CompositeStructureDiagram')
    const a = t.node('Part', 20, 20)
    const b = t.node('Part', 220, 20)
    const note = t.node('Note', 420, 20)
    expect(canConnect('Connector', a, b)).toBe(true)
    expect(canConnect('Connector', a, note)).toBe(false)
    const col = t.node('Collaboration', 20, 200)
    expect(canConnect('Connector', a, col)).toBe(false)
  })

  it('creates a connector owned by the diagram owner with attribute ends, drawn without end styles', () => {
    const t = structureTest('CompositeStructureDiagram')
    const a = t.node('Part', 20, 20)
    const b = t.node('Part', 260, 20)
    const connector = t.edge('Connector', a, b)
    const model = connector.model as Elem
    expect(model).toMatchObject({ _type: 'UMLConnector', kind: 'assembly' })
    expect(model._parent).toBe(t.diagram._parent)
    expect((model['end1'] as Elem)['reference']).toBe(a.model)
    expect((model['end2'] as Elem)['reference']).toBe(b.model)
    const l = t.edgeLayout(connector)
    expect(l.dash).toBe('solid')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('flat')
    // Delegation looks the same; a typed connector shows `: Type` in the middle label.
    setFields(t.engine, model, { kind: 'delegation', name: 'c' })
    expect(t.edgeLayout(connector).headEnd.style).toBe('flat')
  })

  it('binds a collaboration use to a role: dashed line, stick arrow, role name at the head', () => {
    const t = structureTest('CompositeStructureDiagram')
    const use = t.node('CollaborationUse', 20, 20)
    const role = t.node('Part', 300, 20)
    expect(canConnect('RoleBinding', role, use)).toBe(false)
    const binding = t.edge('RoleBinding', use, role)
    const model = binding.model as Elem
    expect(model).toMatchObject({ _type: 'UMLRoleBinding', roleName: '' })
    expect(model._parent).toBe(use.model)
    expect(model['source']).toBe(use.model)
    expect(model['target']).toBe(role.model)
    setFields(t.engine, model, { roleName: 'subject' })
    const l = t.edgeLayout(binding)
    expect(l.dash).toBe('dot')
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.labels.map((x) => x.text)).toContain('subject')
  })

  it('realization connects any two model elements', () => {
    const t = structureTest('CompositeStructureDiagram')
    const a = t.node('Class', 20, 20)
    const b = t.node('Collaboration', 300, 20)
    expect(t.edge('Realization', a, b)._type).toBe('UMLRealizationView')
  })
})
