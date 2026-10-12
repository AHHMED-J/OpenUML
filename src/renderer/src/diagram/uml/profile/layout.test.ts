import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode } from '../../../commands'
import { canConnect, isKindOf, type EdgeView, type Elem } from '../../../model'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { testDiagram } from '../../testUtils'
import type { ClassifierData } from '../class'
import type { MetaClassData } from './layout'

describe('profile diagram creation', () => {
  it('wraps the diagram in a new profile unless the parent is a profile', () => {
    const t = testDiagram()
    const project = t.repository.project as Elem
    const plan = createDiagram(t.engine, 'ProfileDiagram', project)
    expect(plan.diagram._type).toBe('UMLProfileDiagram')
    expect(plan.diagram.name).toBe('ProfileDiagram1')
    const profile = plan.diagram._parent as Elem
    expect(profile._type).toBe('UMLProfile')
    expect(profile['name']).toBe('Profile1')
    expect(profile._parent).toBe(project)
    // A profile takes the diagram directly.
    const again = createDiagram(t.engine, 'ProfileDiagram', profile)
    expect(again.diagram._parent).toBe(profile)
    expect(again.diagram.name).toBe('ProfileDiagram2')
    // A plain package gets a new profile inside it.
    const model = t.diagram._parent as Elem
    const viaModel = createDiagram(t.engine, 'ProfileDiagram', model)
    expect(viaModel.diagram._parent?._type).toBe('UMLProfile')
    expect(viaModel.diagram._parent?._parent).toBe(model)
  })

  it('creates metaclasses, stereotypes and enumerations under the profile', () => {
    const t = testDiagram()
    const profile = createDiagram(t.engine, 'ProfileDiagram', t.repository.project as Elem)
    const diagram = profile.diagram
    const meta = createNode(t.engine, { kind: 'MetaClass', diagram, left: 0, top: 0 })
    const st = createNode(t.engine, { kind: 'Stereotype', diagram, left: 0, top: 100 })
    const en = createNode(t.engine, { kind: 'Enumeration', diagram, left: 0, top: 200 })
    expect(meta.model?.['name']).toBe('UMLClass')
    expect(meta.model?._type).toBe('UMLMetaClass')
    expect(st.model?.['name']).toBe('Stereotype1')
    expect(isKindOf(st.model, 'UMLClass')).toBe(true)
    for (const p of [meta, st, en]) expect(p.model?._parent).toBe(diagram._parent)
    expect(st.view?._type).toBe('UMLStereotypeView')
    expect(st.view?.['suppressAttributes']).toBe(false)
  })
})

describe('profile notation', () => {
  it('stereotype: class box with the always-shown «stereotype» keyword and tag compartments', () => {
    const t = testDiagram()
    const view = t.node('Stereotype', 0, 0)
    const l = t.layout().nodes.get(view._id) as NodeLayout<ClassifierData>
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«stereotype»', 'Stereotype1'])
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['attributes', 'operations'])
  })

  it('metaclass: «metaClass» over a bold name, no other compartments', () => {
    const t = testDiagram()
    const view = t.node('MetaClass', 0, 0, 120, 10)
    const l = t.layout().nodes.get(view._id) as NodeLayout<MetaClassData>
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«metaClass»', 'UMLClass'])
    expect(l.minHeight).toBe(38)
    expect(l.data.nameLines[1]?.font.style).toBe(1)
    expect(l.regions).toHaveLength(1)
  })

  it('profile view: package shape with the «profile» keyword', () => {
    const t = testDiagram()
    const view = t.node('Profile', 0, 0)
    const l = t.layout().nodes.get(view._id) as NodeLayout<{ nameLines: { text: string }[] }>
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«profile»', 'Profile1'])
  })
})

describe('extension', () => {
  it('connects a stereotype to a metaclass; solid line with a filled arrow; owned by the stereotype', () => {
    const t = testDiagram()
    const st = t.node('Stereotype', 0, 0)
    const meta = t.node('MetaClass', 300, 0)
    const cls = t.node('Class', 0, 300)
    expect(canConnect('Extension', st, meta)).toBe(true)
    expect(canConnect('Extension', meta, st)).toBe(false)
    expect(canConnect('Extension', st, st)).toBe(false)
    expect(canConnect('Extension', cls, meta)).toBe(false)
    expect(canConnect('Extension', st, cls)).toBe(false)
    const plan = createEdge(t.engine, { kind: 'Extension', diagram: t.diagram, tail: st, head: meta })
    const rel = plan.model as Elem
    expect(rel._type).toBe('UMLExtension')
    expect(rel['source']).toBe(st.model)
    expect(rel['target']).toBe(meta.model)
    expect(rel._parent).toBe(st.model)
    const edge = plan.view as EdgeView
    expect(edge._type).toBe('UMLExtensionView')
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    expect(l.dash).toBe('solid')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('solidArrow')
  })

  it('generalization between stereotypes keeps the hollow triangle', () => {
    const t = testDiagram()
    const a = t.node('Stereotype', 0, 0)
    const b = t.node('Stereotype', 300, 0)
    const edge = t.edge('Generalization', a, b)
    const l = t.layout().edges.get(edge._id) as EdgeLayout
    expect(l.headEnd.style).toBe('triangle')
  })
})
