import { describe, expect, it } from 'vitest'
import { setFields } from '../../../commands'
import { canConnect, createDefaultProject, isKindOf, Repository, type Elem } from '../../../model'
import { createDiagram, ModelEngine } from '../../../commands'
import { structureTest } from '../object/testEnv'
import type { ClassifierData } from '../class/layout'
import { conveyedText } from './edges'

describe('information item', () => {
  it('is a classifier box with the fixed «information» keyword', () => {
    const t = structureTest('InformationFlowDiagram')
    const item = t.node('InformationItem', 40, 40)
    const model = item.model as Elem
    expect(model).toMatchObject({ _type: 'UMLInformationItem', name: 'InformationItem1' })
    expect(model._parent).toBe(t.diagram._parent)
    expect(item._type).toBe('UMLInformationItemView')
    expect(isKindOf(item, 'UMLClassifierView')).toBe(true)
    const l = t.nodeLayout<ClassifierData>(item)
    expect(l.data.nameLines.map((x) => x.text)).toEqual(['«information»', 'InformationItem1'])
    expect(l.box.height).toBe(70)
    expect(l.box.width).toBeGreaterThanOrEqual(120)
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['attributes', 'operations'])
  })
})

describe('information flow', () => {
  it('connects any two model elements, owned by the tail', () => {
    const t = structureTest('InformationFlowDiagram')
    const a = t.node('InformationItem', 40, 40)
    const b = t.node('Class', 340, 40)
    const note = t.node('Note', 340, 200)
    expect(canConnect('InformationFlow', a, b)).toBe(true)
    expect(canConnect('InformationFlow', a, note)).toBe(false)
    const flow = t.edge('InformationFlow', a, b)
    const model = flow.model as Elem
    expect(model).toMatchObject({ _type: 'UMLInformationFlow' })
    expect(model._parent).toBe(a.model)
    expect(model['source']).toBe(a.model)
    expect(model['target']).toBe(b.model)
    expect(flow._type).toBe('UMLInformationFlowView')
  })

  it('is dashed with a stick arrow, «flow» always shown, conveyed names in the middle', () => {
    const t = structureTest('InformationFlowDiagram')
    const a = t.node('InformationItem', 40, 40)
    const b = t.node('Class', 340, 40)
    const flow = t.edge('InformationFlow', a, b)
    let l = t.edgeLayout(flow)
    expect(l.dash).toBe('dot')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.labels.map((x) => x.text)).toEqual(['«flow»'])
    const c1 = t.node('Class', 40, 300, { name: 'Order' })
    const c2 = t.node('Class', 240, 300, { name: 'Invoice' })
    setFields(t.engine, flow.model as Elem, { conveyed: [c1.model, c2.model] })
    expect(conveyedText(flow.model)).toBe('Order, Invoice')
    l = t.edgeLayout(flow)
    expect(l.labels.map((x) => x.text).sort()).toEqual(['Order, Invoice', '«flow»'].sort())
    // The stereotype slot sits above (distance 30) the name slot (distance 15).
    const name = l.labels.find((x) => x.text === 'Order, Invoice')!
    const kw = l.labels.find((x) => x.text === '«flow»')!
    expect(kw.box.top).toBeLessThan(name.box.top + 40)
  })
})

describe('add diagram', () => {
  it('wraps the project in a model like class diagrams', () => {
    const repo = new Repository(createDefaultProject())
    const engine = new ModelEngine(repo)
    const plan = createDiagram(engine, 'InformationFlowDiagram', repo.project as Elem)
    expect(plan.diagram._parent?._type).toBe('UMLModel')
    expect(plan.diagram.name).toBe('InformationFlowDiagram1')
  })
})
