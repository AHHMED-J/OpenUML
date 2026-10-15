import { describe, expect, it } from 'vitest'
import { projectStore } from '../../store'
import { createDiagram, setFieldsOfAll } from '../../commands'
import { writeMdj } from '../../format'
import type { Diagram, Elem } from '../../model'
import { addDiagram } from '../../ui/modelActions'
import { applyQuickEdit } from '../editor/quickEditApply'
import { decomposeFunction } from './decompose'
import { applyTitleBlockToChildren } from './titleBlock'
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

/** A-0 > A0 > (A1 > A11, A2 > A21), A-0 titled Ana / 2026-10-14 / draft / 1 before decomposing. */
function tree() {
  const kit = newKit()
  const { engine, context, child: a0 } = kit
  // A0 already exists (blank): the A-0 edit reaches it through propagation.
  setFieldsOfAll(engine, [context], { author: 'Ana', date: '2026-10-14', status: 'draft', number: '1' })
  const a1 = decomposeFunction(engine, boxOf(a0, 1), 3)
  const a2 = decomposeFunction(engine, boxOf(a0, 2), 3)
  const a11 = decomposeFunction(engine, boxOf(a1, 1), 3)
  const a21 = decomposeFunction(engine, boxOf(a2, 1), 3)
  return { ...kit, a0, a1, a2, a11, a21 }
}

const snapshot = (kit: { repository: { project: unknown } }): string => writeMdj(kit.repository.project as Elem, { verbose: true })

describe('IDEF0 title block propagation', () => {
  it('an A-0 edit reaches the existing blank descendants; sheet numbers stay per sheet', () => {
    const t = tree()
    for (const d of [t.a0, t.a1, t.a2, t.a11, t.a21]) expect(d['author']).toBe('Ana')
    expect(t.a0['date']).toBe('2026-10-14')
    expect(t.a0['status']).toBe('draft')
    // A0 existed before the A-0 got its number: numbers never propagate.
    expect(t.a0['number']).toBe('')
    setFieldsOfAll(t.engine, [t.context], { number: '7' })
    expect([t.a0, t.a1, t.a11].map((d) => d['number'])).toEqual(['', '', ''])
  })

  it('an inline title-block edit updates the descendants that followed, keeps hand edits, in one undo step', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.a2], { author: 'Bob' })
    expect(t.a21['author']).toBe('Bob')
    setFieldsOfAll(t.engine, [t.a11], { author: '' })
    const before = snapshot(t)
    const depth = t.engine.undoDepth
    expect(applyQuickEdit(t.engine, { kind: 'field', elementId: t.context._id, field: 'author' }, 'Ana López')).toBe(true)
    expect(t.engine.undoDepth).toBe(depth + 1)
    expect([t.context, t.a0, t.a1, t.a11].map((d) => d['author'])).toEqual(['Ana López', 'Ana López', 'Ana López', 'Ana López'])
    // A2 was changed by hand: it and the sheets that follow it keep their author.
    expect([t.a2['author'], t.a21['author']]).toEqual(['Bob', 'Bob'])
    t.engine.undo()
    expect(snapshot(t)).toBe(before)
    t.engine.redo()
    expect(t.a1['author']).toBe('Ana López')
  })

  it('date and status edits from the Property Editor path flow down the same way', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.a1], { date: '2026-01-01', status: 'recommended' })
    setFieldsOfAll(t.engine, [t.context], { date: '2026-10-15', status: 'publication' }, 'Change Date')
    expect([t.a0, t.a2, t.a21].map((d) => [d['date'], d['status']])).toEqual([
      ['2026-10-15', 'publication'],
      ['2026-10-15', 'publication'],
      ['2026-10-15', 'publication']
    ])
    // A1 (and A11 below it, which followed A1) keep their own values.
    expect([t.a1, t.a11].map((d) => [d['date'], d['status']])).toEqual([
      ['2026-01-01', 'recommended'],
      ['2026-01-01', 'recommended']
    ])
  })

  it('never flows upward', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.a1], { author: 'Carla', date: '2027-01-01', status: 'working' })
    expect([t.context, t.a0, t.a2].map((d) => [d['author'], d['date'], d['status']])).toEqual([
      ['Ana', '2026-10-14', 'draft'],
      ['Ana', '2026-10-14', 'draft'],
      ['Ana', '2026-10-14', 'draft']
    ])
    expect([t.a11['author'], t.a11['date'], t.a11['status']]).toEqual(['Carla', '2027-01-01', 'working'])
  })

  it('a descendant edited in the same operation keeps its own value', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.context, t.a2], { author: 'Dora' })
    setFieldsOfAll(t.engine, [t.a2], { author: 'Eve' })
    t.engine.transact('Both', (b) => {
      b.set(t.context, 'author', 'Fay')
      b.set(t.a2, 'author', 'Gus')
    })
    expect([t.a0, t.a1, t.a2, t.a21].map((d) => d['author'])).toEqual(['Fay', 'Fay', 'Gus', 'Gus'])
  })
})

describe('Apply Title Block to Child Diagrams', () => {
  it('copies author, date and status to every descendant, overriding hand edits, in one undo step', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.a2], { author: 'Bob', status: 'working' })
    setFieldsOfAll(t.engine, [t.a11], { date: '' })
    setFieldsOfAll(t.engine, [t.a1], { number: '4' })
    const before = snapshot(t)
    const depth = t.engine.undoDepth
    expect(applyTitleBlockToChildren(t.engine, t.context)).toBe(3)
    expect(t.engine.undoDepth).toBe(depth + 1)
    for (const d of [t.a0, t.a1, t.a2, t.a11, t.a21]) expect([d['author'], d['date'], d['status']]).toEqual(['Ana', '2026-10-14', 'draft'])
    expect(t.a1['number']).toBe('4')
    expect(applyTitleBlockToChildren(t.engine, t.context)).toBe(0)
    t.engine.undo()
    expect(snapshot(t)).toBe(before)
  })

  it('reaches only the descendants of the diagram it runs on', () => {
    const t = tree()
    setFieldsOfAll(t.engine, [t.a0], { author: 'Bob' })
    t.engine.transact('Hand edits', (b) => {
      b.set(t.a11, 'author', 'Zed')
      b.set(t.a21, 'author', 'Zed')
      b.set(t.context, 'author', 'Ana')
    })
    expect(applyTitleBlockToChildren(t.engine, t.a1)).toBe(1)
    expect([t.context, t.a0, t.a1, t.a11, t.a2, t.a21].map((d) => d['author'])).toEqual(['Ana', 'Bob', 'Bob', 'Bob', 'Bob', 'Zed'])
  })
})
