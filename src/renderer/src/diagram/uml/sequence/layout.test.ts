import { describe, expect, it } from 'vitest'
import { addFeature, createDiagram, createEdge, createNode, ModelEngine, setFields } from '../../../commands'
import { createDefaultProject, createElement, Repository, type Diagram, type Elem, type NodeView, type View } from '../../../model'
import { FixedWidthTextMeasurer, type Point } from '../../core'
import { createEndpointMessage, createNodeAt, moveSelection, resizeSubView, syncGeometry, type DiagramEnv } from '../../editor/actions'
import { hitTestDiagram } from '../../editor/hitTest'
import { applyQuickEdit } from '../../editor/quickEditApply'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../../layout/types'
import { ensureNotations } from '../../notations'
import type { FragmentData, LifelineData } from './layout'
import { BOLD_CHAR } from '../../testUtils'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).

interface SeqTest extends DiagramEnv {
  readonly repository: Repository
  lifeline(left: number, width?: number): View
  message(tail: View, head: View, y: number, sort?: string): View
  self(lifeline: View, y: number): View
  fragment(left: number, top: number, width: number, height: number): View
  layout(): DiagramLayout
  lifelineLayout(view: View): NodeLayout<LifelineData>
  edgeLayout(view: View): EdgeLayout
}

function seq(): SeqTest {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const model = repository.root?.['ownedElements'] as Elem[]
  const diagram = createDiagram(engine, 'SequenceDiagram', model[0] as Elem).diagram as Diagram
  const measurer = new FixedWidthTextMeasurer()
  const env: DiagramEnv = { engine, diagram, measurer }
  const layout = (): DiagramLayout => computeDiagramLayout(diagram, repository, measurer)
  return {
    ...env,
    repository,
    lifeline(left, width = 100) {
      return createNode(engine, { kind: 'Lifeline', diagram, left, top: 40, width, height: 200 }).view as View
    },
    message(tail, head, y, sort = 'synchCall') {
      return createEdge(engine, { kind: 'Message', diagram, tail, head, y, messageSort: sort }).view as View
    },
    self(lifeline, y) {
      return createEdge(engine, { kind: 'Message', diagram, tail: lifeline, head: lifeline, y }).view as View
    },
    fragment(left, top, width, height) {
      return createNode(engine, { kind: 'CombinedFragment', diagram, left, top, width, height }).view as View
    },
    layout,
    lifelineLayout(view) {
      const l = layout().nodes.get(view._id)
      if (!l) throw new Error('no layout')
      return l as NodeLayout<LifelineData>
    },
    edgeLayout(view) {
      const l = layout().edges.get(view._id)
      if (!l) throw new Error('no layout')
      return l
    }
  }
}

const xs = (points: readonly Point[]): number[] => points.map((p) => p.x)

describe('found/lost messages and advanced fragments (editor creation)', () => {
  it('creates found and lost messages with a new endpoint, and a state invariant on a lifeline', () => {
    const t = seq()
    const a = t.lifeline(200)
    const la = t.lifelineLayout(a)
    const found = createEndpointMessage(t, t.layout(), { kind: 'Message', messageSort: 'asynchCall', freeEnd: 'tail' }, a._id, { x: 60, y: 150 }, 150)
    expect(found).not.toBeNull()
    const lost = createEndpointMessage(t, t.layout(), { kind: 'Message', messageSort: 'asynchCall', freeEnd: 'head' }, a._id, { x: 420, y: 200 }, 200)
    expect(lost).not.toBeNull()
    const interaction = t.diagram._parent as Elem
    expect((interaction['participants'] as Elem[]).filter((p) => p._type === 'UMLEndpoint')).toHaveLength(2)
    const nonLifeline = createEndpointMessage(t, t.layout(), { kind: 'Message', freeEnd: 'head' }, 'nope', { x: 1, y: 1 }, 1)
    expect(nonLifeline).toBeNull()
    const layout = t.layout()
    expect(layout.edges.get(found as string)?.points[0]?.y).toBe(150)

    const inv = createNodeAt(t, layout, 'StateInvariant', { left: la.data.lineX + 5, top: 300, width: 0, height: 0 })
    const model = t.repository.get(inv as string) as View
    expect(model.model?.['covered']).toBe(a.model)
    const box = t.layout().nodes.get(inv as string)?.box
    expect((box?.left ?? 0) + (box?.width ?? 0) / 2).toBe(la.data.lineX)
  })
})

describe('lifeline layout', () => {
  it('draws a 40-tall header at y = 40, at least name + 20 wide, with the line at its center', () => {
    const t = seq()
    const a = t.lifeline(50, 20)
    const l = t.lifelineLayout(a)
    const nameWidth = Math.ceil('Lifeline1'.length * BOLD_CHAR)
    expect(l.minWidth).toBe(nameWidth + 20)
    expect(l.box.top).toBe(40)
    expect(l.box.width).toBe(nameWidth + 20)
    expect(l.data.header).toEqual({ left: 50, top: 40, width: nameWidth + 20, height: 40 })
    expect(l.data.lineX).toBe(Math.round(50 + (nameWidth + 20) / 2))
    expect(l.data.lineTop).toBe(80)
    // The line reaches 15 above the diagram frame's bottom (8 + 600).
    expect(l.data.lineBottom).toBe(593)
    // The name is centered vertically in the header.
    const line = l.data.nameLines[0]
    expect(line?.text).toBe('Lifeline1')
    expect((line?.box.top ?? 0) + 13 / 2).toBe(60)
    expect(l.moveAxis).toBe('horz')
  })

  it('shows name[selector]: Type and widens to fit', () => {
    const t = seq()
    const a = t.lifeline(50)
    const lifeline = a.model as Elem
    setFields(t.engine, lifeline, { name: 'c', selector: '1' })
    setFields(t.engine, lifeline['represent'] as Elem, { type: 'CustomerAccount' })
    const l = t.lifelineLayout(a)
    expect(l.data.nameLines[0]?.text).toBe('c[1]: CustomerAccount')
    expect(l.minWidth).toBe(Math.ceil('c[1]: CustomerAccount'.length * BOLD_CHAR) + 20)
  })

  it('extends the line to the frame bottom, and 55 below the lowest message when that is lower', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const c = t.lifeline(450)
    t.message(a, b, 400, 'asynchSignal')
    for (const v of [a, b, c]) expect(t.lifelineLayout(v).data.lineBottom).toBe(593)
    t.message(a, b, 580, 'asynchSignal')
    for (const v of [a, b, c]) {
      const l = t.lifelineLayout(v)
      expect(l.data.lineBottom).toBe(635)
      expect(l.minHeight).toBe(635 - 40)
    }
  })

  it('lets a message be attached below the current lowest one by clicking lower on the lines', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    t.message(a, b, 560, 'asynchSignal')
    const la = t.lifelineLayout(a)
    const lb = t.lifelineLayout(b)
    const y = 600
    for (const [l, v] of [[la, a], [lb, b]] as const) {
      const hit = hitTestDiagram(t.layout(), { x: l.data.lineX, y }, { selected: new Set(), zoom: 1, nodesOnly: true })
      expect(hit?.viewId).toBe(v._id)
    }
    const m = t.message(a, b, y, 'asynchSignal')
    expect(t.edgeLayout(m).points[0]?.y).toBe(y)
  })

  it('cuts a destroyed lifeline at its delete message and draws the X there', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    t.message(a, b, 150, 'deleteMessage')
    t.message(a, a, 300, 'asynchSignal')
    const l = t.lifelineLayout(b)
    expect(l.data.destroyedAt).toBe(150)
    expect(l.data.lineBottom).toBe(150)
    expect(l.box.top + l.box.height).toBe(160)
    // No activation bar below the cut.
    expect(l.data.activations).toEqual([])
    // Writing the measured size back is stable.
    t.engine.transact('sync', (bld) => syncGeometry(t, bld))
    expect(t.lifelineLayout(b).box).toEqual(l.box)
  })

  it('centers a created lifeline header on its create message', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m = t.message(a, b, 200, 'createMessage')
    const l = t.lifelineLayout(b)
    expect(l.data.header.top).toBe(180)
    expect(l.data.lineTop).toBe(220)
    // The message arrives at the header's left side.
    expect(t.edgeLayout(m).points.at(-1)).toEqual({ x: l.data.header.left, y: 200 })
    t.engine.transact('sync', (bld) => syncGeometry(t, bld))
    expect(t.lifelineLayout(b).box).toEqual(l.box)
  })

  it('hits only on the header and near the line', () => {
    const t = seq()
    const a = t.lifeline(50)
    const l = t.lifelineLayout(a)
    const layout = t.layout()
    const opts = { selected: new Set<string>(), zoom: 1 }
    expect(hitTestDiagram(layout, { x: l.data.lineX + 3, y: 150 }, opts)?.viewId).toBe(a._id)
    expect(hitTestDiagram(layout, { x: 55, y: 60 }, opts)?.viewId).toBe(a._id)
    expect(hitTestDiagram(layout, { x: 52, y: 150 }, opts)?.viewId).not.toBe(a._id)
  })

  it('moves only horizontally', () => {
    const t = seq()
    const a = t.lifeline(50)
    moveSelection(t, [a._id], 30, 40)
    const v = a as NodeView
    expect([v.left, v.top]).toEqual([80, 40])
  })
})

describe('messages', () => {
  it('route horizontally between lifeline lines at their stored y and attach to activation bars', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const ax = t.lifelineLayout(a).data.lineX
    const bx = t.lifelineLayout(b).data.lineX
    const m = t.message(a, b, 120)
    const e = t.edgeLayout(m)
    // The synchronous call starts a 14-wide bar on B; the arrow ends at its left side.
    expect(e.points).toEqual([
      { x: ax, y: 120 },
      { x: bx - 7, y: 120 }
    ])
    expect(e.headEnd.style).toBe('solidArrow')
    expect(e.dash).toBe('solid')
    expect(e.zIndex).toBe(1)
    expect(e.dragAxis).toBe('vert')
    // A reply from B leaves the bar's left side.
    const r = t.message(b, a, 200, 'reply')
    const re = t.edgeLayout(r)
    expect(re.points).toEqual([
      { x: bx - 7, y: 200 },
      { x: ax, y: 200 }
    ])
    expect(re.dash).toBe('dot')
    expect(re.headEnd.style).toBe('stickArrow')
  })

  it('keep their y when a lifeline moves and shift vertically when moved', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m = t.message(a, b, 120, 'asynchSignal')
    moveSelection(t, [b._id], 100, 0)
    const bx = t.lifelineLayout(b).data.lineX
    expect(t.edgeLayout(m).points.at(-1)).toEqual({ x: bx, y: 120 })
    moveSelection(t, [m._id], 0, 30)
    expect(t.edgeLayout(m).points.map((p) => p.y)).toEqual([150, 150])
  })

  it('label with sequence numbers in vertical order, signature and arguments', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m2 = t.message(a, b, 200, 'asynchSignal')
    const m1 = t.message(a, b, 100, 'asynchSignal')
    setFields(t.engine, m1.model as Elem, { name: 'getTotal', arguments: 'id', assignmentTarget: 'total' })
    const label = (v: View): string => t.edgeLayout(v).labels.find((l) => l.edit)?.text ?? ''
    expect(label(m1)).toBe('1 : total = getTotal(id)')
    expect(label(m2)).toBe('2 : Message1')
    // Operation signature: parameters and return type unless arguments are given.
    const cls = createElement('UMLClass', { name: 'Cart' })
    const op = createElement('UMLOperation', { name: 'sum', _parent: cls })
    const p = createElement('UMLParameter', { name: 'n', type: 'int', _parent: op })
    const ret = createElement('UMLParameter', { name: '', direction: 'return', type: 'Money', _parent: op })
    op['parameters'] = [p, ret]
    t.engine.transact('add', (bld) => {
      bld.insert(t.diagram._parent as Elem, 'ownedElements', cls)
      bld.insert(cls, 'operations', op)
    })
    setFields(t.engine, m2.model as Elem, { signature: op })
    expect(label(m2)).toBe('2 : sum(n: int): Money')
    setFields(t.engine, t.diagram, { showSignature: false })
    expect(label(m2)).toBe('2 : sum')
    setFields(t.engine, t.diagram, { showSequenceNumber: false })
    expect(label(m1)).toBe('total = getTotal')
    setFields(t.engine, t.diagram, { showSequenceNumber: true, sequenceNumbering: 'custom' })
    setFields(t.engine, m1.model as Elem, { sequenceNumber: '1.a' })
    expect(label(m1)).toBe('1.a : total = getTotal')
  })

  it('place labels above leftward messages too, and show «create» on create messages', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const r = t.message(b, a, 150, 'reply')
    const name = t.edgeLayout(r).labels[0]
    expect(name?.text).toBe('1')
    expect((name?.box.top ?? 0) + (name?.box.height ?? 0)).toBeLessThan(150)
    const c = t.message(a, b, 300, 'createMessage')
    expect(t.edgeLayout(c).labels.map((l) => l.text)).toContain('«create»')
  })

  it('loop self messages out 30 and down 20 into a nested bar', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    t.message(a, b, 100)
    t.message(b, a, 200, 'reply')
    const s = t.self(b, 130)
    const bx = t.lifelineLayout(b).data.lineX
    const e = t.edgeLayout(s)
    // Out from the right side of the level-0 bar, into the right side of the level-1 bar.
    expect(e.points).toEqual([
      { x: bx + 7, y: 130 },
      { x: bx + 37, y: 130 },
      { x: bx + 37, y: 150 },
      { x: bx + 14, y: 150 }
    ])
    // Labels start to the right of the loop.
    expect(e.labels[0]?.box.left).toBe(bx + 42)
  })
})

describe('activation bars', () => {
  it('are 14 wide, start at the arrival y and nest 7 to the right', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m1 = t.message(a, b, 100)
    t.message(b, a, 200, 'reply')
    const s = t.self(b, 130)
    const l = t.lifelineLayout(b)
    const bx = l.data.lineX
    const [outer, inner] = l.data.activations
    // The self call's bar: 150 .. 175 (stored 25), level 1.
    expect(inner).toEqual({ messageId: s._id, level: 1, rect: { left: bx, top: 150, width: 14, height: 25 } })
    // The outer bar reaches its reply at 200 (and ≥ 3 below the nested bar).
    expect(outer).toEqual({ messageId: m1._id, level: 0, rect: { left: bx - 7, top: 100, width: 14, height: 100 } })
  })

  it('grow to 3 below a bar that starts within them, and are hidden by showActivation', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const c = t.lifeline(450)
    t.message(a, b, 100, 'asynchCall')
    t.message(c, b, 110, 'asynchCall')
    const bars = t.lifelineLayout(b).data.activations
    expect(bars.map((x) => [x.rect.top, x.rect.height, x.level])).toEqual([
      [100, 38],
      [110, 25]
    ].map(([top, h], i) => [top, h, i]))
    setFields(t.engine, t.diagram, { showActivation: false })
    expect(t.lifelineLayout(b).data.activations).toEqual([])
  })

  it('are not started by replies or signals', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    t.message(a, b, 100, 'asynchSignal')
    t.message(b, a, 150, 'reply')
    expect(t.lifelineLayout(a).data.activations).toEqual([])
    expect(t.lifelineLayout(b).data.activations).toEqual([])
  })
})

describe('combined fragment', () => {
  it('draws the operator in the pentagon and stacks operands below the label band', () => {
    const t = seq()
    const f = t.fragment(30, 100, 300, 200)
    const fragment = f.model as Elem
    setFields(t.engine, fragment, { interactionOperator: 'alt', name: '' })
    addFeature(t.engine, fragment, 'Operand')
    const operands = fragment['operands'] as Elem[]
    setFields(t.engine, operands[0] as Elem, { guard: 'x > 0' })
    const l = t.layout().nodes.get(f._id) as NodeLayout<FragmentData>
    expect(l.zIndex).toBe(2)
    expect(l.data.label.keyword.text).toBe('alt')
    const band = l.data.label.bandHeight
    expect(band).toBe(23)
    const [o1, o2] = l.data.operands
    // First operand: stored 30 grown to the guard minimum 30 + 13; the last stretches to the bottom.
    expect(o1?.rect).toEqual({ left: 30, top: 123, width: 300, height: 43 })
    expect(o2?.rect).toEqual({ left: 30, top: 166, width: 300, height: 300 - 166 })
    expect(o1?.separator).toBe(false)
    expect(o2?.separator).toBe(true)
    expect(o1?.guard?.text).toBe('[x > 0]')
    expect(o1?.guard?.box.left).toBe(50)
    expect(l.minHeight).toBe(band + 43 + 30)
    // A divider between the operands resizes the first one.
    expect(l.dividers).toHaveLength(1)
    const d = l.dividers?.[0]
    expect(d).toMatchObject({ viewId: o1?.viewId, y: 166, minY: 166, maxY: 270 })
    resizeSubView(t, o1?.viewId as string, 80)
    const l2 = t.layout().nodes.get(f._id) as NodeLayout<FragmentData>
    expect(l2.data.operands.map((o) => o.rect.height)).toEqual([80, 300 - 123 - 80])
    // Regression: an empty guard (second operand) is still a hit area at its edit region, so it
    // can be double-clicked to add a guard.
    const emptyGuard = l2.regions.find((r) => r.target.kind === 'custom' && r.target.elementId === operands[1]?._id)
    expect(emptyGuard?.box).toMatchObject({ left: 50 })
    expect(l2.hitAreas).toContainEqual(emptyGuard?.box)
  })

  it('hits on its border and label but not inside, so messages under it stay selectable', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m = t.message(a, b, 200, 'asynchSignal')
    const f = t.fragment(30, 150, 350, 120)
    const layout = t.layout()
    const opts = { selected: new Set<string>(), zoom: 1 }
    expect(hitTestDiagram(layout, { x: 200, y: 200 }, opts)?.viewId).toBe(m._id)
    expect(hitTestDiagram(layout, { x: 30, y: 210 }, opts)?.viewId).toBe(f._id)
    expect(hitTestDiagram(layout, { x: 40, y: 160 }, opts)?.viewId).toBe(f._id)
  })
})

describe('frame', () => {
  it('is hit on its border only', () => {
    const t = seq()
    const frame = t.diagram.ownedViews[0] as View
    const layout = t.layout()
    const opts = { selected: new Set<string>(), zoom: 1 }
    expect(hitTestDiagram(layout, { x: 300, y: 300 }, opts)).toBeNull()
    expect(hitTestDiagram(layout, { x: 9, y: 300 }, opts)?.viewId).toBe(frame._id)
  })
})

describe('quick edit', () => {
  it('edits lifelines as name[selector]: Type', () => {
    const t = seq()
    const a = t.lifeline(50)
    const region = t.lifelineLayout(a).regions[0]
    expect(region?.text).toBe('Lifeline1')
    expect(applyQuickEdit(t.engine, region?.target as never, 'c[2] : Customer')).toBe(true)
    const lifeline = a.model as Elem
    expect([lifeline['name'], lifeline['selector'], (lifeline['represent'] as Elem)['type']]).toEqual(['c', '2', 'Customer'])
    expect(t.lifelineLayout(a).data.nameLines[0]?.text).toBe('c[2]: Customer')
    expect(t.lifelineLayout(a).regions[0]?.text).toBe('c[2]: Customer')
    expect(applyQuickEdit(t.engine, region?.target as never, 'bad(name')).toBe(false)
  })

  it('edits messages as target = name(arguments)', () => {
    const t = seq()
    const a = t.lifeline(50)
    const b = t.lifeline(250)
    const m = t.message(a, b, 100)
    const label = t.edgeLayout(m).labels[0]
    expect(label?.editText).toBe('Message1')
    expect(applyQuickEdit(t.engine, label?.edit as never, '<<call>> r = getTotal(order, 2)')).toBe(true)
    const msg = m.model as Elem
    expect([msg['assignmentTarget'], msg['name'], msg['arguments'], msg['stereotype']]).toEqual(['r', 'getTotal', 'order, 2', 'call'])
    expect(t.edgeLayout(m).labels.map((l) => l.text)).toEqual(['1 : r = getTotal(order, 2)', '«call»'])
  })

  it('edits operand guards with or without brackets', () => {
    const t = seq()
    const f = t.fragment(30, 100, 300, 200)
    const l = t.layout().nodes.get(f._id) as NodeLayout<FragmentData>
    const region = l.regions.find((r) => r.target.kind === 'custom')
    expect(applyQuickEdit(t.engine, region?.target as never, '[n < 10]')).toBe(true)
    expect(((f.model as Elem)['operands'] as Elem[])[0]?.['guard']).toBe('n < 10')
  })
})

describe('other sequence views', () => {
  it('lay out found-message endpoints on their message', () => {
    const t = seq()
    const a = t.lifeline(250)
    const ep = createElement<NodeView>('UMLEndpointView', { left: 40, top: 0, width: 15, height: 15 })
    t.engine.transact('add', (b) => b.insert(t.diagram, 'ownedViews', ep))
    const msg = createElement('UMLMessage', { name: 'found', messageSort: 'asynchSignal' })
    const view = createElement('UMLSeqMessageView', { model: msg, tail: ep, head: a, points: [{ x: 47, y: 140 }, { x: 300, y: 140 }] })
    t.engine.transact('add', (b) => {
      b.insert(t.diagram._parent as Elem, 'messages', msg)
      b.insert(t.diagram, 'ownedViews', view)
    })
    const layout = t.layout()
    expect(layout.nodes.get(ep._id)?.box).toEqual({ left: 40, top: 133, width: 15, height: 15 })
    expect(layout.edges.get(view._id)?.points.map((p) => p.y)).toEqual([140, 140])
    expect(xs(layout.edges.get(view._id)?.points ?? [])[0]).toBe(55)
  })
})
