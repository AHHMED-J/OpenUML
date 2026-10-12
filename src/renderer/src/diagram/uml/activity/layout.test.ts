import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, moveViews, setFields } from '../../../commands'
import type { Diagram, EdgeKind, Elem, NodeKind, NodeView, View } from '../../../model'
import { EDGE_LABEL_DEFAULTS, NODE_LABEL_DEFAULTS, placeNodeLabel } from '../../core'
import { findDropContainer } from '../../editor/actions'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { nodeNotationFor } from '../../render/registry'
import { testDiagram } from '../../testUtils'
import { flowLabelText } from './edges'
import type { ActionData, ControlNodeData, ObjectNodeData, PinData, SwimlaneData } from './layout'
import { acceptEventPolygon, nearestBorderPoint, sendSignalPolygon } from './layout'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).
const BOLD_CHAR = 13 * 0.6 * 1.1
const CHAR = 13 * 0.6

function activityDiagram() {
  const t = testDiagram()
  const owner = t.diagram._parent as Elem
  const diagram = createDiagram(t.engine, 'ActivityDiagram', owner).diagram as Diagram
  const env = { engine: t.engine, diagram, measurer: t.measurer }
  return {
    ...t,
    env,
    diagram,
    node(kind: NodeKind, left: number, top: number, width?: number, height?: number, container?: View): View {
      return createNode(t.engine, { kind, diagram, left, top, ...(width ? { width } : {}), ...(height ? { height } : {}), ...(container ? { container } : {}) }).view as View
    },
    edge(kind: EdgeKind, tail: View, head: View): View {
      return createEdge(t.engine, { kind, diagram, tail, head }).view as View
    },
    layout() {
      return computeDiagramLayout(diagram, t.repository, t.measurer)
    }
  }
}

function nodeOf<D>(layout: { nodes: ReadonlyMap<string, NodeLayout> }, view: View): NodeLayout<D> {
  const l = layout.nodes.get(view._id)
  if (!l) throw new Error(`no layout for ${view._type}`)
  return l as NodeLayout<D>
}

describe('action layout', () => {
  it('is a rounded rectangle (r = 10) at least 60 × 40 with the bold name centered vertically', () => {
    const a = activityDiagram()
    const view = a.node('Action', 10, 20, 30, 30)
    const l = nodeOf<ActionData>(a.layout(), view)
    expect(l.minWidth).toBe(Math.max(60, Math.ceil(7 * BOLD_CHAR) + 10))
    expect(l.minHeight).toBe(40)
    expect(l.box).toEqual({ left: 10, top: 20, width: l.minWidth, height: 40 })
    expect(l.outline).toBe('rect')
    expect(l.sizable).toBe('free')
    expect(l.data.shape).toBe('opaque')
    expect(l.data.cornerRadius).toBe(10)
    const name = l.data.nameLines[0]
    expect(name?.text).toBe('Action1')
    expect(name?.font.style).toBe(1)
    // Name compartment (25 tall) centered in 40: band top 27.5, name line 7 below it.
    expect(name?.box.top).toBe(20 + 7.5 + 7)
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: view.model?._id })
    expect(l.regions[0]?.text).toBe('Action1')
  })

  it('grows to fit a long name and keeps a larger stored size', () => {
    const a = activityDiagram()
    const view = a.node('Action', 0, 0, 200, 80)
    setFields(a.engine, view.model as Elem, { name: 'Validate the customer order' })
    const l = nodeOf<ActionData>(a.layout(), view)
    expect(l.minWidth).toBe(Math.ceil(27 * BOLD_CHAR) + 10)
    expect(l.box.width).toBe(Math.max(200, l.minWidth))
    expect(l.box.height).toBe(80)
  })

  it('draws send signal as a right-pointing pentagon and accept signal with a left notch', () => {
    const a = activityDiagram()
    const send = a.node('SendSignal', 0, 0, 100, 40)
    const accept = a.node('AcceptSignal', 0, 100, 100, 40)
    const layout = a.layout()
    const s = nodeOf<ActionData>(layout, send)
    expect(s.data.shape).toBe('sendSignal')
    expect(s.data.polygon).toEqual(sendSignalPolygon(s.box))
    expect(s.data.polygon[2]).toEqual({ x: 100, y: 20 })
    expect(s.data.polygon[1]).toEqual({ x: 90, y: 0 })
    // The name avoids the pointed end: min width = name + 10 + h/4.
    expect(s.minWidth).toBe(Math.max(60, Math.ceil(7 * BOLD_CHAR) + 10 + 10))
    const c = nodeOf<ActionData>(layout, accept)
    expect(c.data.shape).toBe('acceptEvent')
    expect(c.data.polygon).toEqual(acceptEventPolygon(c.box))
    expect(c.data.polygon[4]).toEqual({ x: 10, y: 120 })
    expect(c.data.nameLines[0]?.box.left).toBe(10 + 5)
  })

  it('draws a time event as an hourglass with the name below and edges attached to the icon', () => {
    const a = activityDiagram()
    const view = a.node('AcceptTimeEvent', 0, 0)
    const l = nodeOf<ActionData>(a.layout(), view)
    expect(l.data.shape).toBe('timeEvent')
    expect(l.minHeight).toBe(26 + 25)
    expect(l.data.icon?.top).toBe(0)
    expect(l.endpoint?.box).toEqual(l.data.icon)
    expect(l.data.nameLines[0]?.box.top).toBe((l.data.icon?.height ?? 0) + 7)
  })

  it('adds the rake glyph for call behavior actions', () => {
    const a = activityDiagram()
    const view = a.node('Action', 0, 0, 100, 40)
    setFields(a.engine, view.model as Elem, { kind: 'callBehavior' })
    const l = nodeOf<ActionData>(a.layout(), view)
    expect(l.data.rake).toHaveLength(2)
    expect(l.data.rake[0]).toEqual([
      { x: 90, y: 5 },
      { x: 90, y: 20 }
    ])
  })
})

describe('object node layout', () => {
  it('shows name: Type and [states] centered in a plain rectangle', () => {
    const a = activityDiagram()
    const view = a.node('ObjectNode', 0, 0, 10, 10)
    const model = view.model as Elem
    setFields(a.engine, model, { name: 'order', type: 'Order' })
    // `inStates` references states (not drawable in the MVP); plain named stand-ins suffice here.
    model['inStates'] = [{ _id: 's1', _type: 'UMLState', _parent: null, name: 'open' }, 'paid']
    const l = nodeOf<ObjectNodeData>(a.layout(), view)
    expect(l.data.lines.map((x) => x.text)).toEqual(['order: Order', '[open, paid]'])
    expect(l.minWidth).toBe(Math.ceil(12 * BOLD_CHAR) + 10)
    // 25 (name compartment) + 13 + 2.
    expect(l.minHeight).toBe(40)
    expect(l.data.lines[1]?.box.top).toBe(5 + 13 + 2 + 2)
    expect(l.data.lines[1]?.font.style).toBe(0)
    expect(l.regions[0]?.text).toBe('order')
  })
})

describe('control node layout', () => {
  it('uses fixed minimum sizes and true outlines per model type', () => {
    const a = activityDiagram()
    const views = {
      initial: a.node('InitialNode', 0, 0, 5, 5),
      final: a.node('ActivityFinalNode', 50, 0, 5, 5),
      flowFinal: a.node('FlowFinalNode', 100, 0, 5, 5),
      decision: a.node('DecisionNode', 150, 0, 5, 5),
      merge: a.node('MergeNode', 200, 0)
    }
    const layout = a.layout()
    const get = (v: View) => nodeOf<ControlNodeData>(layout, v)
    expect(get(views.initial).data.shape).toBe('initial')
    expect([get(views.initial).box.width, get(views.initial).box.height]).toEqual([20, 20])
    expect(get(views.initial).outline).toBe('ellipse')
    expect(get(views.initial).sizable).toBe('ratio')
    expect(get(views.final).data.shape).toBe('activityFinal')
    expect([get(views.final).minWidth, get(views.final).minHeight]).toEqual([26, 26])
    expect(get(views.flowFinal).data.shape).toBe('flowFinal')
    expect(get(views.flowFinal).outline).toBe('ellipse')
    expect(get(views.decision).data.shape).toBe('decision')
    expect([get(views.decision).minWidth, get(views.decision).minHeight]).toEqual([23, 19])
    expect(get(views.decision).outline).toBe('diamond')
    expect(get(views.merge).outline).toBe('diamond')
    // Control nodes show no name.
    expect(get(views.decision).regions).toEqual([])
  })

  it('draws fork/join as 6-thick bars resizable only along their length', () => {
    const a = activityDiagram()
    const fork = a.node('ForkNode', 0, 0, 120, 40)
    const join = a.node('JoinNode', 200, 0, 10, 30)
    const layout = a.layout()
    const f = nodeOf<ControlNodeData>(layout, fork)
    expect(f.data).toEqual({ shape: 'fork', horizontal: true })
    expect(f.box).toEqual({ left: 0, top: 0, width: 120, height: 6 })
    expect(f.sizable).toBe('horz')
    const j = nodeOf<ControlNodeData>(layout, join)
    expect(j.data.horizontal).toBe(false)
    expect(j.box).toEqual({ left: 200, top: 0, width: 6, height: 70 })
    expect([j.minWidth, j.minHeight]).toEqual([6, 70])
    expect(j.sizable).toBe('vert')
  })

  it('clips flows to the true ellipse and diamond outlines', () => {
    const a = activityDiagram()
    const initial = a.node('InitialNode', 0, 0)
    const decision = a.node('DecisionNode', 100, 100)
    const edge = a.edge('ControlFlow', initial, decision)
    const l = a.layout().edges.get(edge._id) as EdgeLayout
    const [tail, head] = [l.points[0], l.points[l.points.length - 1]]
    // The tail leaves the circle near its outline (radius 10 + 1 margin) on the diagonal.
    const r = Math.hypot((tail?.x ?? 0) - 10, (tail?.y ?? 0) - 10)
    expect(r).toBeGreaterThan(9.5)
    expect(r).toBeLessThan(12)
    // The head lands on the diamond outline, not the bounding box corner.
    const cx = 100 + 11.5
    const cy = 100 + 9.5
    const d = Math.abs((head?.x ?? 0) - cx) / 12.5 + Math.abs((head?.y ?? 0) - cy) / 10.5
    expect(d).toBeGreaterThan(0.85)
    expect(d).toBeLessThan(1.15)
  })
})

describe('pin layout', () => {
  it('is an 18 × 18 fixed square straddling the nearest border of its action', () => {
    const a = activityDiagram()
    const action = a.node('Action', 100, 100, 100, 60)
    const input = a.node('InputPin', 90, 120, undefined, undefined, action)
    const output = a.node('OutputPin', 160, 150, undefined, undefined, action)
    const layout = a.layout()
    const i = nodeOf<PinData>(layout, input)
    // Center (99, 129) is just outside the left border: snapped to x = 100.
    expect(i.box).toEqual({ left: 91, top: 120, width: 18, height: 18 })
    expect(i.sizable).toBe('none')
    expect(i.data.side).toBe('left')
    expect(i.data.input).toBe(true)
    // Input pins point into the action (rightward on the left border).
    expect(i.data.arrow?.shaft).toEqual([
      { x: 93, y: 129 },
      { x: 107, y: 129 }
    ])
    const o = nodeOf<PinData>(layout, output)
    // Center (169, 159) is inside, closest to the bottom border (y = 160).
    expect(o.box).toEqual({ left: 160, top: 151, width: 18, height: 18 })
    expect(o.data.side).toBe('bottom')
    expect(o.data.arrow?.shaft[1]).toEqual({ x: 169, y: 167 })
  })

  it('floats the name label up-left and includes it in the export bounds', () => {
    const a = activityDiagram()
    const action = a.node('Action', 100, 100, 100, 60)
    const pin = a.node('InputPin', 191, 120, undefined, undefined, action)
    setFields(a.engine, pin.model as Elem, { name: 'qty', type: 'Integer', multiplicity: '1' })
    const l = nodeOf<PinData>(a.layout(), pin)
    const label = l.data.labels[0]
    expect(label?.text).toBe('qty: Integer[1]')
    const size = { width: Math.ceil(15 * CHAR), height: 13 }
    expect(label?.box).toEqual(placeNodeLabel(l.box, NODE_LABEL_DEFAULTS.name, size))
    expect(label?.box.top).toBeLessThan(l.box.top)
    expect(l.extraBounds).toEqual([label?.box])
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: pin.model?._id })
  })

  it('follows its action when the action moves and stays contained when dropped on it', () => {
    const a = activityDiagram()
    const action = a.node('Action', 100, 100, 100, 60)
    const pin = a.node('OutputPin', 191, 120, undefined, undefined, action)
    moveViews(a.engine, [action], 50, 0)
    const l = nodeOf<PinData>(a.layout(), pin)
    expect(l.box.left).toBe(250 - 9)
    expect(l.data.side).toBe('right')
    const drop = findDropContainer(a.env, a.layout(), { x: 240, y: 130 }, [pin])
    expect(drop).toBe(action)
    expect(nodeNotationFor(action).container?.accepts(action, a.node('Action', 400, 0).model ?? null)).toBe(false)
  })

  it('snaps points to the nearest border point', () => {
    const r = { left: 0, top: 0, width: 100, height: 50 }
    expect(nearestBorderPoint(r, { x: 50, y: 5 })).toEqual({ point: { x: 50, y: 0 }, side: 'top' })
    expect(nearestBorderPoint(r, { x: 120, y: 60 })).toEqual({ point: { x: 100, y: 50 }, side: 'right' })
    expect(nearestBorderPoint(r, { x: 30, y: 80 })).toEqual({ point: { x: 30, y: 50 }, side: 'bottom' })
  })
})

describe('swimlane layout', () => {
  it('vertical lanes: header row 21 tall, min max(50, name + 20) × 300, drawn behind', () => {
    const a = activityDiagram()
    const action = a.node('Action', 0, 0)
    const lane = a.node('Partition', 0, 0, 10, 10)
    const layout = a.layout()
    const l = nodeOf<SwimlaneData>(layout, lane)
    const name = String(lane.model?.['name'])
    expect(l.minWidth).toBe(Math.max(50, Math.ceil(name.length * BOLD_CHAR) + 20))
    expect(l.minHeight).toBe(300)
    expect(l.data.vertical).toBe(true)
    expect(l.data.header).toEqual({ left: 0, top: 0, width: l.box.width, height: 21 })
    expect(l.data.name?.text).toBe(name)
    expect(l.data.name?.box.top).toBe(4)
    // Open at the bottom: left side, top, right side.
    expect(l.data.border).toEqual([
      { x: 0, y: 300 },
      { x: 0, y: 0 },
      { x: l.box.width, y: 0 },
      { x: l.box.width, y: 300 }
    ])
    expect(l.regions[0]?.box).toEqual(l.data.header)
    expect(layout.order.indexOf(lane._id)).toBeLessThan(layout.order.indexOf(action._id))
  })

  it('horizontal lanes: header column on the left, min 300 × max(50, name + 20)', () => {
    const a = activityDiagram()
    const lane = a.node('HorizontalPartition', 0, 0, 10, 10)
    const l = nodeOf<SwimlaneData>(a.layout(), lane)
    expect(l.data.vertical).toBe(false)
    expect(l.minWidth).toBe(300)
    expect(l.minHeight).toBe(Math.max(50, Math.ceil(String(lane.model?.['name']).length * BOLD_CHAR) + 20))
    expect(l.data.header).toEqual({ left: 0, top: 0, width: 21, height: l.box.height })
    // The (unrotated) name box is centered on the header column.
    const n = l.data.name?.box
    expect((n?.left ?? 0) + (n?.width ?? 0) / 2).toBe(10.5)
    expect((n?.top ?? 0) + (n?.height ?? 0) / 2).toBe(l.box.height / 2)
  })

  it('is a visual drop container for activity nodes (the model stays in the activity)', () => {
    const a = activityDiagram()
    const lane = a.node('Partition', 0, 0, 200, 400)
    const action = a.node('Action', 300, 100)
    const container = nodeNotationFor(lane).container
    expect(container?.accepts(lane, action.model ?? null)).toBe(true)
    expect(container?.accepts(lane, null)).toBe(true)
    expect(container?.accepts(lane, lane.model ?? null)).toBe(false)
    expect(container?.ownerFor?.(lane, action.model ?? null)).toBeNull()
    expect(findDropContainer(a.env, a.layout(), { x: 100, y: 100 }, [action])).toBe(lane)
    // Creating inside a lane makes the lane its container view.
    const inner = a.node('DecisionNode', 50, 50, undefined, undefined, lane) as NodeView
    expect(inner.containerView).toBe(lane)
    expect(inner.model?._parent).toBe(a.diagram._parent)
  })
})

describe('flow edges', () => {
  it('control and object flows: solid line, open arrow at the head, flat tail', () => {
    const a = activityDiagram()
    const x = a.node('Action', 0, 0)
    const y = a.node('ObjectNode', 300, 0)
    const cf = a.edge('ControlFlow', x, y)
    const of = a.edge('ObjectFlow', y, x)
    const layout = a.layout()
    for (const e of [cf, of]) {
      const l = layout.edges.get(e._id) as EdgeLayout
      expect(l.dash).toBe('solid')
      expect(l.headEnd).toEqual({ style: 'stickArrow' })
      expect(l.tailEnd).toEqual({ style: 'flat' })
      // Unnamed flows have no labels.
      expect(l.labels).toEqual([])
    }
  })

  it('labels name [guard] {weight=w} 15 above the middle; guard-only labels edit the guard', () => {
    const a = activityDiagram()
    const d = a.node('DecisionNode', 0, 100)
    const x = a.node('Action', 200, 80)
    const flow = a.edge('ControlFlow', d, x)
    const model = flow.model as Elem
    setFields(a.engine, model, { guard: 'ok' })
    let l = a.layout().edges.get(flow._id) as EdgeLayout
    expect(l.labels).toHaveLength(1)
    const label = l.labels[0]
    expect(label?.text).toBe('[ok]')
    expect(label?.edit).toEqual({ kind: 'field', elementId: model._id, field: 'guard' })
    expect(label?.editText).toBe('ok')
    expect(EDGE_LABEL_DEFAULTS.name.distance).toBe(15)
    // A left-to-right flow puts the name label above the line.
    const mid = (l.points[0]?.y ?? 0) + ((l.points[l.points.length - 1]?.y ?? 0) - (l.points[0]?.y ?? 0)) / 2
    expect((label?.box.top ?? 0) + 13).toBeLessThan(mid)

    setFields(a.engine, model, { name: 'yes', weight: '2' })
    l = a.layout().edges.get(flow._id) as EdgeLayout
    expect(l.labels[0]?.text).toBe('yes [ok] {weight=2}')
    expect(l.labels[0]?.edit).toEqual({ kind: 'name', elementId: model._id })
    expect(l.labels[0]?.box.width).toBe(Math.ceil('yes [ok] {weight=2}'.length * CHAR))
    expect(flowLabelText({ _id: 'x', _type: 'UMLControlFlow', _parent: null, weight: '3' } as unknown as Elem)).toBe('{weight=3}')
  })
})
