import { describe, expect, it } from 'vitest'
import { setFields } from '../../../commands'
import { canConnect, isKindOf, type Elem, type View } from '../../../model'
import { createEdgeBetween } from '../../editor/actions'
import { structureTest } from '../object/testEnv'
import {
  arrowBesideConnector,
  commArrowDash,
  commArrowHead,
  commSequenceNumber,
  type CommLifelineData,
  type CommMessageData
} from './layout'

function setup() {
  const t = structureTest('CommunicationDiagram')
  const a = t.node('CommLifeline', 40, 80)
  const b = t.node('CommLifeline', 400, 80)
  return { t, a, b }
}

describe('arrow geometry', () => {
  it('maps message sorts to heads and dashes', () => {
    expect(commArrowHead('synchCall').style).toBe('solidArrow')
    expect(commArrowHead('deleteMessage').style).toBe('solidArrow')
    for (const s of ['asynchCall', 'asynchSignal', 'createMessage', 'reply'] as const) expect(commArrowHead(s).style).toBe('stickArrow')
    expect(commArrowDash('reply')).toBe('dot')
    expect(commArrowDash('createMessage')).toBe('solid')
    expect(commArrowDash('synchCall')).toBe('solid')
  })

  it('anchors beside the middle of the connector, 40 long, offset perpendicular by 10', () => {
    // Horizontal connector from (0,100) to (200,100): anchor (100,100); alpha = pi/2 puts the center 10 above.
    const a = arrowBesideConnector([{ x: 0, y: 100 }, { x: 200, y: 100 }], Math.PI / 2, 10, true)
    expect(a.center).toEqual({ x: 100, y: 90 })
    expect(a.tail).toEqual({ x: 80, y: 90 })
    expect(a.head).toEqual({ x: 120, y: 90 })
    const reverse = arrowBesideConnector([{ x: 0, y: 100 }, { x: 200, y: 100 }], Math.PI / 2, 10, false)
    expect(reverse.tail).toEqual({ x: 120, y: 90 })
    expect(reverse.head).toEqual({ x: 80, y: 90 })
    // Four points: the middle of the two central points.
    const bent = arrowBesideConnector([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }], 0, 0, true)
    expect(bent.center).toEqual({ x: 50, y: 100 })
  })
})

describe('creation', () => {
  it('creates lifelines with role attributes in the owning collaboration, at least 100 × 30', () => {
    const { t, a } = setup()
    const model = a.model as Elem
    expect(model._type).toBe('UMLLifeline')
    expect(model['name']).toBe('Lifeline1')
    const role = model['represent'] as Elem
    expect(role._type).toBe('UMLAttribute')
    expect(role['name']).toBe('Role1')
    const collaboration = (t.diagram._parent as Elem)._parent as Elem
    expect(isKindOf(collaboration, 'UMLCollaboration')).toBe(true)
    expect(collaboration['attributes']).toContain(role)
    const l = t.nodeLayout<CommLifelineData>(a)
    expect(l.box.width).toBeGreaterThanOrEqual(100)
    expect(l.box.height).toBeGreaterThanOrEqual(30)
    const small = t.node('CommLifeline', 40, 200, { width: 20, height: 10 })
    expect(t.nodeLayout(small).box).toMatchObject({ width: 100, height: 30 })
    expect(t.nodeLayout<CommLifelineData>(a).data.nameLines.map((x) => x.text)).toEqual(['Lifeline1'])
  })

  it('shows name[selector]: Type in the lifeline and draws multi-instance twice', () => {
    const { t, a } = setup()
    const model = a.model as Elem
    setFields(t.engine, model, { selector: '1', isMultiInstance: true })
    setFields(t.engine, model['represent'] as Elem, { type: 'Order' })
    const l = t.nodeLayout<CommLifelineData>(a)
    expect(l.data.nameLines[0]?.text).toBe('Lifeline1[1]: Order')
    expect(l.data.multiInstance).toBe(true)
    expect(l.extraBounds?.[0]).toMatchObject({ left: l.box.left + 5, top: l.box.top + 5 })
  })

  it('creates a connector between role attributes, owned by the tail role', () => {
    const { t, a, b } = setup()
    expect(canConnect('Connector', a, b)).toBe(true)
    const connector = t.edge('Connector', a, b)
    const model = connector.model as Elem
    expect(model._type).toBe('UMLConnector')
    expect(model._parent).toBe((a.model as Elem)['represent'])
    expect((model['end1'] as Elem)['reference']).toBe((a.model as Elem)['represent'])
    expect((model['end2'] as Elem)['reference']).toBe((b.model as Elem)['represent'])
    const l = t.edgeLayout(connector)
    expect(l.dash).toBe('solid')
    expect(l.headEnd.style).toBe('flat')
  })

  it('a self connector loops on one lifeline', () => {
    const { t, a } = setup()
    const connector = createEdgeBetween(t, t.layout(), { kind: 'Connector', selfConnection: true }, a._id, a._id, { x: 0, y: 0 })
    expect(connector).not.toBeNull()
    const l = t.layout().edges.get(connector as string)!
    expect(l.points.length).toBeGreaterThanOrEqual(3)
  })

  it('forward message creates connector and message together; reverse swaps direction', () => {
    const { t, a, b } = setup()
    const forward = t.edge('CommForwardMessage', a, b)
    const message = forward.model as Elem
    expect(message).toMatchObject({ _type: 'UMLMessage', name: 'Message1', messageSort: 'synchCall' })
    expect(message['source']).toBe(a.model)
    expect(message['target']).toBe(b.model)
    expect(message['connector']).toBeTruthy()
    const connectorViews = t.diagram.ownedViews.filter((v) => v._type === 'UMLConnectorView')
    expect(connectorViews).toHaveLength(1)
    expect((forward as unknown as { hostEdge: View }).hostEdge).toBe(connectorViews[0])
    expect(forward._type).toBe('UMLCommMessageView')

    // A second message reuses the connector, in either direction, and stacks 18 further out.
    const reverse = t.edge('CommReverseMessage', a, b, { messageSort: 'reply' })
    expect(t.diagram.ownedViews.filter((v) => v._type === 'UMLConnectorView')).toHaveLength(1)
    const rm = reverse.model as Elem
    expect(rm['source']).toBe(b.model)
    expect(rm['target']).toBe(a.model)
    expect(rm['connector']).toBe(message['connector'])
    expect((reverse as unknown as { distance: number }).distance).toBe(28)
    expect((forward as unknown as { distance: number }).distance).toBe(10)
    expect((reverse.model as Elem)._parent).toBe(t.diagram._parent)
  })

  it('refuses messages between non-lifelines', () => {
    const { t, a } = setup()
    const note = t.node('Note', 600, 600)
    expect(() => t.edge('CommForwardMessage', a, note)).toThrow()
  })
})

describe('editor gestures', () => {
  it('a forward message dragged between lifelines creates the connector and message in one operation', () => {
    const { t, a, b } = setup()
    const before = t.diagram.ownedViews.length
    const id = createEdgeBetween(t, t.layout(), { kind: 'CommForwardMessage', messageSort: 'asynchCall' }, a._id, b._id, { x: 0, y: 0 })
    expect(id).not.toBeNull()
    expect(t.diagram.ownedViews.length - before).toBe(2)
    const view = t.repository.get(id as string) as View
    expect(view._type).toBe('UMLCommMessageView')
    expect((view.model as Elem)['messageSort']).toBe('asynchCall')
    expect(t.engine.undoName).toBe('Create CommForwardMessage')
    t.engine.undo()
    expect(t.diagram.ownedViews.length).toBe(before)
    expect((t.diagram._parent as Elem)['messages']).toHaveLength(0)
    // The new message opens its quick edit on the label.
    t.engine.redo()
    expect(t.layout().nodes.get(id as string)?.regions[0]?.target).toMatchObject({ syntax: 'message' })
  })

  it('a link object dragged between two objects creates three elements as one undo step', () => {
    const t = structureTest('ObjectDiagram')
    const a = t.node('Object', 20, 20)
    const b = t.node('Object', 320, 20)
    const views = t.diagram.ownedViews.length
    const id = createEdgeBetween(t, t.layout(), { kind: 'LinkObject' }, a._id, b._id, { x: 0, y: 0 })
    expect(id).not.toBeNull()
    expect(t.diagram.ownedViews.length - views).toBe(3)
    t.engine.undo()
    expect(t.diagram.ownedViews.length).toBe(views)
  })
})

describe('message arrows', () => {
  it('draws a 40-long arrow beside the connector pointing source → target with the numbered label', () => {
    const { t, a, b } = setup()
    const forward = t.edge('CommForwardMessage', a, b, { name: 'call' })
    const l = t.nodeLayout<CommMessageData>(forward)
    const d = l.data
    expect(Math.hypot(d.head.x - d.tail.x, d.head.y - d.tail.y)).toBeCloseTo(40, 0)
    expect(d.head.x).toBeGreaterThan(d.tail.x)
    expect(d.headEnd.style).toBe('solidArrow')
    expect(d.labels.map((x) => x.text)).toEqual(['1 : call'])
    // The arrow is above the connector line (alpha = pi/2, d = 10) and its label above the arrow.
    expect(d.labels[0]!.box.top + d.labels[0]!.box.height / 2).toBeLessThan(d.tail.y)
    const connector = t.layout().edges.get((forward as unknown as { hostEdge: View }).hostEdge._id)!
    const midY = (connector.points[0]!.y + connector.points[connector.points.length - 1]!.y) / 2
    expect(d.tail.y).toBeLessThan(midY)
    // Hit area: bounding box expanded by 10.
    expect(l.hitAreas?.[0]?.width).toBeGreaterThan(40)
  })

  it('reverse message points the other way', () => {
    const { t, a, b } = setup()
    const reverse = t.edge('CommReverseMessage', a, b, { name: 'back', messageSort: 'reply' })
    const d = t.nodeLayout<CommMessageData>(reverse).data
    expect(d.head.x).toBeLessThan(d.tail.x)
    expect(d.dash).toBe('dot')
    expect(d.headEnd.style).toBe('stickArrow')
    // The label stays above the (leftward) arrow.
    expect(d.labels[0]!.box.top + d.labels[0]!.box.height / 2).toBeLessThan(d.tail.y)
  })

  it('numbers messages by their index in the interaction (auto) or by their custom number', () => {
    const { t, a, b } = setup()
    const m1 = t.edge('CommForwardMessage', a, b, { name: 'one' })
    const m2 = t.edge('CommForwardMessage', a, b, { name: 'two' })
    expect(commSequenceNumber(m1.model as Elem, t.diagram)).toBe('1')
    expect(commSequenceNumber(m2.model as Elem, t.diagram)).toBe('2')
    setFields(t.engine, t.diagram, { sequenceNumbering: 'custom' })
    setFields(t.engine, m2.model as Elem, { sequenceNumber: '1.2.a' })
    expect(commSequenceNumber(m2.model as Elem, t.diagram)).toBe('1.2.a')
    expect(commSequenceNumber(m1.model as Elem, t.diagram)).toBe('')
    expect(t.nodeLayout<CommMessageData>(m2).data.labels[0]?.text).toBe('1.2.a : two')
    setFields(t.engine, t.diagram, { showSequenceNumber: false })
    expect(t.nodeLayout<CommMessageData>(m2).data.labels[0]?.text).toBe('two')
  })

  it('shows guard, iteration, assignment target and arguments in the label', () => {
    const { t, a, b } = setup()
    const m = t.edge('CommForwardMessage', a, b, { name: 'get' })
    setFields(t.engine, m.model as Elem, { guard: 'ok', iteration: 'i=1..n', assignmentTarget: 'x', arguments: 'a, b' })
    expect(t.nodeLayout<CommMessageData>(m).data.labels[0]?.text).toBe('1 [ok] *[i=1..n] : x = get(a, b)')
  })

  it('the arrow follows its connector when a lifeline moves', () => {
    const { t, a, b } = setup()
    const m = t.edge('CommForwardMessage', a, b, { name: 'm' })
    const before = t.nodeLayout<CommMessageData>(m).data
    setFields(t.engine, b, { left: 600 })
    const after = t.nodeLayout<CommMessageData>(m).data
    expect(after.tail.x).toBeGreaterThan(before.tail.x)
  })

  it('works when the message view precedes the lifelines in the view list', () => {
    const { t, a, b } = setup()
    const m = t.edge('CommForwardMessage', a, b, { name: 'm' })
    const normal = t.nodeLayout<CommMessageData>(m).data
    // Move the message view to the front: layout order of nodes must not matter.
    t.engine.transact('reorder', (bld) => {
      bld.remove(m)
      bld.insert(t.diagram, 'ownedViews', m, 0)
    })
    expect(t.nodeLayout<CommMessageData>(m).data.tail).toEqual(normal.tail)
  })

  it('edits the message through the shared message syntax', () => {
    const { t, a, b } = setup()
    const m = t.edge('CommForwardMessage', a, b, { name: 'm' })
    const l = t.nodeLayout(m)
    expect(l.regions[0]?.target).toMatchObject({ kind: 'custom', syntax: 'message' })
    expect(l.movable).toBe(false)
  })
})

describe('frame', () => {
  it('has a frame view with the owner interaction name and sd keyword', () => {
    const { t } = setup()
    const frame = t.diagram.ownedViews.find((v) => v._type === 'UMLFrameView') as View
    expect(frame).toMatchObject({ left: 8, top: 8, width: 700, height: 600 })
    const l = t.nodeLayout<{ label: { keyword: { text: string }; name: { text: string } | null } }>(frame)
    expect(l.data.label.keyword.text).toBe('sd')
    expect(l.data.label.name?.text).toBe('Interaction1')
  })
})
