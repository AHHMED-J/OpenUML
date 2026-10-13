import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../../format'
import type { Elem } from '../../model'
import { addChildBoxes, childBoxes, removeChildBoxes } from './boxCount'
import { decomposeFunction } from './decompose'
import { createIdef0Edge } from './gestures'
import { exampleKit, newKit, type IdefKit } from './testkit'
import { validateIdef0 } from './validate'

const names = (k: IdefKit): string[] => childBoxes(k.child).map((c) => `A${c.fn['boxNumber']} ${c.fn['name']}`)
const serialized = (k: IdefKit): string => writeMdj(k.repository.project as Elem)
const ids = (list: Elem[]): string[] => list.map((e) => e._id)

/** Example with 5 boxes: the three named boxes plus two new ones, chained by arrows A3 -> A4 -> A5 and A5 -> boundary output. */
function fiveBoxKit(): IdefKit {
  const k = exampleKit()
  addChildBoxes(k.envOf(k.child), 2)
  const boxes = childBoxes(k.child)
  const env = k.envOf(k.child)
  const connect = (from: number, to: number): void => {
    const layout = k.layoutOf(k.child)
    const a = boxes[from]!.view
    const b = boxes[to]!.view
    const left = { x: b.left + 2, y: b.top + b.height / 2 }
    createIdef0Edge(env, layout, { kind: 'IDEF0Arrow' } as never, a._id, b._id, { x: a.left + a.width, y: a.top + a.height / 2 }, left)
  }
  connect(2, 3)
  connect(3, 4)
  return k
}

describe('Set Number of Child Boxes: more boxes', () => {
  it('appends numbered boxes on the staircase in one undo step and keeps the model valid', () => {
    const k = exampleKit()
    const before = serialized(k)
    const depth = k.engine.undoDepth
    const added = addChildBoxes(k.envOf(k.child), 2)
    expect(added.map((f) => f['boxNumber'])).toEqual([4, 5])
    expect(names(k)).toEqual(['A1 Receive Order', 'A2 Check Credit and Stock', 'A3 Ship and Invoice', 'A4 New Function 1', 'A5 New Function 2'])
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect((k.top['functions'] as Elem[]).length).toBe(5)
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    expect(validateIdef0(k.model).filter((i) => i.id === 'W01')).toEqual([])
    // Existing arrows survive (no new arrows are added).
    expect((k.top['arrows'] as Elem[]).length).toBe(8)
    k.engine.undo()
    expect(serialized(k)).toBe(before)
    k.engine.redo()
    expect(names(k)).toHaveLength(5)
  })

  it('relayouts an untouched staircase and appends after a hand-arranged one', () => {
    const k = newKit()
    addChildBoxes(k.envOf(k.child), 2)
    const small = k.boxes(k.child)
    expect(small.map((v) => v.width)).toEqual([144, 144, 144, 144, 144])
    expect(new Set(small.map((v) => v.left)).size).toBe(5)
    const hand = newKit()
    const [first] = hand.boxes(hand.child)
    hand.engine.transact('move', (b) => b.setAll(first!, { left: first!.left + 8 }))
    addChildBoxes(hand.envOf(hand.child), 1)
    const views = hand.boxes(hand.child)
    expect(views.map((v) => v.width)).toEqual([168, 168, 168, 168])
    expect(views[3]!.left).toBeGreaterThan(views[2]!.left)
  })

  it('stops at six boxes and ignores a zero count', () => {
    const k = newKit()
    expect(addChildBoxes(k.envOf(k.child), 0)).toEqual([])
    expect(addChildBoxes(k.envOf(k.child), 9)).toHaveLength(3)
    expect(names(k)).toHaveLength(6)
    expect(addChildBoxes(k.envOf(k.child), 1)).toEqual([])
  })
})

describe('Set Number of Child Boxes: fewer boxes (user-chosen)', () => {
  it('removes A2 and A4 of five boxes, renumbers contiguously and keeps arrows consistent', () => {
    const k = fiveBoxKit()
    const [a1, a2, a3, a4, a5] = childBoxes(k.child)
    // A3 -> A4 -> A5 chain exists.
    expect(a4!.arrows).toBe(2)
    expect(a2!.arrows).toBe(3) // validated in, approved out, control branch
    const before = serialized(k)
    const depth = k.engine.undoDepth
    const removed = removeChildBoxes(k.envOf(k.child), [a2!.fn, a4!.fn])
    expect(removed).toBe(2)
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect(names(k)).toEqual([`A1 ${a1!.fn['name']}`, `A2 ${a3!.fn['name']}`, `A3 ${a5!.fn['name']}`])
    expect(ids(k.top['functions'] as Elem[]).sort()).toEqual(ids([a1!.fn, a3!.fn, a5!.fn]).sort())
    expect(k.repository.get(a2!.fn._id)).toBeUndefined()
    // No dangling ends: the project validates and IDEF0 consistency holds.
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    expect(validateIdef0(k.model).filter((i) => ['W08', 'W09', 'W11'].includes(i.id))).toEqual([])
    // Staircase positions follow the new count (3 boxes use the large boxes).
    expect(k.boxes(k.child).map((v) => v.width)).toEqual([168, 168, 168])
    // The model survives a file round trip.
    const text = serialized(k)
    expect(writeMdj(readMdj(text).project)).toBe(text)
    k.engine.undo()
    expect(serialized(k)).toBe(before)
    k.engine.redo()
    expect(names(k)).toHaveLength(3)
  })

  it('turns arrows that also touch a kept box into boundary arrows of the decomposition', () => {
    const k = exampleKit()
    const [, a2] = childBoxes(k.child)
    removeChildBoxes(k.envOf(k.child), [a2!.fn])
    const arrows = k.top['arrows'] as Elem[]
    const validated = arrows.find((a) => a['name'] === 'Validated Order')!
    const approved = arrows.find((a) => a['name'] === 'Approved Order')!
    expect(validated['target']).not.toBeNull()
    expect((validated['target'] as Elem)._type).toBe('IDEF0Port')
    expect((approved['source'] as Elem)._type).toBe('IDEF0Port')
    // Control branch to the removed box is gone; the other two remain connected.
    expect(arrows.filter((a) => a['role'] === 'control')).toHaveLength(2)
    expect(names(k)).toEqual(['A1 Receive Order', 'A2 Ship and Invoice'])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('removes a decomposed box together with its child diagram, recursively, and undoes in one step', () => {
    const k = exampleKit()
    const grand = decomposeFunction(k.engine, k.example.a2, 3)
    const great = decomposeFunction(k.engine, (grand['ownedViews'] as Elem[]).map((v) => v['model'] as Elem | null).find((m) => m && m._type === 'IDEF0Function')!, 2)
    const before = serialized(k)
    const info = childBoxes(k.child)
    expect(info.map((c) => c.decomposed)).toEqual([false, true, false])
    const depth = k.engine.undoDepth
    removeChildBoxes(k.envOf(k.child), [info[1]!.fn])
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect(k.repository.get(grand._id)).toBeUndefined()
    expect(k.repository.get(great._id)).toBeUndefined()
    expect(k.repository.diagrams().map((d) => d._id)).not.toContain(grand._id)
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    k.engine.undo()
    expect(serialized(k)).toBe(before)
    expect(k.repository.get(great._id)).toBeDefined()
  })

  it('keeps boundary arrows of other levels consistent (ICOM codes follow the parent)', () => {
    const k = exampleKit()
    const [, a2] = childBoxes(k.child)
    removeChildBoxes(k.envOf(k.child), [a2!.fn])
    expect(validateIdef0(k.model).filter((i) => ['W08', 'W09', 'W11'].includes(i.id))).toEqual([])
    // The arrows that lost their box surface on A-0 as boundary arrows of the decomposed box, with ICOM codes.
    const top = k.context.ownedViews.filter((v) => v._type === 'IDEF0ArrowView').map((v) => (v.model as Elem)['name'])
    expect(top).toContain('Validated Order')
    expect(top).toContain('Approved Order')
    const codes = [...k.layoutOf(k.child).nodes.values()].filter((n) => n.viewType === 'IDEF0PortView').map((n) => (n.data as { codeLine: { text: string } | null }).codeLine?.text)
    expect(codes.every((c) => /^[ICOM]\d+$/.test(c ?? ''))).toBe(true)
  })

  it('refuses to remove every box and ignores unknown functions', () => {
    const k = exampleKit()
    const all = childBoxes(k.child).map((c) => c.fn)
    expect(() => removeChildBoxes(k.envOf(k.child), all)).toThrow()
    expect(removeChildBoxes(k.envOf(k.child), [k.top])).toBe(0)
    expect(names(k)).toHaveLength(3)
  })

  it('renumbers even when auto numbering is off', () => {
    const k = fiveBoxKit()
    k.engine.transact('off', (b) => b.set(k.child, 'autoNumber', false))
    const boxes = childBoxes(k.child)
    removeChildBoxes(k.envOf(k.child), [boxes[0]!.fn, boxes[1]!.fn])
    expect(childBoxes(k.child).map((c) => c.fn['boxNumber'])).toEqual([1, 2, 3])
  })

  it('describes what removal would lose', () => {
    const k = exampleKit()
    decomposeFunction(k.engine, k.example.a3, 2)
    const info = childBoxes(k.child)
    expect(info.map((c) => [c.arrows, c.decomposed])).toEqual([
      [4, false],
      [3, false],
      [3, true]
    ])
  })

  it('rejects the A-0 context diagram', () => {
    const k = exampleKit()
    expect(() => childBoxes(k.context)).toThrow()
  })
})
