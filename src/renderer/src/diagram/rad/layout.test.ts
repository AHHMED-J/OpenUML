import { describe, expect, it } from 'vitest'
import { setFields } from '../../commands'
import { renderDiagramSvg } from '../../export'
import { isKindOf, type Elem, type NodeView, type View } from '../../model'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../layout/types'
import { RadBuilder, clerkFixture, insuranceFixture, legendFixture, letterFixture } from './fixtures'
import type { ActivityData, BranchData, RefinementData, RoleData, RoleStartData, SymbolData, WaitData } from './layout'
import { RAD_GEOMETRY } from './layout'
import { loopLaneX, threadShape } from './routing'

// FixedWidthTextMeasurer: char width = 0.6 x size (bold x 1.1); line height = font size (13).
function lay(b: RadBuilder): DiagramLayout {
  return computeDiagramLayout(b.diagram, b.repository, b.measurer)
}

function node<D = unknown>(l: DiagramLayout, v: View): NodeLayout<D> {
  const n = l.nodes.get(v._id)
  if (!n) throw new Error(`no layout for ${v._type}`)
  return n as NodeLayout<D>
}

function edge(l: DiagramLayout, v: View): EdgeLayout {
  const e = l.edges.get(v._id)
  if (!e) throw new Error(`no layout for ${v._type}`)
  return e
}

const cx = (n: NodeLayout): number => n.box.left + n.box.width / 2
const cy = (n: NodeLayout): number => n.box.top + n.box.height / 2
const right = (n: NodeLayout): number => n.box.left + n.box.width
const bottom = (n: NodeLayout): number => n.box.top + n.box.height

describe('role boxes', () => {
  it('are at least 160 x 120 with the Agent- Role header above the top-left corner', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 100, top: 100, width: 40, height: 30, agent: 'Boss', name: 'Dictating a letter' })
    b.done()
    const n = node<RoleData>(lay(b), role.view)
    expect(n.box).toEqual({ left: 100, top: 100, width: 160, height: 120 })
    expect(n.zIndex).toBe(-1)
    expect(n.sizable).toBe('free')
    const title = n.data.titleLines[n.data.titleLines.length - 1]
    // The title wraps within the (narrow) role width.
    expect(n.data.titleLines.map((x) => x.text).join(' ')).toBe('Boss- Dictating a letter')
    expect(n.data.titleLines[0]?.box.left).toBe(100)
    expect(title ? title.box.top + title.box.height : 0).toBe(100 - RAD_GEOMETRY.titleGap)
    expect(title?.font.style).toBe(1)
    expect(n.data.radius).toBe(20)
    expect(n.extraBounds?.[0]).toEqual(expect.objectContaining({ top: n.data.titleLines[0]?.box.top }))
    expect(n.regions[0]?.target).toEqual({ kind: 'custom', elementId: role.model._id, syntax: 'radRoleTitle' })
    expect(n.regions[0]?.text).toBe('Boss- Dictating a letter')
  })

  it('wraps a long title within the role width into two lines', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 0, top: 0, width: 340, height: 200, agent: 'Customer', name: 'Applying for an insurance policy' })
    b.done()
    const n = node<RoleData>(lay(b), role.view)
    expect(n.data.titleLines.map((l) => l.text)).toEqual(['Customer- Applying for an insurance', 'policy'])
    expect(n.data.titleLines[1]?.box.top).toBeGreaterThan(n.data.titleLines[0]?.box.top ?? 0)
    expect(n.data.titleLines[1] ? n.data.titleLines[1].box.top + n.data.titleLines[1].box.height : 0).toBe(-RAD_GEOMETRY.titleGap)
  })

  it('grow to contain every element and its label plus a 24 padding, never beyond the stored size', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 0, top: 0, width: 160, height: 120, agent: 'A', name: 'Doing things' })
    const far = b.el('far', 'r', 'RADActivity', 3, 4, 'Something quite long that wraps onto more lines than one')
    b.done()
    const l = lay(b)
    const n = node<RoleData>(l, role.view)
    const f = node<ActivityData>(l, far)
    const labelRight = Math.max(...f.data.lines.map((x) => x.box.left + x.box.width))
    expect(n.box.left).toBe(0)
    expect(n.box.top).toBe(0)
    expect(right(n)).toBe(Math.ceil(labelRight) + 24)
    expect(bottom(n)).toBe(Math.max(bottom(f), ...f.data.lines.map((x) => x.box.top + x.box.height)) + 24)
    // A stored size larger than the content is kept.
    setFields(b.engine, role.view, { width: 2000, height: 1500 })
    expect(lay(b).nodes.get(role.view._id)?.box).toMatchObject({ width: 2000, height: 1500 })
  })

  it('grow to the left and top when content lies outside, and are exactly the minimum with auto-resize', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 200, top: 200, width: 600, height: 600, agent: 'A', name: 'Doing things' })
    const el = b.el('e', 'r', 'RADActivity', 0, 0, 'Step')
    b.done()
    setFields(b.engine, el, { left: 100, top: 100 })
    const l = lay(b)
    const n = node(l, role.view)
    expect(n.box.left).toBe(100 - 24)
    expect(n.box.top).toBe(100 - 24)
    expect(n.derivedPosition).toBe(true)
    setFields(b.engine, role.view, { autoResize: true })
    const auto = node(lay(b), role.view)
    const e = node<ActivityData>(lay(b), el)
    const union = e.data.content.reduce((u, r) => ({ left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.left + r.width), bottom: Math.max(u.bottom, r.top + r.height) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
    expect(auto.box).toEqual({ left: union.left - 24, top: union.top - 24, width: Math.max(160, union.right - union.left + 48), height: Math.max(120, union.bottom - union.top + 48) })
    expect(auto.sizable).toBe('none')
  })

  it('keep a free lane on the left for loop-backs inside the box', () => {
    const b = letterFixture()
    const l = lay(b)
    const boss = node(l, b.v('boss'))
    const lane = loopLaneX(b.v('b6'), { measurer: b.measurer, repository: b.repository, diagram: b.diagram, nodeLayout: (id) => l.nodes.get(id), edgeLayout: (id) => l.edges.get(id) })
    const leftmost = Math.min(...['b1', 'b2', 'b3', 'b4', 'b5', 'b7'].map((k) => node(l, b.v(k)).box.left))
    expect(lane).toBe(leftmost - 22)
    expect(lane).toBeGreaterThan(boss.box.left)
  })

  it('draw the header inside the top when headerOutside is off and reserve room for it', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 0, top: 0, width: 300, height: 300, agent: 'A', name: 'Doing things' })
    const el = b.el('e', 'r', 'RADActivity', 0, 0, 'Step')
    b.done()
    setFields(b.engine, role.view, { headerOutside: false, autoResize: true })
    const l = lay(b)
    const n = node<RoleData>(l, role.view)
    const t = n.data.titleLines[0]
    expect(n.data.headerOutside).toBe(false)
    expect(t && t.box.top).toBeGreaterThanOrEqual(n.box.top)
    expect(t ? t.box.top + t.box.height : 0).toBeLessThan(node(l, el).box.top)
  })

  it('show the goal under the title when showGoal is on', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 0, top: 0, width: 300, height: 300, agent: 'A', name: 'Doing things' })
    b.done()
    setFields(b.engine, role.model, { goal: 'Deliver the order' })
    expect(node<RoleData>(lay(b), role.view).data.goalLines).toEqual([])
    setFields(b.engine, role.view, { showGoal: true })
    const n = node<RoleData>(lay(b), role.view)
    expect(n.data.goalLines.map((x) => x.text)).toEqual(['Goal: Deliver the order'])
    expect(n.regions.map((r) => r.target)).toContainEqual({ kind: 'field', elementId: role.model._id, field: 'goal' })
  })
})

describe('symbols', () => {
  it('draw activities as 24 x 24 squares with the label 10 to the right, centred on the square', () => {
    const b = insuranceFixture()
    const l = lay(b)
    const a2 = node<ActivityData>(l, b.v('a2'))
    expect(a2.box).toMatchObject({ width: 24, height: 24 })
    expect(a2.sizable).toBe('none')
    expect(a2.data.interaction).toBe(false)
    const [line] = a2.data.lines
    expect(line?.box.left).toBe(right(a2) + 10)
    expect(line ? line.box.top + line.box.height / 2 : 0).toBeCloseTo(cy(a2) - (a2.data.lines.length - 1) * 8, 5)
    expect(line?.align).toBe('left')
  })

  it('wrap labels at 150 into several lines', () => {
    const b = insuranceFixture()
    const n = node<ActivityData>(lay(b), b.v('c2'))
    expect(n.data.lines.map((x) => x.text)).toEqual(['Receive acceptance', 'or rejection of the', 'policy'])
    for (const line of n.data.lines) expect(line.box.width).toBeLessThanOrEqual(150)
    const lh = n.data.lines[1] && n.data.lines[0] ? n.data.lines[1].box.top - n.data.lines[0].box.top : 0
    expect(lh).toBe(16)
  })

  it('size undefined processes 44 x 26 and state markers 30 x 18 with their labels to the right', () => {
    const b = insuranceFixture()
    const c = clerkFixture()
    const u = node<SymbolData>(lay(b), b.v('m2'))
    expect(u.box).toMatchObject({ width: 44, height: 26 })
    expect(u.outline).toBe('ellipse')
    expect(u.data.lines[0]?.text).toBe('Medical assessment')
    const m = node<SymbolData & { kind: string }>(lay(c), c.v('start'))
    expect(m.box).toMatchObject({ width: 30, height: 18 })
    expect(m.data.kind).toBe('start')
    expect(m.data.lines[0]?.box.left).toBe(right(m) + 10)
  })

  it('draw a wait as a circle with a 40-long stub arriving from the left', () => {
    const b = legendFixture()
    const w = node<WaitData>(lay(b), b.v('c1'))
    expect(w.box).toMatchObject({ width: 24, height: 24 })
    expect(w.data.stub).toEqual({ x1: w.box.left - 40, x2: w.box.left, y: cy(w) })
    expect(w.data.lines[0]?.text).toBe('Awaited event')
  })

  it('label an internal role start with the role it starts and give an external one a 60-long arrow with a caption', () => {
    const b = legendFixture()
    const l = lay(b)
    const internal = node<RoleStartData>(l, b.v('b7'))
    expect(internal.data.tip).toBeNull()
    expect(internal.data.lines.map((x) => x.text)).toEqual(['Waiting for input'])
    const external = node<RoleStartData>(l, b.v('c3'))
    expect(external.box).toMatchObject({ width: 26, height: 26 })
    expect(external.data.tip).toEqual({ x1: right(external), x2: right(external) + 60, y: cy(external) })
    expect(external.data.lines[0]?.box.left).toBe(right(external) + 60 + 6)
    expect(external.regions.map((r) => r.target)).toContainEqual({ kind: 'field', elementId: b.v('c3').model?._id, field: 'externalRole' })
    // A name of its own replaces the referenced role's name.
    setFields(b.engine, b.v('b7').model as Elem, { name: 'Begin the follow-up' })
    expect(node<RoleStartData>(lay(b), b.v('b7')).data.lines[0]?.text).toBe('Begin the follow-up')
  })

  it('put an interaction label above the link when the link runs to the right and beside the square when it runs to the left', () => {
    const b = letterFixture()
    const l = lay(b)
    const boss = node<ActivityData>(l, b.v('b2'))
    const line = boss.data.lines[boss.data.lines.length - 1]
    expect(line ? line.box.top + line.box.height : 0).toBe(cy(boss) - 3)
    const sec = node<ActivityData>(l, b.v('s1'))
    const sline = sec.data.lines[0]
    expect(sline ? sline.box.top + (sec.data.lines.length * 16) / 2 : 0).toBeCloseTo(cy(sec), 5)
  })

  it('draw an interaction with an outside party as a 110-long stub from its side with the caption at the free end', () => {
    const b = clerkFixture()
    const n = node<ActivityData>(lay(b), b.v('c2'))
    expect(n.data.interaction).toBe(true)
    expect(n.data.stub).toEqual({ x1: n.box.left - 110, x2: n.box.left, y: cy(n) })
    expect(n.data.caption.map((x) => x.text).join(' ')).toBe('Interaction with the author')
    expect(n.data.caption[0]?.box.left).toBe(n.box.left - 110)
    for (const c of n.data.caption) expect(c.box.top + c.box.height).toBeLessThanOrEqual(cy(n) - 4)
    // The stub reaches outside the role: it is part of the export bounds but not of what the role contains.
    expect(n.extraBounds?.some((r) => r.left === n.box.left - 110)).toBe(true)
    expect(n.data.content.every((r) => r.left >= n.box.left)).toBe(true)
    setFields(b.engine, b.v('c2').model as Elem, { side: 'right' })
    const r = node<ActivityData>(lay(b), b.v('c2'))
    expect(r.data.stub).toEqual({ x1: right(r), x2: right(r) + 110, y: cy(r) })
    const last = r.data.lines[r.data.lines.length - 1]
    expect(last ? last.box.top + last.box.height : 0).toBe(cy(r) - 3)
    expect(r.data.caption[0] ? r.data.caption[0].box.top : 0).toBeGreaterThan(cy(r))
  })

  it('draw case refinement circles with the question beside the first one and the condition above each alternative', () => {
    const b = letterFixture()
    const l = lay(b)
    const q = node<RefinementData>(l, b.v('b5'))
    expect(q.box).toMatchObject({ width: 24, height: 24 })
    expect(q.data.part).toBe(false)
    expect(q.data.lines.map((x) => x.text).join(' ')).toBe('Is the letter correct?')
    // Wrapped so that it stays clear of the first alternative.
    const no = node<BranchData>(l, b.v('no'))
    for (const line of q.data.lines) expect(line.box.left + line.box.width).toBeLessThan(no.box.left)
    expect(no.data.part).toBe(false)
    expect(no.box).toMatchObject({ width: 24, height: 24 })
    const label = no.data.lines[0]
    expect(label?.text).toBe('No')
    expect(label?.align).toBe('center')
    expect(label ? label.box.left + label.box.width / 2 : 0).toBe(cx(no))
    expect(label ? label.box.top + label.box.height : 0).toBe(no.box.top - 3)
  })

  it('derive the horizontal bar from the refinement to its branches', () => {
    const b = letterFixture()
    const l = lay(b)
    const q = node<RefinementData>(l, b.v('b5'))
    const no = node(l, b.v('no'))
    const yes = node(l, b.v('yes'))
    expect(q.data.bars).toEqual([
      { x1: right(q), x2: no.box.left, y: cy(q) },
      { x1: right(no), x2: yes.box.left, y: cy(q) }
    ])
  })

  it('draw part branches as triangles whose bar meets the slanted sides', () => {
    const b = insuranceFixture()
    const l = lay(b)
    const split = node<RefinementData>(l, b.v('a3'))
    const p1 = node<BranchData>(l, b.v('p1'))
    const p2 = node(l, b.v('p2'))
    expect(p1.data.part).toBe(true)
    expect(p1.box).toMatchObject({ width: 26, height: 24 })
    // At the triangle's vertical centre the width is half the base: 6.5 either side of the centre.
    expect(split.data.bars).toEqual([
      { x1: right(split), x2: cx(p1) - 6.5, y: cy(split) },
      { x1: cx(p1) + 6.5, x2: cx(p2) - 6.5, y: cy(split) }
    ])
    expect(p1.data.lines).toEqual([])
  })

  it('moves a label above the thread of an empty path entering a square from the right', () => {
    const b = letterFixture()
    const l = lay(b)
    const sign = node<ActivityData>(l, b.v('b7'))
    expect(sign.data.lines[0] ? sign.data.lines[0].box.top + sign.data.lines[0].box.height : 0).toBe(cy(sign) - 3)
    // A square without that thread keeps its label centred.
    const review = node<ActivityData>(l, b.v('b4'))
    expect(review.data.lines[0] ? review.data.lines[0].box.top + review.data.lines[0].box.height / 2 : 0).toBe(cy(review))
  })

  it('give every label an edit region, and the symbol one grab rectangle around it and its text', () => {
    const b = insuranceFixture()
    const n = node<ActivityData>(lay(b), b.v('a2'))
    expect(n.regions.length).toBe(2)
    expect(n.regions[0]?.target).toEqual({ kind: 'custom', elementId: b.v('a2').model?._id, syntax: 'radName' })
    expect(n.regions[0]?.text).toBe('Create a customer record')
    // One rectangle, 4 units around the square and every text line.
    expect(n.outerHitAreas).toHaveLength(1)
    const grab = n.outerHitAreas?.[0] as { left: number; top: number; width: number; height: number }
    for (const r of [n.box, ...n.data.lines.map((l) => l.box)]) {
      expect(grab.left).toBeLessThanOrEqual(r.left - 4)
      expect(grab.top).toBeLessThanOrEqual(r.top - 4)
      expect(grab.left + grab.width).toBeGreaterThanOrEqual(r.left + r.width + 4)
      expect(grab.top + grab.height).toBeGreaterThanOrEqual(r.top + r.height + 4)
    }
    // An unnamed symbol is edited through its own box.
    const clerk = clerkFixture()
    const split = node<RefinementData>(lay(clerk), clerk.v('split'))
    expect(split.regions[0]?.box.width).toBeGreaterThan(split.box.width)
  })
})

describe('warnings in layouts', () => {
  it('underline the role header of a role whose name is not a gerund and keep them out of exports', () => {
    const b = new RadBuilder()
    const role = b.role('r', { left: 0, top: 0, agent: 'Boss', name: 'Letter dictation' })
    b.done()
    const n = node<RoleData>(lay(b), role.view)
    expect(n.data.warnTitle).toMatch(/action/)
    expect(n.data.warnLines).toHaveLength(1)
    expect(n.data.warnLines[0]?.width).toBe(n.data.titleLines[0]?.box.width)
    const svg = renderDiagramSvg(b.diagram, b.repository, b.measurer).svg
    expect(svg).not.toContain('rad-warning')
    setFields(b.engine, role.model, { name: 'Dictating letters' })
    expect(node<RoleData>(lay(b), role.view).data.warnLines).toEqual([])
  })
})

describe('state line routing', () => {
  it('runs straight down between elements of one column', () => {
    const b = insuranceFixture()
    const l = lay(b)
    const a1 = node(l, b.v('a1'))
    const a2 = node(l, b.v('a2'))
    const e = edge(l, b.e('a1', 'a2'))
    expect(e.points).toEqual([{ x: cx(a1), y: bottom(a1) }, { x: cx(a1), y: a2.box.top }])
    expect(e.dash).toBe('solid')
    expect(e.tailEnd.style).toBe('flat')
    expect(e.headEnd.style).toBe('flat')
    expect(e.zIndex).toBe(-0.5)
    expect(e.labels).toEqual([])
    expect(threadShape(b.e('a1', 'a2') as never, ctxOf(b, l))).toBe('straight')
  })

  it('collects the paths of a merge on one bus above the target', () => {
    const b = insuranceFixture()
    const l = lay(b)
    const m3 = node(l, b.v('m3'))
    const f3 = node(l, b.v('f3'))
    const a4 = node(l, b.v('a4'))
    const busY = bottom(m3) + 20
    expect(busY).toBe(bottom(f3) + 20)
    expect(busY).toBeLessThan(a4.box.top - 28 + 1)
    expect(edge(l, b.e('m3', 'a4')).points).toEqual([
      { x: cx(m3), y: bottom(m3) },
      { x: cx(m3), y: busY },
      { x: cx(a4), y: busY },
      { x: cx(a4), y: a4.box.top }
    ])
    expect(edge(l, b.e('f3', 'a4')).points).toEqual([
      { x: cx(f3), y: bottom(f3) },
      { x: cx(f3), y: busY },
      { x: cx(a4), y: busY },
      { x: cx(a4), y: a4.box.top }
    ])
  })

  it('places the bus 28 above a close target and keeps it below its sources', () => {
    const b = new RadBuilder()
    b.role('r', { left: 0, top: 0, agent: 'A', name: 'Doing work' })
    b.el('s1', 'r', 'RADActivity', 1, 0, 'One')
    b.el('s2', 'r', 'RADActivity', 2, 0, 'Two')
    b.el('t', 'r', 'RADActivity', 0, 1, 'Target')
    b.line('s1', 't')
    b.line('s2', 't')
    b.el('near', 'r', 'RADActivity', 0, 1.7, 'Close target')
    b.el('s3', 'r', 'RADActivity', 1, 3, 'Three')
    b.line('s3', 'near')
    b.done()
    const l = lay(b)
    const t = node(l, b.v('t'))
    const s1 = node(l, b.v('s1'))
    expect(edge(l, b.e('s2', 't')).points[1]?.y).toBe(t.box.top - 28)
    expect(edge(l, b.e('s1', 't')).points[1]?.y).toBe(t.box.top - 28)
    expect(t.box.top - 28).toBeGreaterThan(bottom(s1))
    void s1
  })

  it('falls back to the middle of the gap when there is no room for the bus above the target', () => {
    const b = new RadBuilder()
    b.role('r', { left: 0, top: 0, agent: 'A', name: 'Doing work' })
    b.el('s1', 'r', 'RADActivity', 1, 0, 'One')
    b.el('t', 'r', 'RADActivity', 0, 0.7, 'Close target')
    b.line('s1', 't')
    b.done()
    const l = lay(b)
    const s1 = node(l, b.v('s1'))
    const t = node(l, b.v('t'))
    expect(edge(l, b.e('s1', 't')).points[1]?.y).toBe(Math.round((bottom(s1) + t.box.top) / 2))
  })

  it('enters the side of the target for an empty path (a branch with nothing on its path)', () => {
    const b = letterFixture()
    const l = lay(b)
    const yes = node(l, b.v('yes'))
    const sign = node(l, b.v('b7'))
    const e = edge(l, b.e('yes', 'b7'))
    expect(e.points).toEqual([
      { x: cx(yes), y: bottom(yes) },
      { x: cx(yes), y: cy(sign) },
      { x: right(sign), y: cy(sign) }
    ])
  })

  it('honours the routing setting of a line', () => {
    const b = letterFixture()
    setFields(b.engine, b.e('yes', 'b7').model as Elem, { routing: 'bus' })
    const l = lay(b)
    const pts = edge(l, b.e('yes', 'b7')).points
    expect(pts).toHaveLength(4)
    expect(pts[3]?.x).toBe(cx(node(l, b.v('b7'))))
    setFields(b.engine, b.e('b4', 'b5').model as Elem, { routing: 'side' })
    // A line in the same column cannot enter from the side; it stays straight.
    expect(edge(lay(b), b.e('b4', 'b5')).points).toHaveLength(2)
  })

  it('draws a loop-back out of the left side, up the lane and back into the thread with an arrow', () => {
    const b = letterFixture()
    const l = lay(b)
    const loop = b.e('b6', 'b2')
    expect(loop.model?.['loopBack']).toBe(true)
    const from = node(l, b.v('b6'))
    const target = node(l, b.v('b2'))
    const lane = Math.min(...['b1', 'b2', 'b3', 'b4', 'b5', 'b7'].map((k) => node(l, b.v(k)).box.left)) - 22
    const e = edge(l, loop)
    expect(e.points).toEqual([
      { x: from.box.left, y: cy(from) },
      { x: lane, y: cy(from) },
      { x: lane, y: target.box.top - 15 },
      { x: cx(target), y: target.box.top - 15 }
    ])
    expect(e.headEnd.style).toBe('stickArrow')
    // The arrow can be switched off.
    setFields(b.engine, loop.model as Elem, { showArrow: false })
    expect(edge(lay(b), loop).headEnd.style).toBe('flat')
  })

  it('leaves a branch circle through its bottom for a loop-back and drops 20 before turning', () => {
    const b = clerkFixture()
    const l = lay(b)
    const no = node(l, b.v('no'))
    const c2 = node(l, b.v('c2'))
    const loop = b.e('no', 'c2')
    expect(loop.model?.['loopBack']).toBe(true)
    const lane = Math.min(...['start', 'c2', 'c3', 'c4', 'c5', 'end'].map((k) => node(l, b.v(k)).box.left)) - 22
    expect(edge(l, loop).points).toEqual([
      { x: cx(no), y: bottom(no) },
      { x: cx(no), y: bottom(no) + 20 },
      { x: lane, y: bottom(no) + 20 },
      { x: lane, y: c2.box.top - 15 },
      { x: cx(c2), y: c2.box.top - 15 }
    ])
  })

  it('follows its ends when an element moves', () => {
    const b = insuranceFixture()
    const before = edge(lay(b), b.e('a1', 'a2')).points
    setFields(b.engine, b.v('a2'), { left: (b.v('a2') as NodeView).left + 40 })
    const after = edge(lay(b), b.e('a1', 'a2')).points
    expect(after.length).toBeGreaterThan(before.length)
    expect(after[after.length - 1]?.x).toBe((b.v('a2') as NodeView).left + 12)
    expect(after[0]).toEqual(before[0])
  })
})

describe('interaction links', () => {
  it('draw a straight thick line between the facing sides when the squares are level', () => {
    const b = letterFixture()
    const l = lay(b)
    const a = node(l, b.v('b2'))
    const c = node(l, b.v('s1'))
    expect(cy(a)).toBe(cy(c))
    const e = edge(l, b.k('b2', 's1'))
    expect(e.points).toEqual([{ x: right(a), y: cy(a) }, { x: c.box.left, y: cy(c) }])
    expect(e.zIndex).toBe(1)
    expect((e.data as { strokeWidth: number }).strokeWidth).toBe(3)
    expect(e.headEnd.style).toBe('flat')
    const back = edge(l, b.k('s5', 'b3'))
    const s5 = node(l, b.v('s5'))
    const b3 = node(l, b.v('b3'))
    expect(back.points).toEqual([{ x: s5.box.left, y: cy(s5) }, { x: right(b3), y: cy(b3) }])
    expect(back.points[0]?.y).toBe(back.points[1]?.y)
  })

  it('draw an oblique line when the squares are on different levels, and an arrowhead on request', () => {
    const b = insuranceFixture()
    const l = lay(b)
    const a5 = node(l, b.v('a5'))
    const c2 = node(l, b.v('c2'))
    const e = edge(l, b.k('a5', 'c2'))
    expect(e.points).toEqual([{ x: a5.box.left, y: cy(a5) }, { x: right(c2), y: cy(c2) }])
    expect(e.points[0]?.y).not.toBe(e.points[1]?.y)
    setFields(b.engine, b.k('a5', 'c2').model as Elem, { showDirection: true })
    expect(edge(lay(b), b.k('a5', 'c2')).headEnd.style).toBe('stickArrow')
  })

  it('are drawn above role boxes, which are drawn below everything else', () => {
    const b = letterFixture()
    const l = lay(b)
    const order = l.order
    const role = order.indexOf(b.v('boss')._id)
    const line = order.indexOf(b.e('b1', 'b2')._id)
    const square = order.indexOf(b.v('b1')._id)
    const link = order.indexOf(b.k('b2', 's1')._id)
    expect(role).toBeLessThan(line)
    expect(line).toBeLessThan(square)
    expect(square).toBeLessThan(link)
  })
})

describe('fixtures', () => {
  const all = (b: RadBuilder): Elem[] => Array.from(b.repository.elements())
  const count = (b: RadBuilder, type: string): number => all(b).filter((e) => e._type === type).length

  it('A: insurance application', () => {
    const b = insuranceFixture()
    expect(count(b, 'RADRole')).toBe(2)
    expect(count(b, 'RADInteraction')).toBe(4)
    expect(count(b, 'RADActivity')).toBe(6)
    expect(count(b, 'RADUndefinedProcess')).toBe(2)
    expect(count(b, 'RADPartRefinement')).toBe(1)
    expect(count(b, 'RADPartBranch')).toBe(2)
    expect(count(b, 'RADInteractionLink')).toBe(2)
    expect(count(b, 'RADStateLine')).toBe(12)
    const merges = all(b).filter((e) => e._type === 'RADStateLine' && (e['target'] as Elem)['name'] === 'Make decision')
    expect(merges).toHaveLength(2)
    expect(lay(b).nodes.size).toBe(2 + 4 + 6 + 2 + 1 + 2)
    expect(lay(b).edges.size).toBe(14)
  })

  it('B: writing a letter', () => {
    const b = letterFixture()
    expect(count(b, 'RADRole')).toBe(2)
    expect(count(b, 'RADCaseRefinement')).toBe(2)
    expect(count(b, 'RADCaseBranch')).toBe(4)
    expect(all(b).filter((e) => e._type === 'RADStateLine' && e['loopBack'] === true)).toHaveLength(1)
    expect(count(b, 'RADInteractionLink')).toBe(2)
  })

  it('C: reviewing and sending letters', () => {
    const b = clerkFixture()
    expect(count(b, 'RADRole')).toBe(1)
    expect(count(b, 'RADStateMarker')).toBe(2)
    expect(count(b, 'RADCaseRefinement')).toBe(1)
    expect(count(b, 'RADPartRefinement')).toBe(1)
    expect(all(b).filter((e) => e._type === 'RADStateLine' && e['loopBack'] === true)).toHaveLength(1)
    expect(all(b).find((e) => e._type === 'RADInteraction')?.['externalParty']).toBe('Interaction with the author')
  })

  it('D: the legend uses every symbol', () => {
    const b = legendFixture()
    for (const type of ['RADActivity', 'RADInteraction', 'RADStateMarker', 'RADUndefinedProcess', 'RADWait', 'RADRoleStart', 'RADCaseRefinement', 'RADCaseBranch', 'RADPartRefinement', 'RADPartBranch', 'RADStateLine', 'RADInteractionLink']) {
      expect(count(b, type), type).toBeGreaterThan(0)
    }
    expect(all(b).filter((e) => e._type === 'RADRoleStart').map((e) => e['externalRole'])).toContain('Role outside the model')
    const l = lay(b)
    expect(l.nodes.size).toBe(all(b).filter((e) => isKindOf(e, 'NodeView') && !isKindOf(e, 'LabelView') && !isKindOf(e, 'NodeParasiticView') && e._type.startsWith('RAD')).length)
  })
})

function ctxOf(b: RadBuilder, l: DiagramLayout) {
  return { measurer: b.measurer, repository: b.repository, diagram: b.diagram, nodeLayout: (id: string) => l.nodes.get(id), edgeLayout: (id: string) => l.edges.get(id) }
}
