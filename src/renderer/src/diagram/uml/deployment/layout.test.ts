import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDiagram, setFields } from '../../../commands'
import { canConnect, isKindOf, type Elem, type EdgeView, type NodeView, type View } from '../../../model'
import { readMdj, writeMdj } from '../../../format'
import { createNodeAt, creationContainer, findDropContainer, moveSelection } from '../../editor/actions'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { DiagramContent } from '../../render/DiagramContent'
import { nameWidth, testDiagram } from '../../testUtils'
import { nodeFaces, nodeGlyph, type NodeData } from './layout'

function node(layout: NodeLayout | undefined): NodeLayout<NodeData> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<NodeData>
}

describe('node notation', () => {
  it('draws a 3D box of depth 10 with min size 45 × 45', () => {
    const t = testDiagram()
    const view = t.node('Node', 10, 20, 10, 10)
    expect(view.model?._type).toBe('UMLNode')
    expect(view['stereotypeDisplay']).toBe('label')
    setFields(t.engine, view.model as Elem, { name: 'A' })
    const l = node(t.layout().nodes.get(view._id))
    expect([l.minWidth, l.minHeight]).toEqual([Math.max(45, nameWidth(1) + 10), 45])
    expect(l.data.form).toBe('box3d')
    const box = l.box
    const faces = nodeFaces(box)
    expect(l.data.faces).toEqual(faces)
    const r = box.left + box.width - 1
    const b = box.top + box.height - 1
    expect(faces.front).toEqual({ left: box.left, top: box.top + 10, width: r - 10 - box.left, height: b - box.top - 10 })
    expect(faces.top).toEqual([
      { x: box.left, y: box.top + 10 },
      { x: box.left + 10, y: box.top },
      { x: r, y: box.top },
      { x: r - 10, y: box.top + 10 }
    ])
    expect(faces.side).toEqual([
      { x: r, y: box.top },
      { x: r - 10, y: box.top + 10 },
      { x: r - 10, y: b },
      { x: r, y: b - 10 }
    ])
  })

  it('grows with the name (content + 10) and lays the name in the front face', () => {
    const t = testDiagram()
    const view = t.node('Node', 0, 0, 10, 10)
    const l = node(t.layout().nodes.get(view._id))
    expect(l.minWidth).toBe(nameWidth(5) + 10)
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['Node1'])
    const line = l.data.nameLines[0]
    expect(line?.box.left).toBe(5)
    expect((line?.box.left ?? 0) + (line?.box.width ?? 0)).toBeLessThanOrEqual(l.box.width - 10)
    expect(line?.box.top).toBeGreaterThanOrEqual(10)
  })

  it('prints a user stereotype above the name, and has decoration and icon forms', () => {
    const t = testDiagram()
    const view = t.node('Node', 0, 0)
    setFields(t.engine, view.model as Elem, { stereotype: 'device' })
    const l = node(t.layout().nodes.get(view._id))
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«device»', 'Node1'])
    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'decoration'))
    const d = node(t.layout().nodes.get(view._id))
    expect(d.data.form).toBe('decoration')
    expect(d.data.faces).toBeNull()
    expect(d.data.glyph).toEqual(nodeGlyph({ left: d.box.left + d.box.width - 29, top: 5, width: 24, height: 24 }))
    t.engine.transact('x', (b) => b.set(view, 'stereotypeDisplay', 'icon'))
    const i = node(t.layout().nodes.get(view._id))
    expect(i.data.form).toBe('icon')
    expect(i.data.faces?.front.width).toBeGreaterThan(0)
    expect(i.minHeight).toBeGreaterThan(45)
  })

  it('renders to SVG', () => {
    const t = testDiagram()
    t.node('Node', 10, 10)
    const svg = renderToStaticMarkup(createElement(DiagramContent, { layout: t.layout() }))
    expect(svg).toContain('Node1')
  })
})

describe('deployment edges', () => {
  it('connection matrix', () => {
    const t = testDiagram()
    const node1 = t.node('Node', 0, 0)
    const node2 = t.node('Node', 300, 0)
    const art = t.node('Artifact', 0, 200)
    const comp = t.node('Component', 200, 200)
    const cls = t.node('Class', 400, 200)
    expect(canConnect('Deployment', art, node1)).toBe(true)
    expect(canConnect('Deployment', comp, node1)).toBe(true)
    expect(canConnect('Deployment', cls, node1)).toBe(true)
    expect(canConnect('Deployment', node1, node2)).toBe(true)
    expect(canConnect('Deployment', node1, art)).toBe(false)
    expect(canConnect('Deployment', art, comp)).toBe(false)
    expect(canConnect('CommunicationPath', node1, node2)).toBe(true)
    expect(canConnect('CommunicationPath', node1, art)).toBe(false)
    expect(canConnect('CommunicationPath', art, node1)).toBe(false)
  })

  it('deployment: dashed, stick arrow and an always-shown «deploy» label', () => {
    const t = testDiagram()
    const node1 = t.node('Node', 0, 0)
    const art = t.node('Artifact', 300, 0)
    const edge = t.edge('Deployment', art, node1) as EdgeView
    const rel = edge.model as Elem
    expect(rel._type).toBe('UMLDeployment')
    expect(rel['source']).toBe(art.model)
    expect(rel['target']).toBe(node1.model)
    expect(rel._parent).toBe(art.model)
    expect(rel['stereotype']).toBeFalsy()
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    expect(l.dash).toBe('dot')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('stickArrow')
    const label = l.labels.find((x) => x.text === '«deploy»')
    expect(label).toBeDefined()
    expect(label?.edgePosition).toBe(1)
  })

  it('communication path: node ↔ node association owned by the tail node', () => {
    const t = testDiagram()
    const a = t.node('Node', 0, 0)
    const b = t.node('Node', 300, 0)
    const edge = t.edge('CommunicationPath', a, b) as EdgeView
    const rel = edge.model as Elem
    expect(rel._type).toBe('UMLCommunicationPath')
    expect(isKindOf(rel, 'UMLAssociation')).toBe(true)
    expect(rel._parent).toBe(a.model)
    expect((rel['end1'] as Elem)['reference']).toBe(a.model)
    expect((rel['end2'] as Elem)['reference']).toBe(b.model)
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    expect(l.dash).toBe('solid')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('flat')
    expect(l.labels.filter((x) => x.text !== '')).toEqual([])
    expect(edge['headMultiplicityLabel']).toBeTruthy()
  })
})

describe('node containment', () => {
  it('creates contained artifacts/components under the node and re-parents dropped models', () => {
    const t = testDiagram()
    const outer = t.node('Node', 0, 0, 400, 300) as NodeView
    const layout = t.layout()
    expect(creationContainer(t, layout, 'Artifact', { x: 100, y: 100 })).toBe(outer)
    expect(creationContainer(t, layout, 'Component', { x: 100, y: 100 })).toBe(outer)
    expect(creationContainer(t, layout, 'Artifact', { x: 700, y: 100 })).toBeNull()
    const id = createNodeAt(t, layout, 'Artifact', { left: 50, top: 50, width: 60, height: 80 })
    const art = t.repository.get(id!) as View
    expect(art.containerView).toBe(outer)
    expect(art.model?._parent).toBe(outer.model)
    // Nested node.
    const inner = t.repository.get(createNodeAt(t, t.layout(), 'Node', { left: 200, top: 50, width: 120, height: 80 })!) as NodeView
    expect(inner.model?._parent).toBe(outer.model)
    // An element dropped in from outside moves its model; dropping it out moves it back.
    const loose = t.node('Component', 600, 50) as NodeView
    expect(loose.model?._parent).toBe(t.diagram._parent)
    expect(findDropContainer(t, t.layout(), { x: 100, y: 250 }, [loose])).toBe(outer)
    moveSelection(t, [loose._id], -500, 200, { container: outer })
    expect(loose.containerView).toBe(outer)
    expect(loose.model?._parent).toBe(outer.model)
    moveSelection(t, [loose._id], 500, 0, { container: null })
    expect(loose.model?._parent).toBe(t.diagram._parent)
    // Moving the node moves what it contains.
    const left = (art as NodeView).left
    moveSelection(t, [outer._id], 10, 0)
    expect((art as NodeView).left).toBe(left + 10)
  })
})

describe('deployment diagram', () => {
  it('Add Diagram on the project wraps it in a new model; round-trips through .mdj', () => {
    const t = testDiagram()
    const project = t.repository.project as Elem
    const plan = createDiagram(t.engine, 'DeploymentDiagram', project)
    expect(plan.diagram._type).toBe('UMLDeploymentDiagram')
    expect(plan.diagram.name).toBe('DeploymentDiagram1')
    expect(plan.diagram._parent?._type).toBe('UMLModel')
    expect(plan.diagram._parent?._parent).toBe(project)
    expect(plan.diagram.ownedViews).toEqual([])

    const text = writeMdj(project)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
  })
})
