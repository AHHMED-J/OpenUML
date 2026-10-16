import { describe, expect, it } from 'vitest'
import { addAttribute, createEdge, createNode, retypeElement } from '.'
import { testDiagram } from '../diagram/testUtils'
import type { Elem, View } from '../model'

describe('retypeElement', () => {
  it('swaps an element for one of another type, keeping its values, contents, place and references', () => {
    const t = testDiagram()
    const a = createNode(t.engine, { kind: 'Class', diagram: t.diagram, left: 0, top: 0 }).view as View
    const b = createNode(t.engine, { kind: 'Class', diagram: t.diagram, left: 300, top: 0 }).view as View
    const cls = a.model as Elem
    addAttribute(t.engine, cls, { name: 'id' })
    const dep = createEdge(t.engine, { kind: 'Dependency', diagram: t.diagram, tail: a, head: b }).model as Elem
    const owner = cls._parent as Elem
    const index = (owner['ownedElements'] as Elem[]).indexOf(cls)
    let copy: Elem | null = null
    t.engine.transact('Retype', (builder) => {
      copy = retypeElement(builder, cls, 'UMLInterface')
    })
    const iface = copy as unknown as Elem
    expect(iface._type).toBe('UMLInterface')
    expect(iface['name']).toBe(cls['name'])
    expect((owner['ownedElements'] as Elem[]).indexOf(iface)).toBe(index)
    expect((iface['attributes'] as Elem[])[0]?.['name']).toBe('id')
    expect(a.model).toBe(iface)
    expect(dep['source']).toBe(iface)
    expect(t.repository.contains(cls)).toBe(false)
    // One undo step restores the class.
    t.engine.undo()
    expect(a.model?._type).toBe('UMLClass')
    expect(((a.model as Elem)['attributes'] as Elem[])[0]?.['name']).toBe('id')
  })
})
