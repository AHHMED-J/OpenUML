import { describe, expect, it } from 'vitest'
import { createElement, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { applyQuickEdit, renameElements } from '../editor/quickEditApply'
import { decomposeFunction } from './decompose'
import { createIdef0Edge } from './gestures'
import { linkedArrows } from './propagation'
import { exampleKit } from './testkit'

const named = (scope: Elem, name: string): Elem => {
  const found = (scope['arrows'] as Elem[]).find((a) => a['name'] === name)
  if (!found) throw new Error(`no arrow ${name}`)
  return found
}
const rename = (k: ReturnType<typeof exampleKit>, arrow: Elem, text: string): boolean => applyQuickEdit(k.engine, { kind: 'name', elementId: arrow._id }, text)

describe('linked arrow names', () => {
  it('renames the parent counterpart when a boundary arrow is renamed inline, in one undo step', () => {
    const k = exampleKit()
    const child = named(k.top, 'Customer Order')
    const parent = named(k.model, 'Customer Order')
    const depth = k.engine.undoDepth
    expect(rename(k, child, 'Purchase Order')).toBe(true)
    expect(parent['name']).toBe('Purchase Order')
    expect(k.engine.undoDepth).toBe(depth + 1)
    k.engine.undo()
    expect([child['name'], parent['name']]).toEqual(['Customer Order', 'Customer Order'])
  })

  it('renames the child boundary arrows when the parent arrow is renamed', () => {
    const k = exampleKit()
    expect(rename(k, named(k.model, 'Order Staff'), 'Sales Clerks')).toBe(true)
    expect(named(k.top, 'Sales Clerks')['role']).toBe('mechanism')
  })

  it('follows a box-to-box arrow into both decomposed boxes, from the Model Explorer or Property Editor too', () => {
    const k = exampleKit()
    decomposeFunction(k.engine, k.example.a1, 3)
    decomposeFunction(k.engine, k.example.a2, 3)
    const onA2 = named(k.example.a2, 'Validated Order')
    const onA1 = named(k.example.a1, 'Validated Order')
    const onA0 = named(k.top, 'Validated Order')
    expect(linkedArrows(onA2).sort((a, b) => a._id.localeCompare(b._id))).toEqual([onA0, onA1].sort((a, b) => a._id.localeCompare(b._id)))
    renameElements(k.engine, [onA2], 'Checked Order')
    expect([onA0['name'], onA1['name']]).toEqual(['Checked Order', 'Checked Order'])
    // A box renamed outside the canvas also renames the diagram that details it.
    renameElements(k.engine, [k.example.a1], 'Take Order')
    expect((k.example.a1['childDiagram'] as Elem)['name']).toBe('Take Order')
  })

  it('names the counterparts of a newly drawn boundary arrow when its label is typed', () => {
    const k = exampleKit()
    const child = decomposeFunction(k.engine, k.example.a3, 3)
    const box = k.boxes(child as Diagram)[0] as NodeView
    const id = createIdef0Edge(k.envOf(child as Diagram), k.layoutOf(child as Diagram), { kind: 'IDEF0Arrow' }, null, box._id, { x: 60, y: 600 }, { x: box.left + 3, y: box.top + 40 })
    const arrow = (k.repository.get(id as string) as View).model as Elem
    expect(rename(k, arrow, 'Packing List')).toBe(true)
    const onA0 = (arrow['source'] as Elem)['corresponds'] as Elem
    const onContext = (onA0['source'] as Elem)['corresponds'] as Elem
    expect([onA0['name'], onContext['name']]).toEqual(['Packing List', 'Packing List'])
  })

  it('does not rename through a port that carries several arrows', () => {
    const k = exampleKit()
    const out = named(k.top, 'Shipped Order')
    const join = createElement('IDEF0Arrow', { name: 'Shipped Order', role: 'output', source: k.example.a2, target: out['target'], _parent: k.top })
    k.engine.transact('Join', (b) => b.insert(k.top, 'arrows', join))
    expect(rename(k, out, 'Delivered Order')).toBe(true)
    expect(named(k.model, 'Shipped Order')).toBeDefined()
    expect(join['name']).toBe('Shipped Order')
  })
})
