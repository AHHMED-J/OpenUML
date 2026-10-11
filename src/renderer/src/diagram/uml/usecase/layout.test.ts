import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addExtensionPoint, setFields } from '../../../commands'
import type { Elem, NodeView, View } from '../../../model'
import { createNodeAt, creationContainer, findDropContainer, moveSelection } from '../../editor/actions'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { DiagramContent } from '../../render/DiagramContent'
import { nodeNotationFor } from '../../render/registry'
import { testDiagram } from '../../testUtils'
import { SUBJECT_Z_INDEX, stickFigure, type ActorData, type SubjectData, type UseCaseData } from './layout'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).
const BOLD_CHAR = 13 * 0.6 * 1.1
const CHAR = 13 * 0.6
/** Name compartment width of a bold one-line name: ceil(text) + 2 × 5 padding. */
const nameWidth = (n: number): number => Math.ceil(n * BOLD_CHAR) + 10

function useCase(layout: NodeLayout | undefined): NodeLayout<UseCaseData> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<UseCaseData>
}

function actor(layout: NodeLayout | undefined): NodeLayout<ActorData> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<ActorData>
}

describe('use case layout', () => {
  it('fits the name compartment by the √2 rule (min 70 × 32) and centers it in the ellipse', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 10, 20, 20, 20)
    const l = useCase(t.layout().nodes.get(view._id))
    // "UseCase1": 8 bold chars → name compartment 79 × 25.
    expect(l.minWidth).toBe(Math.max(Math.floor(Math.SQRT2 * nameWidth(8)), 70))
    expect(l.minWidth).toBe(111)
    expect(l.minHeight).toBe(Math.floor(Math.SQRT2 * 25))
    expect(l.minHeight).toBe(35)
    expect(l.box).toEqual({ left: 10, top: 20, width: 111, height: 35 })
    expect(l.outline).toBe('ellipse')
    expect(l.endpoint).toBeUndefined()
    expect(l.data.form).toBe('ellipse')
    expect(l.data.ellipse).toEqual(l.box)
    // Name compartment: floor(111 / √2) = 78 wide, centered both ways.
    expect(l.data.nameRect).toEqual({ left: 10 + (111 - 78) / 2, top: 20 + (35 - 25) / 2, width: 78, height: 25 })
    const name = l.data.nameLines[0]
    expect(name?.text).toBe('UseCase1')
    expect(name?.font.style).toBe(1)
    expect(name?.align).toBe('center')
    expect(l.regions).toHaveLength(1)
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: view.model?._id })
    expect(l.regions[0]?.box).toEqual(l.data.nameRect)
  })

  it('keeps the 70 × 32 minimum for short names and a larger stored size', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0, 20, 10)
    setFields(t.engine, view.model as Elem, { name: 'A' })
    const l = useCase(t.layout().nodes.get(view._id))
    expect([l.minWidth, l.minHeight]).toEqual([70, 35])
    const big = t.node('UseCase', 0, 100, 300, 120)
    const lb = useCase(t.layout().nodes.get(big._id))
    expect(lb.box).toEqual({ left: 0, top: 100, width: 300, height: 120 })
    expect(lb.data.nameRect.width).toBe(Math.floor(300 / Math.SQRT2))
  })

  it('grows the √2 box with a stereotype line (38-tall name compartment)', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0)
    setFields(t.engine, view.model as Elem, { stereotype: 'business' })
    const l = useCase(t.layout().nodes.get(view._id))
    expect(l.minHeight).toBe(Math.floor(Math.SQRT2 * 38))
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«business»', 'UseCase1'])
    // Width: the widest item is «business» (10 regular chars) vs the bold name (8).
    expect(l.minWidth).toBe(Math.floor(Math.SQRT2 * (Math.ceil(Math.max(10 * CHAR, 8 * BOLD_CHAR)) + 10)))
  })

  it('wraps the name with wordWrap: minimum fits the longest word, lines follow the width', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0, 200, 50)
    setFields(t.engine, view.model as Elem, { name: 'Withdraw cash from account' })
    const unwrapped = useCase(t.layout().nodes.get(view._id))
    expect(unwrapped.minWidth).toBe(Math.floor(Math.SQRT2 * nameWidth(26)))
    expect(unwrapped.data.nameLines.map((n) => n.text)).toEqual(['Withdraw cash from account'])

    setFields(t.engine, view, { wordWrap: true })
    const l = useCase(t.layout().nodes.get(view._id))
    // Longest word "Withdraw" (8 bold chars).
    expect(l.minWidth).toBe(Math.floor(Math.SQRT2 * nameWidth(8)))
    expect(l.box.width).toBe(200)
    // Text width = floor(200 / √2) − 10 = 131: two lines, 2 apart.
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['Withdraw cash', 'from account'])
    const [first, second] = l.data.nameLines
    expect((second?.box.top ?? 0) - (first?.box.top ?? 0)).toBe(13 + 2)
    expect(l.minHeight).toBe(Math.floor(Math.SQRT2 * (5 + 2 + 13 + 2 + 13 + 5)))
    expect(l.data.nameRect.height).toBe(40)
    // Auto-resize narrows to the longest word: one word per line.
    setFields(t.engine, view, { autoResize: true })
    const a = useCase(t.layout().nodes.get(view._id))
    expect(a.box.width).toBe(a.minWidth)
    expect(a.data.nameLines.map((n) => n.text)).toEqual(['Withdraw', 'cash', 'from', 'account'])
    expect(a.box.height).toBe(Math.floor(Math.SQRT2 * (10 + 4 * 15)))
    expect(a.sizable).toBe('none')
  })

  it('lists extension points in a compartment below the ellipse (ellipse shortened by its height + 5)', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0, 120, 50)
    const uc = view.model as Elem
    const ep1 = addExtensionPoint(t.engine, uc, { name: 'Help' })
    addExtensionPoint(t.engine, uc, { name: 'Receipt', location: 'after payment' })
    const l = useCase(t.layout().nodes.get(view._id))
    const comp = l.data.compartments[0]
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['extensionPoints'])
    // Two rows: 5 + 13 + 2 + 13 + 5 = 38.
    expect(comp?.rect.height).toBe(38)
    expect(comp?.rows.map((r) => r.text)).toEqual(['Help', 'Receipt: after payment'])
    const rowWidth = Math.ceil('Receipt: after payment'.length * CHAR) + 10
    expect(l.minWidth).toBe(Math.max(111, rowWidth))
    expect(l.minHeight).toBe(35 + 38 + 5)
    expect(l.box.height).toBe(78)
    expect(l.data.ellipse).toEqual({ left: 0, top: 0, width: l.box.width, height: 78 - 43 })
    expect(comp?.rect.top).toBe(35 + 5)
    // Edges clip to the ellipse only.
    expect(l.endpoint).toEqual({ box: l.data.ellipse, outline: 'ellipse' })
    // Rows are inline-editable by name; the name region comes first.
    expect(l.regions.map((r) => r.target)).toEqual([
      { kind: 'name', elementId: uc._id },
      { kind: 'name', elementId: ep1._id },
      { kind: 'name', elementId: (uc['extensionPoints'] as Elem[])[1]?._id }
    ])
    expect(l.regions[2]?.text).toBe('Receipt')
  })

  it('shows unsuppressed attribute compartments under the extension points', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0)
    addExtensionPoint(t.engine, view.model as Elem)
    setFields(t.engine, view, { suppressAttributes: false })
    const l = useCase(t.layout().nodes.get(view._id))
    expect(l.data.compartments.map((c) => [c.kind, c.rect.height])).toEqual([
      ['extensionPoints', 23],
      ['attributes', 10]
    ])
    expect(l.minHeight).toBe(35 + 23 + 10 + 5)
  })

  it('draws the iconic form as a 70:32 ellipse with the name below', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0, 120, 50)
    setFields(t.engine, view, { stereotypeDisplay: 'icon' })
    const l = useCase(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('icon')
    expect([l.minWidth, l.minHeight]).toEqual([nameWidth(8), 32 + 25])
    expect(l.data.ellipse).toEqual({ left: 25, top: 0, width: 70, height: 32 })
    expect(l.data.nameRect).toEqual({ left: 0, top: 32, width: 120, height: 25 })
    expect(l.endpoint).toEqual({ box: l.data.ellipse, outline: 'ellipse' })
  })

  it('draws the decoration form as a box with a small ellipse icon', () => {
    const t = testDiagram()
    const view = t.node('UseCase', 0, 0, 20, 20)
    setFields(t.engine, view, { stereotypeDisplay: 'decoration' })
    const l = useCase(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('box')
    expect(l.outline).toBe('rect')
    expect([l.minWidth, l.minHeight]).toEqual([nameWidth(8) + 24 + 10, 34])
    expect(l.data.ellipse.width).toBe(24)
    expect(l.data.ellipse.height).toBeCloseTo(24 * 32 / 70)
    expect(l.data.ellipse.left).toBe(l.box.width - 24 - 5)
  })
})

describe('actor layout', () => {
  it('draws a 26:55 stick figure centered at the top with the name below', () => {
    const t = testDiagram()
    const view = t.node('Actor', 100, 50)
    const l = actor(t.layout().nodes.get(view._id))
    // "Actor1": 6 bold chars → 62 wide; 55 + 25 tall.
    expect([l.minWidth, l.minHeight]).toEqual([nameWidth(6), 80])
    expect(l.box).toEqual({ left: 100, top: 50, width: 62, height: 80 })
    expect(l.data.form).toBe('figure')
    expect(l.data.figure).toEqual({ left: 100 + 18, top: 50, width: 26, height: 55 })
    expect(l.data.nameRect).toEqual({ left: 100, top: 105, width: 62, height: 25 })
    expect(l.data.nameLines[0]?.text).toBe('Actor1')
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: view.model?._id })
    expect(l.outline).toBe('rect')
  })

  it('keeps the minimum figure width 26 for short names and scales the figure with the box', () => {
    const t = testDiagram()
    const view = t.node('Actor', 0, 0, 10, 10)
    setFields(t.engine, view.model as Elem, { name: 'A' })
    const l = actor(t.layout().nodes.get(view._id))
    expect([l.minWidth, l.minHeight]).toEqual([26, 80])
    setFields(t.engine, view, { width: 100, height: 135 })
    const big = actor(t.layout().nodes.get(view._id))
    // 135 − 25 = 110 tall → 52 wide, centered.
    expect(big.data.figure).toEqual({ left: 24, top: 0, width: 52, height: 110 })
  })

  it('computes the stick figure proportions', () => {
    const g = stickFigure({ left: 0, top: 0, width: 26, height: 55 })
    expect(g.head.left).toBeCloseTo(0.16 * 26)
    expect(g.head.left + g.head.width).toBeCloseTo(26 - 0.16 * 26)
    expect(g.head.top).toBe(1)
    expect(g.head.top + g.head.height).toBeCloseTo(0.34 * 55)
    expect(g.body).toEqual([13, 0.34 * 55, 13, 0.66 * 55])
    expect(g.arms[1]).toBeCloseTo(0.46 * 55)
    expect(g.arms[0]).toBeCloseTo(0.14 * 26)
    expect(g.leftLeg).toEqual([13, 0.66 * 55, 0, 54])
    expect(g.rightLeg).toEqual([13, 0.66 * 55, 26, 54])
  })

  it('shows stereotypes in label form only, and wraps names with wordWrap', () => {
    const t = testDiagram()
    const view = t.node('Actor', 0, 0)
    setFields(t.engine, view.model as Elem, { stereotype: 'system' })
    expect(actor(t.layout().nodes.get(view._id)).minHeight).toBe(55 + 38)
    setFields(t.engine, view, { stereotypeDisplay: 'icon' })
    expect(actor(t.layout().nodes.get(view._id)).minHeight).toBe(55 + 25)

    const other = t.node('Actor', 200, 0, 40, 80)
    setFields(t.engine, other.model as Elem, { name: 'Bank Customer' })
    setFields(t.engine, other, { wordWrap: true })
    const l = actor(t.layout().nodes.get(other._id))
    expect(l.minWidth).toBe(nameWidth(8))
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['Bank', 'Customer'])
    expect(l.minHeight).toBe(55 + 5 + 2 + 13 + 2 + 13 + 5)
  })

  it('draws the decoration form as a box with a stick-figure icon', () => {
    const t = testDiagram()
    const view = t.node('Actor', 0, 0)
    setFields(t.engine, view, { stereotypeDisplay: 'decoration', suppressAttributes: false })
    const l = actor(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('box')
    expect(l.minWidth).toBe(nameWidth(6) + 24 + 10)
    expect(l.minHeight).toBe(34 + 10)
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['attributes'])
    expect(l.data.figure.height).toBe(24)
    expect(l.data.figure.width).toBeCloseTo(24 * 26 / 55)
  })
})

describe('subject layout and containment', () => {
  it('draws a box with the name at the top, behind ordinary views', () => {
    const t = testDiagram()
    const uc = t.node('UseCase', 50, 80)
    const subject = t.node('Subject', 0, 0, 300, 400)
    // Move the subject to the end of the view list: it still paints first.
    const views = t.diagram.ownedViews as View[]
    views.push(...views.splice(views.indexOf(subject), 1))
    const layout = t.layout()
    const l = layout.nodes.get(subject._id) as NodeLayout<SubjectData>
    expect(l.zIndex).toBe(SUBJECT_Z_INDEX)
    expect(layout.order.indexOf(subject._id)).toBeLessThan(layout.order.indexOf(uc._id))
    expect(l.box).toEqual({ left: 0, top: 0, width: 300, height: 400 })
    expect(l.data.nameRect).toEqual({ left: 0, top: 0, width: 300, height: 25 })
    const name = String((subject.model as Elem)['name'])
    expect(l.data.nameLines[0]?.text).toBe(name)
    expect([l.minWidth, l.minHeight]).toEqual([Math.max(50, nameWidth(name.length)), 40])
  })

  it('shows and edits the represented classifier name', () => {
    const t = testDiagram()
    const subject = t.node('Subject', 0, 0)
    const cls = t.node('Class', 400, 0)
    setFields(t.engine, subject.model as Elem, { represent: cls.model })
    const l = t.layout().nodes.get(subject._id) as NodeLayout<SubjectData>
    expect(l.data.nameLines[0]?.text).toBe('Class1')
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: cls.model?._id })
  })

  it('contains new use cases (owned by the subject owner) and re-parents dropped ones', () => {
    const t = testDiagram()
    const subject = t.node('Subject', 0, 0, 300, 400)
    const notation = nodeNotationFor(subject)
    expect(notation.container?.accepts(subject, null)).toBe(true)
    expect(notation.container?.accepts(subject, subject.model as Elem)).toBe(true)
    const layout = t.layout()
    expect(creationContainer(t, layout, 'UseCase', { x: 100, y: 100 })).toBe(subject)
    expect(creationContainer(t, layout, 'Actor', { x: 100, y: 100 })).toBe(subject)
    expect(creationContainer(t, layout, 'UseCase', { x: 500, y: 100 })).toBeNull()
    const id = createNodeAt(t, layout, 'UseCase', { left: 50, top: 50, width: 120, height: 50 })
    const view = t.repository.get(id!) as View
    expect(view.containerView).toBe(subject)
    expect(subject.containedViews).toContain(view)
    expect(view.model?._parent).toBe(subject.model?._parent)

    // A use case from another package dropped into the subject moves to the subject's owner.
    const pkg = t.node('Package', 600, 0, 300, 300)
    const inPkg = t.repository.get(createNodeAt(t, t.layout(), 'UseCase', { left: 650, top: 50, width: 120, height: 50 })!) as NodeView
    expect(inPkg.model?._parent).toBe(pkg.model)
    const l2 = t.layout()
    expect(findDropContainer(t, l2, { x: 100, y: 300 }, [inPkg])).toBe(subject)
    moveSelection(t, [inPkg._id], -600, 200, { container: subject })
    expect(inPkg.containerView).toBe(subject)
    expect(inPkg.model?._parent).toBe(subject.model?._parent)
    // Moving the subject moves its contents.
    moveSelection(t, [subject._id], 10, 0)
    expect((view as NodeView).left).toBe(60)
  })
})

describe('use case edges', () => {
  function horizontalPair(kind: 'Include' | 'Extend'): { t: ReturnType<typeof testDiagram>; edge: View; l: EdgeLayout } {
    const t = testDiagram()
    const a = t.node('UseCase', 0, 0, 120, 50)
    const b = t.node('UseCase', 300, 0, 120, 50)
    const edge = t.edge(kind, a, b)
    const l = t.layout().edges.get(edge._id)
    if (!l) throw new Error('no edge layout')
    return { t, edge, l }
  }

  it('draws include as a dotted open arrow clipped to the ellipses with «include» 30 above the middle', () => {
    const { l } = horizontalPair('Include')
    expect(l.dash).toBe('dot')
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.tailEnd.style).toBe('flat')
    // Ellipses: the centre line meets them at x = 120 and x = 300 (ends sit 1 outside the outline).
    expect(l.points).toEqual([
      { x: 121, y: 25 },
      { x: 299, y: 25 }
    ])
    expect(l.labels.map((x) => x.text)).toEqual(['«include»'])
    const label = l.labels[0]!
    expect(label.box.width).toBe(Math.ceil(9 * CHAR))
    // Middle anchor (210, 25), +π/2 → 30 above the line.
    expect(Math.abs(label.box.left + label.box.width / 2 - 210)).toBeLessThanOrEqual(1)
    expect(Math.abs(label.box.top + label.box.height / 2 - (25 - 30))).toBeLessThanOrEqual(1)
  })

  it('shows «extend», user stereotypes before the keyword, names and the condition below', () => {
    const { t, edge, l } = horizontalPair('Extend')
    expect(l.labels.map((x) => x.text)).toEqual(['«extend»'])
    const model = edge.model as Elem
    setFields(t.engine, model, { name: 'opt', stereotype: 'rare', condition: ' x > 0 ' })
    const l2 = t.layout().edges.get(edge._id)!
    expect(l2.labels.map((x) => x.text)).toEqual(['opt', '«rare» «extend»', '[x > 0]'])
    const cond = l2.labels[2]!
    expect(cond.edit).toEqual({ kind: 'field', elementId: model._id, field: 'condition' })
    expect(cond.editText).toBe('x > 0')
    // Property position: 15 below the middle.
    expect(Math.abs(cond.box.top + cond.box.height / 2 - (25 + 15))).toBeLessThanOrEqual(1)
    expect(l2.labels[0]?.edit).toEqual({ kind: 'name', elementId: model._id })
    // stereotypeDisplay none hides the user stereotype but never the keyword.
    setFields(t.engine, edge, { stereotypeDisplay: 'none' })
    expect(t.layout().edges.get(edge._id)!.labels[1]?.text).toBe('«extend»')
  })

  it('connects actors and use cases with class relationships (association, generalization, dependency)', () => {
    const t = testDiagram()
    const a = t.node('Actor', 0, 0)
    const b = t.node('Actor', 0, 200)
    const uc = t.node('UseCase', 300, 10, 120, 50)
    const assoc = t.edge('Association', a, uc)
    const gen = t.edge('Generalization', b, a)
    const dep = t.edge('Dependency', uc, a)
    const layout = t.layout()
    const al = layout.edges.get(assoc._id)!
    expect(al.dash).toBe('solid')
    expect([al.tailEnd.style, al.headEnd.style]).toEqual(['flat', 'flat'])
    // Ends attach (1 outside) to the actor box (right x = 62) and to the use case ellipse.
    expect(al.points[0]?.x).toBe(63)
    // The head end lies on the ellipse (centre (360, 35), radii 60 × 25).
    const head = al.points[al.points.length - 1]!
    const r = ((head.x - 360) / 60) ** 2 + ((head.y - 35) / 25) ** 2
    expect(r).toBeGreaterThan(0.95)
    expect(r).toBeLessThan(1.1)
    expect(layout.edges.get(gen._id)?.headEnd.style).toBe('triangle')
    expect(layout.edges.get(dep._id)?.dash).toBe('dot')
  })
})

describe('use case rendering', () => {
  it('renders the ellipse, stick figure, subject box and edge keywords to SVG', () => {
    const t = testDiagram()
    t.node('Subject', 0, 0, 500, 300)
    const a = t.node('Actor', 20, 40)
    const uc = t.node('UseCase', 200, 40, 120, 50)
    const uc2 = t.node('UseCase', 200, 200, 120, 50)
    addExtensionPoint(t.engine, uc.model as Elem, { name: 'Help' })
    t.edge('Association', a, uc)
    t.edge('Include', uc, uc2)
    const html = renderToStaticMarkup(createElement('svg', null, createElement(DiagramContent, { layout: t.layout() })))
    expect(html).toContain('>Actor1</text>')
    expect(html).toContain('>UseCase1</text>')
    expect(html).toContain('>Help</text>')
    expect(html).toContain('>«include»</text>')
    // Ellipses are drawn with arcs; the stick figure with lines.
    expect(html).toMatch(/<path d="M200 [^"]* A60 /)
    expect((html.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
