import { describe, expect, it } from 'vitest'
import { projectStore } from '../../store'
import { createDiagram, setFieldsOfAll } from '../../commands'
import { writeMdj } from '../../format'
import type { Diagram, Elem } from '../../model'
import { addDiagram } from '../../ui/modelActions'
import { decomposeFunction } from './decompose'
import { newKit } from './testkit'

const titleOf = (d: Elem) => ({ author: d['author'], date: d['date'], status: d['status'], number: d['number'] })
const boxOf = (d: Diagram, n: number): Elem => ((d._parent as Elem)['functions'] as Elem[]).find((f) => f['boxNumber'] === n) as Elem

describe('IDEF0 title block inheritance', () => {
  it('Decompose copies author, date and status from the parent diagram and takes the next sheet number', () => {
    const kit = newKit()
    // newKit decomposed the top function before any title block was set: A0 starts blank.
    expect(titleOf(kit.child)).toEqual({ author: '', date: '', status: 'working', number: '' })
    setFieldsOfAll(kit.engine, [kit.child], { author: 'Ana', date: '2026-10-14', status: 'draft', number: 'JD-001' })
    const a2 = decomposeFunction(kit.engine, boxOf(kit.child, 2), 3)
    expect(titleOf(a2)).toEqual({ author: 'Ana', date: '2026-10-14', status: 'draft', number: 'JD-002' })
    const a3 = decomposeFunction(kit.engine, boxOf(kit.child, 3), 2)
    expect(titleOf(a3)).toEqual({ author: 'Ana', date: '2026-10-14', status: 'draft', number: 'JD-003' })
    // A grandchild continues from its own parent.
    setFieldsOfAll(kit.engine, [a2], { author: 'Bea' })
    const a21 = decomposeFunction(kit.engine, boxOf(a2, 1), 3)
    expect(titleOf(a21)).toEqual({ author: 'Bea', date: '2026-10-14', status: 'draft', number: 'JD-004' })
  })

  it('the A0 diagram inherits from the A-0 context diagram; empty fields stay empty', () => {
    const kit = newKit()
    const plan = createDiagram(kit.engine, 'IDEF0Diagram', kit.repository.project as Elem)
    const model = plan.model as Elem
    setFieldsOfAll(kit.engine, [plan.diagram], { date: '2026-10-14', number: '1' })
    const a0 = decomposeFunction(kit.engine, model['topFunction'] as Elem, 3)
    expect(titleOf(a0)).toEqual({ author: '', date: '2026-10-14', status: 'working', number: '2' })
    const a2 = decomposeFunction(kit.engine, boxOf(a0 as Diagram, 2), 3)
    expect(a2['number']).toBe('3')
  })

  it('Explorer Add Diagram > IDEF0 Diagram on a function inherits too', () => {
    const kit = newKit()
    setFieldsOfAll(kit.engine, [kit.child], { author: 'Ana', date: '14.10.2026', status: 'recommended', number: '009' })
    const viaExplorer = addDiagram(kit.engine, boxOf(kit.child, 1), 'IDEF0Diagram', 3)
    expect(titleOf(viaExplorer)).toEqual({ author: 'Ana', date: '14.10.2026', status: 'recommended', number: '010' })
    const viaFactory = createDiagram(kit.engine, 'IDEF0Diagram', boxOf(kit.child, 2)).diagram
    expect(titleOf(viaFactory)).toEqual({ author: 'Ana', date: '14.10.2026', status: 'recommended', number: '011' })
  })

  it('leaves the number empty when the parent number has no numeric suffix', () => {
    const kit = newKit()
    setFieldsOfAll(kit.engine, [kit.child], { number: 'A' })
    expect(decomposeFunction(kit.engine, boxOf(kit.child, 1), 3)['number']).toBe('')
  })

  it('opening a file changes nothing and leaves it clean', () => {
    const kit = newKit()
    // A file written before inheritance: the A-0 has a title block, its children are blank.
    Object.assign(kit.context, { author: 'Ana', date: '2026-10-14', number: '1' })
    const text = writeMdj(kit.repository.project as Elem)
    projectStore.getState().openProject(text, null)
    const state = projectStore.getState()
    expect(state.engine.isDirty).toBe(false)
    expect(state.engine.undoDepth).toBe(0)
    expect(writeMdj(state.repository.project as Elem)).toBe(text)
    expect(titleOf(state.repository.get(kit.child._id) as Elem)).toEqual({ author: '', date: '', status: 'working', number: '' })
  })
})
