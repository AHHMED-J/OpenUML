import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, setFields } from '../../../commands'
import { canConnect, isKindOf, type Elem, type EdgeView, type View } from '../../../model'
import { DiagramContent } from '../../render/DiagramContent'
import { testDiagram } from '../../testUtils'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { componentGlyph, componentTabs, pageShape, type ArtifactData, type ComponentData } from './layout'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).
const BOLD_CHAR = 13 * 0.6 * 1.1
const nameWidth = (n: number): number => Math.ceil(n * BOLD_CHAR) + 10

function node<D>(layout: NodeLayout | undefined): NodeLayout<D> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<D>
}

describe('component notation', () => {
  it('creates a component with a label form, suppressed compartments and no keyword', () => {
    const t = testDiagram()
    const view = t.node('Component', 10, 20)
    expect(view.model?._type).toBe('UMLComponent')
    expect(view.model?.['name']).toBe('Component1')
    expect(view['stereotypeDisplay']).toBe('label')
    expect(view['suppressAttributes']).toBe(true)
    expect(view['suppressOperations']).toBe(true)
    expect(view.model?._parent).toBe(t.diagram._parent)
    const l = node<ComponentData>(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('label')
    // Name text only: no «component» keyword.
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['Component1'])
    expect(l.minWidth).toBe(nameWidth(10) + 20)
    expect(l.minHeight).toBe(45)
  })

  it('keeps the 50 × 45 minimum and draws two tabs over the left edge', () => {
    const t = testDiagram()
    const view = t.node('Component', 0, 0, 10, 10)
    setFields(t.engine, view.model as Elem, { name: 'A' })
    const l = node<ComponentData>(t.layout().nodes.get(view._id))
    expect([l.minWidth, l.minHeight]).toEqual([50, 45])
    expect(l.box).toEqual({ left: 0, top: 0, width: 50, height: 45 })
    expect(l.data.main).toEqual({ left: 10, top: 0, width: 40, height: 45 })
    expect(l.data.tabs).toEqual(componentTabs(l.box))
    expect(l.data.tabs).toEqual([
      { left: 0, top: 7, width: 20, height: 10 },
      { left: 0, top: 27, width: 20, height: 10 }
    ])
    // The name is centered in the area right of left + 20, and vertically in the box.
    const name = l.data.nameLines[0]
    expect(name?.box.left).toBe(25)
    expect(name?.box.top).toBe((45 - 25) / 2 + 5 + 2)
    expect(l.endpoint?.box).toEqual(l.data.main)
  })

  it('shows attribute and operation compartments inside the main rectangle when un-suppressed', () => {
    const t = testDiagram()
    const view = t.node('Component', 0, 0)
    t.engine.transact('x', (b) => b.setAll(view, { suppressAttributes: false, suppressOperations: false }))
    const l = node<ComponentData>(t.layout().nodes.get(view._id))
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['attributes', 'operations'])
    for (const c of l.data.compartments) expect(c.rect.left).toBe(l.data.main.left)
    expect(l.minHeight).toBe(25 + 10 + 10)
  })

  it('draws the decoration and icon forms', () => {
    const t = testDiagram()
    const view = t.node('Component', 0, 0)
    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'decoration'))
    const dec = node<ComponentData>(t.layout().nodes.get(view._id))
    expect(dec.data.form).toBe('decoration')
    expect(dec.data.tabs).toEqual([])
    expect(dec.data.main).toEqual(dec.box)
    const icon = { left: dec.box.left + dec.box.width - 29, top: 5, width: 24, height: 24 }
    expect(dec.data.glyph).toEqual(componentGlyph(icon))
    expect(dec.data.glyph?.main).toEqual({ left: icon.left + 9, top: 10, width: 13, height: 16 })

    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'icon'))
    const ico = node<ComponentData>(t.layout().nodes.get(view._id))
    expect(ico.data.form).toBe('icon')
    expect(ico.minHeight).toBe(45 + 25)
    expect(ico.data.nameLines[0]?.box.top).toBeGreaterThanOrEqual(45)
  })

  it('renders to SVG', () => {
    const t = testDiagram()
    t.node('Component', 10, 10)
    const svg = renderToStaticMarkup(createElement(DiagramContent, { layout: t.layout() }))
    expect(svg).toContain('Component1')
  })
})

describe('artifact notation', () => {
  it('defaults to the page icon form with the name below (min 40 × 50 icon)', () => {
    const t = testDiagram()
    const view = t.node('Artifact', 0, 0, 10, 10)
    expect(view.model?._type).toBe('UMLArtifact')
    expect(view.model?.['fileName']).toBe('')
    setFields(t.engine, view.model as Elem, { name: 'A' })
    const l = node<ArtifactData>(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('icon')
    expect([l.minWidth, l.minHeight]).toEqual([40, 50 + 25])
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['A'])
    expect(l.data.page).toEqual({ left: 0, top: 0, width: 40, height: 50 })
    expect(l.data.pagePolygon).toEqual(pageShape(l.data.page as never).polygon)
    expect(l.data.pagePolygon[1]).toEqual({ x: 28, y: 0 })
    expect(l.data.pagePolygon[2]).toEqual({ x: 40, y: 12 })
    expect(l.data.pageFold).toEqual([
      { x: 28, y: 0 },
      { x: 28, y: 12 },
      { x: 40, y: 12 }
    ])
  })

  it('shows the «artifact» keyword in label form', () => {
    const t = testDiagram()
    const view = t.node('Artifact', 0, 0)
    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'label'))
    const l = node<ArtifactData>(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('box')
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«artifact»', 'Artifact1'])
    expect(l.data.page).toBeNull()
    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'decoration'))
    const d = node<ArtifactData>(t.layout().nodes.get(view._id))
    expect(d.data.page).not.toBeNull()
  })
})

describe('component edges', () => {
  it('component realization: classifier → component, dashed with a hollow triangle', () => {
    const t = testDiagram()
    const cls = t.node('Class', 0, 0)
    const comp = t.node('Component', 300, 0)
    const art = t.node('Artifact', 300, 200)
    expect(canConnect('ComponentRealization', cls, comp)).toBe(true)
    expect(canConnect('ComponentRealization', comp, cls)).toBe(false)
    expect(canConnect('ComponentRealization', art, art)).toBe(false)
    const edge = t.edge('ComponentRealization', cls, comp) as EdgeView
    expect(edge._type).toBe('UMLComponentRealizationView')
    const rel = edge.model as Elem
    expect(rel._type).toBe('UMLComponentRealization')
    expect(isKindOf(rel, 'UMLRealization')).toBe(true)
    expect(rel['source']).toBe(cls.model)
    expect(rel['target']).toBe(comp.model)
    expect(rel._parent).toBe(cls.model)
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    expect(l.dash).toBe('dot')
    expect(l.headEnd.style).toBe('triangle')
    expect(l.tailEnd.style).toBe('flat')
  })

  it('edges attach to the main rectangle of a component, not to its tabs', () => {
    const t = testDiagram()
    const a = t.node('Component', 0, 100)
    const b = t.node('Component', 400, 100)
    const edge = t.edge('Dependency', a, b)
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    const al = t.layout().nodes.get(a._id) as NodeLayout
    const first = l.points[0]
    expect(first && first.x).toBeGreaterThanOrEqual(al.box.left + 10)
  })

  it('a dependency into an icon-form interface is a solid socket without arrowhead', () => {
    const t = testDiagram()
    const comp = t.node('Component', 0, 0)
    const iface = t.node('Interface', 300, 0)
    expect(iface['stereotypeDisplay']).toBe('icon')
    const dep = t.edge('Dependency', comp, iface)
    const l = t.layout().edges.get(dep._id) as EdgeLayout<{ socket: string }>
    expect(l.dash).toBe('solid')
    expect(l.data.socket).toMatch(/^M.*A/)
  })
})

describe('interface ball and socket', () => {
  it('draws a ball for realizations, a socket (no circle) for dependencies and both for mixed', () => {
    const t = testDiagram()
    const diagram = createDiagram(t.engine, 'ComponentDiagram', t.diagram._parent as Elem).diagram
    const mk = (kind: 'Component' | 'Interface', left: number, top: number): View =>
      createNode(t.engine, { kind, diagram, left, top }).view as View
    const comp = mk('Component', 0, 0)
    const other = mk('Component', 0, 200)
    const iface = mk('Interface', 300, 100)
    const kind = (): string | null =>
      (computeDiagramLayout(diagram, t.repository, t.measurer).nodes.get(iface._id) as NodeLayout<{ lollipop: string | null }>).data.lollipop
    expect(kind()).toBe('ball')
    createEdge(t.engine, { kind: 'Dependency', diagram, tail: comp, head: iface })
    expect(kind()).toBe('socket')
    createEdge(t.engine, { kind: 'InterfaceRealization', diagram, tail: other, head: iface })
    expect(kind()).toBe('ball-and-socket')
  })
})
