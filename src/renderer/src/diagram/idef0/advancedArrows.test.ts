import { describe, expect, it } from 'vitest'
import { writeMdj } from '../../format'
import { functionViewsOf, type Elem, type View } from '../../model'
import { arrowMatrix, hasParentArrows, toggledBoxes } from './advancedArrows'
import { assignParentArrow } from './assignment'
import { addBoundaryArrow } from './decompose'
import { newKit } from './testkit'

type Role = 'input' | 'control' | 'output' | 'mechanism'

/**
 * A model like a file drawn before parent arrows waited to be assigned: the A-0 box has two arrows
 * of each role (one unnamed) and every one of them reaches only A2 on the A0 diagram.
 */
function allOnOneBox() {
  const k = newKit()
  const top = functionViewsOf(k.context)[0] as View
  const names: Record<Role, [string, string]> = { input: ['Order', ''], control: ['Policy', 'Budget'], output: ['Invoice', 'Report'], mechanism: ['Clerk', 'ERP'] }
  // Added in mixed role order: the matrix still lists I, C, O, M.
  for (const role of ['mechanism', 'output', 'input', 'control'] as Role[]) {
    for (const name of names[role]) {
      const id = addBoundaryArrow(k.envOf(k.context), top, role) as string
      if (name) k.engine.transact('Name', (b) => b.set((k.repository.get(id) as View).model as Elem, 'name', name))
    }
  }
  const box = (n: number): Elem => k.boxes(k.child)[n - 1]!.model as Elem
  const ports = (): Elem[] => k.top['ports'] as Elem[]
  for (const port of ports()) assignParentArrow(k.envOf(k.child), port, [box(2)])
  const row = (code: string) => arrowMatrix(k.child)!.rows.find((r) => r.code === code)!
  return { ...k, box, row }
}

describe('the Advanced Arrows matrix', () => {
  it('lists the parent arrows by role and code against the boxes, all under A2 for an old file', () => {
    const k = allOnOneBox()
    const matrix = arrowMatrix(k.child)!
    expect(matrix.boxes.map((b) => b.number)).toEqual(['A1', 'A2', 'A3'])
    expect(matrix.rows.map((r) => r.code)).toEqual(['I1', 'I2', 'C1', 'C2', 'O1', 'O2', 'M1', 'M2'])
    expect(matrix.rows.every((r) => r.checked.join() === 'false,true,false' && r.result === '1 box' && r.readOnly === null)).toBe(true)
    const unnamed = matrix.rows.filter((r) => r.unnamed)
    expect(unnamed.map((r) => [r.code, r.name])).toEqual([['I2', '(unnamed)']])
  })

  it('is only offered on a diagram that details a box', () => {
    const k = newKit()
    expect(hasParentArrows(k.child)).toBe(true)
    expect(hasParentArrows(k.context)).toBe(false)
    expect(hasParentArrows(null)).toBe(false)
    expect(arrowMatrix(k.context)).toBeNull()
  })

  it('applies each toggled cell at once, one undo step each: forks, joins and back to pending', () => {
    const k = allOnOneBox()
    const env = k.envOf(k.child)
    const toggle = (code: string, n: number): void => {
      const row = k.row(code)
      assignParentArrow(env, row.port, toggledBoxes(k.child, row.port, k.box(n)))
    }
    const before = writeMdj(k.repository.project as Elem)
    const depth = k.engine.undoDepth
    toggle('C1', 1)
    expect(k.row('C1')).toMatchObject({ checked: [true, true, false], result: 'fork to 2' })
    toggle('O1', 3)
    expect(k.row('O1')).toMatchObject({ checked: [false, true, true], result: 'join from 2' })
    toggle('I1', 2)
    expect(k.row('I1')).toMatchObject({ checked: [false, false, false], result: 'not assigned' })
    expect(k.engine.undoDepth).toBe(depth + 3)
    // Box order does not depend on the click order.
    toggle('M1', 3)
    toggle('M1', 1)
    expect(toggledBoxes(k.child, k.row('M1').port, k.box(2)).map((b) => b['boxNumber'])).toEqual([1, 3])
    for (let i = 0; i < 5; i++) k.engine.undo()
    expect(writeMdj(k.repository.project as Elem)).toBe(before)
  })

  it('shows a tunneled tree as read-only', () => {
    const k = allOnOneBox()
    const arrow = (k.top['arrows'] as Elem[]).find((a) => a['source'] === k.row('M1').port) as Elem
    k.engine.transact('Tunnel', (b) => b.set(arrow, 'tunnelSource', true))
    expect(k.row('M1').readOnly).toMatch(/tunneled/i)
  })
})
