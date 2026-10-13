import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge } from '../../../commands'
import { renderDiagramSvg } from '../../../export'
import { readMdj, validateModel, writeMdj } from '../../../format'
import { isKindOf, type Diagram, type Project, type Elem, type NodeKind, type NodeView, type View } from '../../../model'
import { ADD_DIAGRAM_ITEMS } from '../../../ui/modelActions'
import { createEdgeBetween, createNodeAt, moveSelection } from '../../editor/actions'
import { applyQuickEdit } from '../../editor/quickEditApply'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { CHAR, testDiagram } from '../../testUtils'
import { snapToSegment } from './edges'
import type { DurationConstraintData, TimeSegmentData, TimeTickData, TimingLifelineData, TimingStateData } from './layout'
import { arrangeTiming } from './arrange'
import { intervalText, parseInterval } from './layout'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).

function timing() {
  const t = testDiagram()
  const owner = t.diagram._parent as Elem
  const diagram = createDiagram(t.engine, 'TimingDiagram', owner).diagram as Diagram
  const env = { engine: t.engine, diagram, measurer: t.measurer }
  const layout = () => computeDiagramLayout(diagram, t.repository, t.measurer)
  const at = (kind: NodeKind, x: number, y: number, w = 0, h = 0): View | null => {
    const id = createNodeAt(env, layout(), kind, { left: x, top: y, width: w, height: h })
    return id ? (t.repository.get(id) as View) : null
  }
  const frame = diagram.ownedViews[0] as NodeView
  /** A lifeline band with one row; returns the views. */
  const lifelineWithRow = (name?: string) => {
    const l = at('TimingLifeline', 100, 100 + diagram.ownedViews.length * 5) as View
    if (name) (l.model as Elem)['name'] = name
    const ll = layout().nodes.get(l._id) as NodeLayout<TimingLifelineData>
    const row = at('TimingState', ll.box.left + 80, ll.box.top + 30) as View
    return { l, row }
  }
  return { ...t, env, diagram, frame, layout, at, lifelineWithRow }
}

function nodeOf<D>(layout: { nodes: ReadonlyMap<string, NodeLayout> }, view: View): NodeLayout<D> {
  const l = layout.nodes.get(view._id)
  if (!l) throw new Error(`no layout for ${view._type}`)
  return l as NodeLayout<D>
}

describe('timing diagram creation', () => {
  it('wraps the diagram like a sequence diagram and adds a 5,5 – 700,600 timing frame', () => {
    const a = timing()
    const interaction = a.diagram._parent as Elem
    const collaboration = interaction._parent as Elem
    expect(a.diagram._type).toBe('UMLTimingDiagram')
    expect(a.diagram['name']).toBe('TimingDiagram1')
    expect(interaction._type).toBe('UMLInteraction')
    expect(collaboration._type).toBe('UMLCollaboration')
    expect(a.frame).toMatchObject({ _type: 'UMLTimingFrameView', left: 5, top: 5, width: 695, height: 595 })
    expect(a.frame.model).toBe(a.diagram)
  })

  it('adds a diagram under an interaction directly', () => {
    const a = timing()
    const second = createDiagram(a.engine, 'TimingDiagram', a.diagram._parent as Elem).diagram as Diagram
    expect(second._parent).toBe(a.diagram._parent)
    expect(ADD_DIAGRAM_ITEMS.find((i) => i.kind === 'TimingDiagram')?.accepts(a.diagram._parent as Elem)).toBe(true)
  })

  it('creates lifelines only inside the frame, with a role attribute, contained by the frame', () => {
    const a = timing()
    expect(a.at('TimingLifeline', 900, 900)).toBeNull()
    const l = a.at('TimingLifeline', 100, 100) as View
    const interaction = a.diagram._parent as Elem
    const collaboration = interaction._parent as Elem
    expect(l._type).toBe('UMLTimingLifelineView')
    expect(l.containerView).toBe(a.frame)
    expect(a.frame.containedViews).toContain(l)
    expect(l.model?._parent).toBe(interaction)
    expect(interaction['participants']).toContain(l.model)
    const role = l.model?.['represent'] as Elem
    expect(role?.['name']).toBe('Role1')
    expect(collaboration['attributes']).toContain(role)
    expect((l as NodeView).width).toBeGreaterThanOrEqual(200)
  })

  it('creates state/condition rows only on a lifeline, owned by it', () => {
    const a = timing()
    expect(a.at('TimingState', 120, 120)).toBeNull()
    const l = a.at('TimingLifeline', 100, 100) as View
    const box = nodeOf<TimingLifelineData>(a.layout(), l).box
    const row = a.at('TimingState', box.left + 80, box.top + 30) as View
    expect(row.model?.['name']).toBe('State-Condition1')
    expect(row.model?._parent).toBe(l.model)
    expect(l.model?.['ownedElements']).toContain(row.model)
    expect(row.containerView).toBe(l)
    // Clicking on the row again uses its lifeline.
    const rowBox = nodeOf<TimingStateData>(a.layout(), row).box
    const row2 = a.at('TimingState', rowBox.left + 20, rowBox.top + 5) as View
    expect(row2.model?.['name']).toBe('State-Condition2')
    expect(row2.model?._parent).toBe(l.model)
    expect(row2.containerView).toBe(l)
  })

  it('creates segments by dragging on a row: invariant ← row, covered ← lifeline, width ≥ 3 grid cells', () => {
    const a = timing()
    const { l, row } = a.lifelineWithRow()
    const rb = nodeOf<TimingStateData>(a.layout(), row).box
    const seg = a.at('TimeSegment', rb.left + 200, rb.top + 2, 10, 4) as View
    expect(seg.model?._type).toBe('UMLStateInvariant')
    expect(seg.model?.['name']).toBe('Time Segment1')
    expect(seg.model?.['covered']).toBe(l.model)
    expect(seg.model?.['invariant']).toBe(row.model)
    expect(seg.containerView).toBe(row)
    expect((seg as NodeView).width).toBe(36)
    expect((seg as NodeView).height).toBe(25)
    expect((a.diagram._parent as Elem)['fragments']).toContain(seg.model)
    expect(a.at('TimeSegment', 500, 500, 40, 20)).toBeNull()
  })

  it('creates view-only ticks in the frame', () => {
    const a = timing()
    expect(a.at('TimeTick', 900, 900)).toBeNull()
    const tick = a.at('TimeTick', 200, 550) as View
    expect(tick.model ?? null).toBeNull()
    expect(tick.containerView).toBe(a.frame)
    expect((tick as NodeView).width).toBe(35)
  })
})

describe('timing arrangement', () => {
  it('stacks bands top-down under the frame label, ordered by their stored top', () => {
    const a = timing()
    const first = a.at('TimingLifeline', 100, 100) as View
    const second = a.at('TimingLifeline', 100, 300) as View
    // Dragging the first band below the second swaps the order (stacking follows the stored top).
    moveSelection(a.env, [first._id], 0, 400)
    const arr = arrangeTiming({ diagram: a.diagram, repository: a.repository, measurer: a.measurer, nodeLayout: () => undefined, edgeLayout: () => undefined })
    const b1 = arr.bands.get(first._id)
    const b2 = arr.bands.get(second._id)
    expect(b2?.box.top).toBeLessThan(b1?.box.top ?? 0)
    // Frame label band is 23 tall at 13 px (13 + 10); bands start 5 below it.
    expect(b2?.box.top).toBe(5 + 23 + 5)
    expect(b1?.box.top).toBe((b2?.box.top ?? 0) + (b2?.box.height ?? 0))
    expect(b1?.box.left).toBe(5)
    expect(b1?.box.width).toBe(695)
  })

  it('places rows from band.top + 25 and right-aligns their label 5 left of startX', () => {
    const a = timing()
    const { l, row } = a.lifelineWithRow('Door')
    const band = nodeOf<TimingLifelineData>(a.layout(), l)
    const r = nodeOf<TimingStateData>(a.layout(), row)
    expect(r.box.top).toBe(band.box.top + 25)
    expect(r.box.height).toBe(25)
    const arr = arrangeTiming({ diagram: a.diagram, repository: a.repository, measurer: a.measurer, nodeLayout: () => undefined, edgeLayout: () => undefined })
    const labelWidth = Math.ceil('State-Condition1'.length * CHAR)
    expect(r.data.label.align).toBe('right')
    expect(r.data.label.box.left + r.data.label.box.width).toBe(arr.startX - 5)
    expect(arr.startX).toBeGreaterThanOrEqual(r.box.left + labelWidth + 5)
    expect(band.box.height).toBe(Math.max(25 + 25 + 25, Math.ceil(band.data.name.text.length * 13 * 0.6 * 1.1) + 10))
    expect(r.moveAxis).toBe('vert')
    expect(band.moveAxis).toBe('vert')
  })

  it('lays the segments of a lifeline out contiguously from startX in the order of their left', () => {
    const a = timing()
    const { row } = a.lifelineWithRow()
    const rb = nodeOf<TimingStateData>(a.layout(), row).box
    const s1 = a.at('TimeSegment', rb.left + 300, rb.top + 2, 60, 10) as NodeView
    const s2 = a.at('TimeSegment', rb.left + 100, rb.top + 2, 40, 10) as NodeView
    const arr = arrangeTiming({ diagram: a.diagram, repository: a.repository, measurer: a.measurer, nodeLayout: () => undefined, edgeLayout: () => undefined })
    const l2 = nodeOf<TimeSegmentData>(a.layout(), s2)
    const l1 = nodeOf<TimeSegmentData>(a.layout(), s1)
    expect(l2.box.left).toBe(arr.startX)
    expect(l1.box.left).toBe(arr.startX + 40)
    expect(l1.box.width).toBe(60)
    expect(l1.box.height).toBe(25)
    expect(l2.data.centerY).toBe(rb.top + 12)
    expect(l2.data.step).toBeNull()
    expect(l1.data.step).toEqual({ x: l1.box.left, fromY: rb.top + 12, toY: rb.top + 12 })
    expect(l1.sizable).toBe('horz')
    expect(l1.derivedPosition).toBe(true)
  })

  it('draws a state-change step to the predecessor on another row', () => {
    const a = timing()
    const { l, row } = a.lifelineWithRow()
    const box = nodeOf<TimingLifelineData>(a.layout(), l).box
    const row2 = a.at('TimingState', box.left + 80, box.top + 60) as View
    const r1 = nodeOf<TimingStateData>(a.layout(), row).box
    const r2 = nodeOf<TimingStateData>(a.layout(), row2).box
    expect(r2.top).toBe(r1.top + 25)
    const s1 = a.at('TimeSegment', r1.left + 100, r1.top + 2, 50, 4) as NodeView
    const s2 = a.at('TimeSegment', r2.left + 300, r2.top + 2, 50, 4) as NodeView
    const l2 = nodeOf<TimeSegmentData>(a.layout(), s2)
    expect(l2.data.step).toEqual({ x: nodeOf<TimeSegmentData>(a.layout(), s1).box.left + 50, fromY: r2.top + 12, toY: r1.top + 12 })
  })

  it('lays ticks out contiguously from startX along the frame bottom and grows the frame around its content', () => {
    const a = timing()
    a.lifelineWithRow()
    const t2 = a.at('TimeTick', 200, 560, 50, 0) as View
    const t1 = a.at('TimeTick', 400, 560) as View
    applyQuickEdit(a.engine, { kind: 'text', viewId: t1._id }, '10 ms')
    const arr = arrangeTiming({ diagram: a.diagram, repository: a.repository, measurer: a.measurer, nodeLayout: () => undefined, edgeLayout: () => undefined })
    const layout = a.layout()
    const l1 = nodeOf<TimeTickData>(layout, t1)
    const l2 = nodeOf<TimeTickData>(layout, t2)
    expect(l2.box.left).toBe(arr.startX)
    expect(l1.box.left).toBe(arr.startX + l2.box.width)
    expect(l1.box.height).toBe(11)
    expect(l1.data.text.text).toBe('10 ms')
    const frame = nodeOf<unknown>(layout, a.frame).box
    expect(l1.box.top + l1.box.height).toBeLessThan(frame.top + frame.height)
    expect(l1.data.text.box.top).toBeGreaterThan(l1.box.top + l1.box.height)
    expect(l1.moveAxis).toBe('horz')
  })

  it('moves the segment between rows by re-linking invariant and covered', () => {
    const a = timing()
    const first = a.lifelineWithRow('A')
    const second = a.lifelineWithRow('B')
    const rb = nodeOf<TimingStateData>(a.layout(), first.row).box
    const seg = a.at('TimeSegment', rb.left + 100, rb.top + 2, 50, 4) as NodeView
    const target = nodeOf<TimingStateData>(a.layout(), second.row).box
    moveSelection(a.env, [seg._id], 0, target.top - rb.top, { container: second.row })
    expect(seg.containerView).toBe(second.row)
    expect(seg.model?.['invariant']).toBe(second.row.model)
    expect(seg.model?.['covered']).toBe(second.l.model)
    expect(first.row.containedViews).not.toContain(seg)
    a.engine.undo()
    expect(seg.model?.['invariant']).toBe(first.row.model)
    expect(seg.model?.['covered']).toBe(first.l.model)
    expect(seg.containerView).toBe(first.row)
  })

  it('writes the arranged position back so the stored order matches what is drawn', () => {
    const a = timing()
    const { row } = a.lifelineWithRow()
    const rb = nodeOf<TimingStateData>(a.layout(), row).box
    const seg = a.at('TimeSegment', rb.left + 300, rb.top + 2, 50, 4) as NodeView
    const arr = arrangeTiming({ diagram: a.diagram, repository: a.repository, measurer: a.measurer, nodeLayout: () => undefined, edgeLayout: () => undefined })
    expect(seg.left).toBe(arr.startX)
    expect(seg.top).toBe(rb.top)
  })
})

describe('timing messages and constraints', () => {
  function twoSegments() {
    const a = timing()
    const one = a.lifelineWithRow('A')
    const two = a.lifelineWithRow('B')
    const r1 = nodeOf<TimingStateData>(a.layout(), one.row).box
    const r2 = nodeOf<TimingStateData>(a.layout(), two.row).box
    const s1 = a.at('TimeSegment', r1.left + 200, r1.top + 2, 60, 4) as NodeView
    const s2 = a.at('TimeSegment', r2.left + 200, r2.top + 2, 60, 4) as NodeView
    return { a, one, two, s1, s2 }
  }

  it('connects only time segments; source/target are the covered lifelines', () => {
    const { a, one, two, s1, s2 } = twoSegments()
    expect(() => createEdge(a.engine, { kind: 'TimingMessage', diagram: a.diagram, tail: one.row, head: s2 })).toThrow()
    const id = createEdgeBetween(a.env, a.layout(), { kind: 'TimingMessage' }, s1._id, s2._id, { x: 0, y: 0 }) as string
    const view = a.repository.get(id) as View
    expect(view._type).toBe('UMLTimingMessageView')
    expect(view.model).toMatchObject({ _type: 'UMLMessage', source: one.l.model, target: two.l.model, messageSort: 'synchCall' })
    expect((a.diagram._parent as Elem)['messages']).toContain(view.model)
    expect(view.tail).toBe(s1)
    expect(view.head).toBe(s2)
  })

  it('draws a straight line at the segment row centers with ends snapped to the segment edges', () => {
    const { a, s1, s2 } = twoSegments()
    const id = createEdgeBetween(a.env, a.layout(), { kind: 'TimingMessage' }, s1._id, s2._id, { x: 0, y: 0 }) as string
    const layout = a.layout()
    const e = layout.edges.get(id) as EdgeLayout
    const l1 = nodeOf<TimeSegmentData>(layout, s1)
    const l2 = nodeOf<TimeSegmentData>(layout, s2)
    expect(e.points).toHaveLength(2)
    expect(e.points[0]).toEqual({ x: l1.box.left + l1.box.width, y: l1.data.centerY })
    expect(e.points[1]).toEqual({ x: l2.box.left, y: l2.data.centerY })
    expect(e.headEnd.style).toBe('solidArrow')
    expect(e.tailEnd.style).toBe('flat')
    expect(e.dash).toBe('solid')
    expect(e.labels[0]?.edit).toMatchObject({ kind: 'custom', syntax: 'message' })
  })

  it('snaps an end to the nearest segment edge within 10 units, else keeps it', () => {
    expect(snapToSegment(103, 100, 160)).toBe(100)
    expect(snapToSegment(155, 100, 160)).toBe(160)
    expect(snapToSegment(130, 100, 160)).toBe(130)
    expect(snapToSegment(50, 100, 160)).toBe(100)
    expect(snapToSegment(500, 100, 160)).toBe(160)
  })

  it('attaches a time constraint to a segment or a message with a link edge', () => {
    const { a, s1, s2 } = twoSegments()
    const l1 = nodeOf<TimeSegmentData>(a.layout(), s1)
    const label = a.at('TimeConstraint', l1.box.left + 20, l1.box.top + 10) as View
    expect(label._type).toBe('UMLTimeConstraintView')
    expect(label.model).toMatchObject({ _type: 'UMLTimeConstraint', min: '', max: '' })
    expect(label.model?._parent).toBe(s1.model)
    expect((label as NodeView).top).toBe(l1.box.top + 10 + 20)
    const link = a.diagram.ownedViews.find((v) => v._type === 'UMLTimeConstraintLinkView') as View
    expect(link.tail).toBe(s1)
    expect(link.head).toBe(label)
    const layout = a.layout()
    expect(layout.edges.get(link._id)?.points).toHaveLength(2)
    expect(a.at('TimeConstraint', 20, 20)).toBeNull()
    const msgId = createEdgeBetween(a.env, layout, { kind: 'TimingMessage' }, s1._id, s2._id, { x: 0, y: 0 }) as string
    const mid = a.layout().edges.get(msgId) as EdgeLayout
    const p = { x: Math.round((mid.points[0]!.x + mid.points[1]!.x) / 2), y: Math.round((mid.points[0]!.y + mid.points[1]!.y) / 2) }
    const onMessage = a.at('TimeConstraint', p.x, p.y) as View
    expect(onMessage.model?._parent).toBe(a.repository.get(msgId)?.model)
  })

  it('edits interval constraints as min..max', () => {
    const { a, s1 } = twoSegments()
    const l1 = nodeOf<TimeSegmentData>(a.layout(), s1)
    const label = a.at('TimeConstraint', l1.box.left + 20, l1.box.top + 10) as View
    expect(intervalText(label.model)).toBe('{min..max}')
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: label.model?._id as string, syntax: 'interval' }, '1..5 ms')).toBe(true)
    expect(label.model).toMatchObject({ min: '1', max: '5 ms' })
    expect(intervalText(label.model)).toBe('{1..5 ms}')
    expect(parseInterval('{2..3}')).toEqual({ min: '2', max: '3' })
    expect(parseInterval('7')).toEqual({ min: '7', max: '' })
  })

  it('draws duration constraints as horizontal double arrows (min 16 × 14) with a {min..max} label', () => {
    const a = timing()
    const d = a.at('DurationConstraint', 200, 300, 5, 5) as View
    expect(d.model?._type).toBe('UMLDurationConstraint')
    expect(d.containerView).toBe(a.frame)
    const l = nodeOf<DurationConstraintData>(a.layout(), d)
    expect(l.data.horizontal).toBe(true)
    expect([l.box.width, l.box.height]).toEqual([16, 14])
    expect(l.sizable).toBe('horz')
    expect(l.data.label.text).toBe('{min..max}')
  })
})

describe('timing .mdj round trip', () => {
  it('survives save and load with segments, ticks, constraints and messages', () => {
    const a = timing()
    const one = a.lifelineWithRow('A')
    const two = a.lifelineWithRow('B')
    const r1 = nodeOf<TimingStateData>(a.layout(), one.row).box
    const r2 = nodeOf<TimingStateData>(a.layout(), two.row).box
    const s1 = a.at('TimeSegment', r1.left + 200, r1.top + 2, 60, 4) as NodeView
    const s2 = a.at('TimeSegment', r2.left + 200, r2.top + 2, 60, 4) as NodeView
    createEdgeBetween(a.env, a.layout(), { kind: 'TimingMessage' }, s1._id, s2._id, { x: 0, y: 0 })
    a.at('TimeTick', 300, 560)
    a.at('DurationConstraint', 300, 300, 60, 20)
    const l1 = nodeOf<TimeSegmentData>(a.layout(), s1)
    a.at('TimeConstraint', l1.box.left + 5, l1.box.top + 5)
    expect(validateModel(a.repository.project as Project)).toEqual([])
    const text = writeMdj(a.repository.project as Project)
    const reread = readMdj(text)
    expect(reread.warnings).toEqual([])
    expect(writeMdj(reread.project)).toBe(text)
    for (const type of ['UMLTimingFrameView', 'UMLTimingLifelineView', 'UMLTimingStateView', 'UMLTimeSegmentView', 'UMLTimeTickView', 'UMLTimingMessageView', 'UMLTimeConstraintView', 'UMLDurationConstraintView']) {
      expect(text, type).toContain(`"${type}"`)
    }
    // After the reload the model links are intact.
    const loaded = [...reread.repository.elements()].filter((e) => e._type === 'UMLStateInvariant')
    expect(loaded).toHaveLength(2)
    for (const seg of loaded) {
      expect(isKindOf(seg['covered'] as Elem, 'UMLLifeline')).toBe(true)
      expect(isKindOf(seg['invariant'] as Elem, 'UMLConstraint')).toBe(true)
    }
    expect(isKindOf(s1.model, 'UMLStateInvariant')).toBe(true)
  })

  it('draws the timing frame, rotated lifeline names, step lines and ticks to SVG', () => {
    const a = timing()
    const { row } = a.lifelineWithRow('Door')
    const rb = nodeOf<TimingStateData>(a.layout(), row).box
    a.at('TimeSegment', rb.left + 100, rb.top + 2, 50, 4)
    a.at('TimeTick', 300, 560)
    const { svg } = renderDiagramSvg(a.diagram, a.repository, a.measurer)
    expect(svg).toContain('sd')
    expect(svg).toContain('rotate(-90')
    expect(svg).toContain('Door')
  })
})
