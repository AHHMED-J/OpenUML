import { describe, expect, it } from 'vitest'
import { instantiate, type Elem, type NodeView } from '../../model'
import { callTarget, childTarget, openTargetOf, parentTarget } from './navigation'
import { exampleKit } from './testkit'

describe('IDEF0 navigation', () => {
  it('goes from a child diagram to the diagram holding its box, selecting that box', () => {
    const k = exampleKit()
    const t = parentTarget(k.child)!
    expect(t.diagram).toBe(k.context)
    expect(t.view?.model).toBe(k.top)
    expect(parentTarget(k.context)).toBeNull()
  })

  it('goes from a box to its child diagram and nowhere without one', () => {
    const k = exampleKit()
    expect(childTarget(k.top)).toBe(k.child)
    expect(childTarget(k.example.a1)).toBeNull()
    expect(openTargetOf(k.boxes(k.context)[0] as NodeView)).toBe(k.child)
    expect(openTargetOf(k.boxes(k.child)[0] as NodeView)).toBeNull()
    expect(childTarget(null)).toBeNull()
  })

  it('walks parent links through deeper levels', () => {
    const k = exampleKit()
    const grandchild = instantiate('IDEF0Diagram')
    Object.assign(grandchild, { _id: 'a2diagram', name: 'Check Credit and Stock', _parent: k.example.a2 })
    k.example.a2['childDiagram'] = grandchild
    expect(parentTarget(grandchild)!.diagram).toBe(k.child)
    expect(parentTarget(grandchild)!.view?.model).toBe(k.example.a2)
  })

  it('resolves a call arrow to the diagram showing the called box', () => {
    const k = exampleKit()
    const call = instantiate('IDEF0Arrow')
    Object.assign(call, { _id: 'call', role: 'call', source: k.example.a1, _parent: k.top })
    expect(callTarget(call)).toBeNull()
    k.example.a1['calledFunction'] = k.example.a3
    const t = callTarget(call)!
    expect(t.diagram).toBe(k.child)
    expect(t.view?.model).toBe(k.example.a3)
    k.example.a1['calledFunction'] = k.top
    expect(callTarget(call)!.diagram).toBe(k.context)
    expect(callTarget(k.top['arrows'] ? ((k.top['arrows'] as Elem[])[0] as Elem) : call)).toBeNull()
  })
})
