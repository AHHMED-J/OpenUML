import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, moveElement, setFields } from '../../../commands'
import { canConnect, isKindOf, type EdgeView, type Elem, type NodeView, type View } from '../../../model'
import { validateModel } from '../../../format'
import { applyQuickEdit } from '../../editor/quickEditApply'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { testDiagram } from '../../testUtils'
import type { PackageGlyphData } from './layout'

const BOLD_CHAR = 13 * 0.6 * 1.1
const nameWidth = (n: number): number => Math.ceil(n * BOLD_CHAR) + 10

function pkg(layout: NodeLayout | undefined): NodeLayout<PackageGlyphData> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<PackageGlyphData>
}

describe('package family nodes', () => {
  it('subsystem: package shape with the fork glyph in the tab', () => {
    const t = testDiagram()
    const view = t.node('Subsystem', 10, 20, 200, 100)
    expect(view._type).toBe('UMLSubsystemView')
    expect(view.model?._type).toBe('UMLSubsystem')
    expect(view.model?.['name']).toBe('Subsystem1')
    const l = pkg(t.layout().nodes.get(view._id))
    // Tab: 2/5 of the width, 15 high; body starts one unit above the tab bottom.
    expect(l.data.tab).toEqual({ left: 10, top: 20, width: 80, height: 15 })
    expect(l.data.body.top).toBe(34)
    const right = 90
    expect(l.data.glyph.kind).toBe('subsystem')
    expect(l.data.glyph.polylines).toEqual([
      [
        { x: right - 8, y: 23 },
        { x: right - 8, y: 27 }
      ],
      [
        { x: right - 11, y: 31 },
        { x: right - 11, y: 27 },
        { x: right - 5, y: 27 }
      ],
      [
        { x: right - 5, y: 31 },
        { x: right - 5, y: 27 },
        { x: right - 11, y: 27 }
      ]
    ])
  })

  it('model: triangle glyph; keeps the 50 × 40 package minimum', () => {
    const t = testDiagram()
    const view = t.node('Model', 0, 0, 10, 10)
    setFields(t.engine, view.model as Elem, { name: 'M' })
    const l = pkg(t.layout().nodes.get(view._id))
    expect([l.minWidth, l.minHeight]).toEqual([50, 40])
    expect(l.data.glyph.kind).toBe('model')
    const right = l.data.tab.left + l.data.tab.width
    expect(l.data.glyph.polylines[0]).toEqual([
      { x: right - 9, y: 3 },
      { x: right - 15, y: 10 },
      { x: right - 3, y: 10 }
    ])
    expect(l.data.glyph.closed).toBe(true)
  })

  it('plain packages are unchanged (no glyph)', () => {
    const t = testDiagram()
    const view = t.node('Package', 0, 0)
    const l = t.layout().nodes.get(view._id) as NodeLayout<{ glyph?: unknown }>
    expect(l.data.glyph).toBeUndefined()
    expect(l.minWidth).toBe(Math.max(50, nameWidth(8)))
  })
})

describe('containment', () => {
  it('relocates the tail model into the head and adds a containment view', () => {
    const t = testDiagram()
    const parent = t.node('Package', 0, 0, 300, 200)
    const child = t.node('Class', 400, 0)
    expect(child.model?._parent).toBe(t.diagram._parent)
    expect(canConnect('Containment', child, parent)).toBe(true)
    const plan = createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: child, head: parent })
    expect(plan.model).toBeNull()
    expect(plan.view?._type).toBe('UMLContainmentView')
    expect(child.model?._parent).toBe(parent.model)
    expect((parent.model as Elem)['ownedElements']).toContain(child.model)
    const l = t.layout().edges.get((plan.view as View)._id) as EdgeLayout
    expect(l.dash).toBe('solid')
    expect(l.headEnd.style).toBe('circlePlus')
    expect(l.tailEnd.style).toBe('flat')
    // One undoable step.
    t.engine.undo()
    expect(child.model?._parent).toBe(t.diagram._parent)
    expect(t.diagram.ownedViews.some((v) => v._type === 'UMLContainmentView')).toBe(false)
    t.engine.redo()
    expect(t.diagram.ownedViews.some((v) => v._type === 'UMLContainmentView')).toBe(true)
    expect(child.model?._parent).toBe(parent.model)
  })

  it('removes the containment link to the old owner when the element is contained elsewhere', () => {
    const t = testDiagram()
    const first = t.node('Package', 0, 0, 300, 200)
    const second = t.node('Package', 0, 300, 300, 200)
    const child = t.node('Class', 400, 0)
    const kept = createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: child, head: first }).view as View
    // Drawing the same link again keeps the existing one: it still holds.
    createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: child, head: first })
    const links = () => t.diagram.ownedViews.filter((v) => v._type === 'UMLContainmentView') as EdgeView[]
    expect(links()).toHaveLength(2)
    const moved = createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: child, head: second }).view as View
    expect(child.model?._parent).toBe(second.model)
    expect(links()).toEqual([moved])
    expect(validateModel(t.repository.root as Elem)).toEqual([])
    // One undoable step brings back both the owner and the old links.
    t.engine.undo()
    expect(child.model?._parent).toBe(first.model)
    expect(links().map((v) => v._id)).toContain(kept._id)
    expect(links()).toHaveLength(2)
  })

  it('rejects a head inside the tail, self links and non-elements', () => {
    const t = testDiagram()
    const outer = t.node('Package', 0, 0)
    const inner = t.node('Package', 300, 0)
    createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: inner, head: outer })
    expect(inner.model?._parent).toBe(outer.model)
    expect(canConnect('Containment', outer, inner)).toBe(false)
    expect(canConnect('Containment', outer, outer)).toBe(false)
    const note = t.node('Note', 0, 300)
    expect(canConnect('Containment', note, outer)).toBe(false)
    expect(canConnect('Containment', outer, note)).toBe(false)
    expect(() => createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: outer, head: inner })).toThrow()
  })

  it('does not move the model again when it is already inside the head', () => {
    const t = testDiagram()
    const outer = t.node('Package', 0, 0, 300, 200)
    const inner = t.node('Class', 50, 50)
    moveElement(t.engine, inner.model as Elem, outer.model as Elem)
    const plan = createEdge(t.engine, { kind: 'Containment', diagram: t.diagram, tail: inner, head: outer })
    expect(plan.moves).toBeUndefined()
    expect(inner.model?._parent).toBe(outer.model)
  })
})

describe('package dependencies', () => {
  it('prints a typed «import» stereotype above the dependency', () => {
    const t = testDiagram()
    const a = t.node('Package', 0, 0)
    const b = t.node('Package', 300, 0)
    const dep = t.edge('Dependency', a, b)
    expect(applyQuickEdit(t.engine, { kind: 'name', elementId: (dep.model as Elem)._id }, '<<import>>')).toBe(true)
    expect((dep.model as Elem)['stereotype']).toBe('import')
    const l = t.layout().edges.get(dep._id) as EdgeLayout
    expect(l.dash).toBe('dot')
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.labels.map((x) => x.text)).toContain('«import»')
  })
})

describe('package diagram creation', () => {
  it('wraps the diagram in a model on the project, nests it elsewhere', () => {
    const t = testDiagram()
    const project = t.repository.project as Elem
    const plan = createDiagram(t.engine, 'PackageDiagram', project)
    expect(plan.diagram._type).toBe('UMLPackageDiagram')
    expect(plan.diagram._parent?._type).toBe('UMLModel')
    expect(plan.diagram._parent?._parent).toBe(project)
    const pkgPlan = createNode(t.engine, { kind: 'Package', diagram: plan.diagram, left: 0, top: 0 })
    expect(pkgPlan.model?._parent).toBe(plan.diagram._parent)
    const other = createDiagram(t.engine, 'PackageDiagram', pkgPlan.model as Elem)
    expect(other.diagram._parent).toBe(pkgPlan.model)
    expect(isKindOf(other.diagram, 'Diagram')).toBe(true)
    const node = createNode(t.engine, { kind: 'Subsystem', diagram: other.diagram, left: 0, top: 0 }).view as NodeView
    expect(node.model?._parent).toBe(pkgPlan.model)
  })
})
