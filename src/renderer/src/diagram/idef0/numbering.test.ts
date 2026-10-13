import { describe, expect, it } from 'vitest'
import { readMdj, writeMdj } from '../../format'
import { diagramNodeNumber, icomCodes, nextFreeBoxNumber, nodeNumber, planBoxNumberSwap, planCloseGaps, type Diagram, type Elem } from '../../model'
import { deleteViews } from '../editor/actions'
import { childBoxes, removeChildBoxes, addChildBoxes } from './boxCount'
import { decomposeFunction, setBoxNumber } from './decompose'
import { exampleKit } from './testkit'
import { validateIdef0 } from './validate'

const serialized = (root: Elem): string => writeMdj(root)
const number = (fn: Elem): number => fn['boxNumber'] as number

describe('box number helpers', () => {
  it('gives a new box the smallest free number', () => {
    const fns = [1, 2, 4].map((n) => ({ boxNumber: n }) as unknown as Elem)
    expect(nextFreeBoxNumber(fns)).toBe(3)
    expect(nextFreeBoxNumber([])).toBe(1)
    expect(nextFreeBoxNumber([1, 2, 3].map((n) => ({ boxNumber: n }) as unknown as Elem))).toBe(4)
  })

  it('closes gaps keeping the relative order', () => {
    const fns = [5, 2, 7].map((n) => ({ boxNumber: n }) as unknown as Elem)
    expect(planCloseGaps(fns).map((c) => [c.fn, c.boxNumber])).toEqual([
      [fns[1], 1],
      [fns[0], 2],
      [fns[2], 3]
    ])
  })

  it('plans a swap with the box holding the number and refuses numbers out of range', () => {
    const k = exampleKit()
    const { a1, a2, a3 } = k.example
    expect(planBoxNumberSwap(a1, 3)).toEqual([
      { fn: a1, boxNumber: 3 },
      { fn: a3, boxNumber: 1 }
    ])
    expect(planBoxNumberSwap(a2, 2)).toEqual([])
    expect(() => planBoxNumberSwap(a1, 4)).toThrow(/1 to 3/)
    expect(() => planBoxNumberSwap(a1, 0)).toThrow(/1 to 3/)
    expect(() => planBoxNumberSwap(a1, 1.5)).toThrow()
    expect(() => planBoxNumberSwap(k.top, 1)).toThrow(/A-0/)
  })
})

describe('Properties > Box Number', () => {
  it('swaps A3 and A1 in one undo step and every derived number follows (A31 -> A11)', () => {
    const k = exampleKit()
    const { a1, a3 } = k.example
    const child = decomposeFunction(k.engine, a3, 2)
    const grandChildren = a3['functions'] as Elem[]
    expect(grandChildren.map(nodeNumber)).toEqual(['A31', 'A32'])
    const codesBefore = [...icomCodes(child).values()]
    const before = serialized(k.repository.project as Elem)
    const depth = k.engine.undoDepth

    expect(setBoxNumber(k.engine, a3, 1)).toBe(2)
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect([number(a3), number(a1)]).toEqual([1, 3])
    expect(nodeNumber(a3)).toBe('A1')
    expect(nodeNumber(a1)).toBe('A3')
    expect(grandChildren.map(nodeNumber)).toEqual(['A11', 'A12'])
    expect(diagramNodeNumber(child as Diagram)).toBe('A1')
    // ICOM codes are positions along the parent box sides: unchanged by the swap.
    expect([...icomCodes(child).values()]).toEqual(codesBefore)
    // No duplicate or gap: W10 stays quiet.
    expect(validateIdef0(k.model).filter((i) => i.id === 'W10')).toEqual([])

    k.engine.undo()
    expect(serialized(k.repository.project as Elem)).toBe(before)
    k.engine.redo()
    expect(nodeNumber(a3)).toBe('A1')
  })

  it('round-trips swapped numbers through .mdj', () => {
    const k = exampleKit()
    setBoxNumber(k.engine, k.example.a2, 3)
    const text = serialized(k.repository.project as Elem)
    const { repository } = readMdj(text)
    expect((repository.get(k.example.a2._id) as Elem)['boxNumber']).toBe(3)
    expect((repository.get(k.example.a3._id) as Elem)['boxNumber']).toBe(2)
    expect(serialized(repository.project as Elem)).toBe(text)
  })

  it('does nothing for the current number', () => {
    const k = exampleKit()
    const depth = k.engine.undoDepth
    expect(setBoxNumber(k.engine, k.example.a2, 2)).toBe(0)
    expect(k.engine.undoDepth).toBe(depth)
  })
})

describe('removing boxes closes gaps without reordering', () => {
  it('keeps the user numbering order when a box is deleted', () => {
    const k = exampleKit()
    const { a1, a2, a3 } = k.example
    // User numbering that disagrees with the staircase: A1 <-> A3.
    setBoxNumber(k.engine, a1, 3)
    const before = serialized(k.repository.project as Elem)
    const view = k.repository.viewsOf(a2).find((v) => v._type === 'IDEF0FunctionView')!
    deleteViews(k.envOf(k.child), [view._id])
    expect([number(a3), number(a1)]).toEqual([1, 2])
    k.engine.undo()
    expect(serialized(k.repository.project as Elem)).toBe(before)
  })

  it('Set Number of Child Boxes closes gaps in the existing order', () => {
    const k = exampleKit()
    addChildBoxes(k.envOf(k.child), 1)
    const fourth = childBoxes(k.child)[3]!.fn
    setBoxNumber(k.engine, fourth, 1)
    const before = serialized(k.repository.project as Elem)
    const depth = k.engine.undoDepth
    removeChildBoxes(k.envOf(k.child), [k.example.a2])
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect([number(fourth), number(k.example.a3), number(k.example.a1)]).toEqual([1, 2, 3])
    k.engine.undo()
    expect(serialized(k.repository.project as Elem)).toBe(before)
  })
})
