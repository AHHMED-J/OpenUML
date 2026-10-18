import { describe, expect, it } from 'vitest'
import { createDiagram } from '../../commands'
import { readMdj, validateModel, writeMdj } from '../../format'
import { idef0DiagramLabel, type Diagram, type Elem, type NodeView } from '../../model'
import { createNodeAt, moveSelection } from '../editor/actions'
import { renameElements } from '../editor/quickEditApply'
import { addChildBoxes } from './boxCount'
import { decomposeFunction } from './decompose'
import { newKit, type IdefKit } from './testkit'
import { validateIdef0 } from './validate'

const name = (el: Elem | null | undefined): string => (el?.['name'] as string) ?? ''
const label = (d: Elem): string => idef0DiagramLabel(d, name(d))
const boxNames = (k: IdefKit, d: Elem): string[] => k.boxes(d as Diagram).map((v) => name(v.model as Elem))
const allFunctionNames = (k: IdefKit): string[] => {
  const out: string[] = []
  const queue: Elem[] = [k.top]
  while (queue.length > 0) {
    const fn = queue.shift() as Elem
    out.push(name(fn))
    queue.push(...((fn['functions'] as Elem[]) ?? []))
  }
  return out
}
const naming = (k: IdefKit): string[] => validateIdef0(k.model).filter((i) => i.id === 'W11' || i.id === 'W13').map((i) => i.message)

describe('IDEF0 naming flows', () => {
  it('names a new model, its top function and its A-0 diagram', () => {
    const k = newKit()
    expect(name(k.model)).toBe('IDEF0 Model 1')
    expect(name(k.top)).toBe('Top Function')
    expect(label(k.context)).toBe('A-0 Context diagram: Top Function')
    expect(label(k.child)).toBe('A0 Diagram: Top Function')
    const second = createDiagram(k.engine, 'IDEF0Diagram', k.repository.project as Elem)
    expect(name(second.model as Elem)).toBe('IDEF0 Model 2')
  })

  it('gives every new box a default name no other box of the model has (decompose, add box, set box count)', () => {
    const k = newKit()
    expect(boxNames(k, k.child)).toEqual(['New Function 1', 'New Function 2', 'New Function 3'])
    // Decomposing A2: its boxes do not repeat A1..A3 (nor A2 itself).
    const a2 = k.boxes(k.child)[1]!.model as Elem
    const a2Diagram = decomposeFunction(k.engine, a2, 3)
    expect(label(a2Diagram)).toBe('A2 Diagram: New Function 2')
    expect(boxNames(k, a2Diagram)).toEqual(['New Function 4', 'New Function 5', 'New Function 6'])
    // A box added from the palette on A0 and on A2.
    createNodeAt(k.envOf(k.child), k.layoutOf(k.child), 'IDEF0Function', { left: 900, top: 520, width: 0, height: 0 })
    createNodeAt(k.envOf(a2Diagram), k.layoutOf(a2Diagram), 'IDEF0Function', { left: 900, top: 520, width: 0, height: 0 })
    // Set Number of Child Boxes on A0.
    addChildBoxes(k.envOf(k.child), 1)
    const names = allFunctionNames(k)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(expect.arrayContaining(['New Function 7', 'New Function 8', 'New Function 9']))
    // The first free number is reused once a name is freed.
    renameElements(k.engine, [k.boxes(k.child)[0]!.model as Elem], 'Plan Release')
    const a3 = k.boxes(k.child)[2]!.model as Elem
    const a3Diagram = decomposeFunction(k.engine, a3, 3)
    expect(boxNames(k, a3Diagram)).toEqual(['New Function 1', 'New Function 10', 'New Function 11'])
    expect(naming(k)).toEqual([])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('renaming a box renames the diagram detailing it; renaming the top function also renames A-0 (one undo step)', () => {
    const k = newKit()
    const a2 = k.boxes(k.child)[1]!.model as Elem
    const a2Diagram = decomposeFunction(k.engine, a2, 3)
    renameElements(k.engine, [a2], 'Check Stock')
    expect(label(a2Diagram)).toBe('A2 Diagram: Check Stock')
    renameElements(k.engine, [k.top], 'Process Order')
    expect(label(k.context)).toBe('A-0 Context diagram: Process Order')
    expect(label(k.child)).toBe('A0 Diagram: Process Order')
    k.engine.undo()
    expect([name(k.top), name(k.context), name(k.child)]).toEqual(['Top Function', 'Top Function', 'Top Function'])
    expect(naming(k)).toEqual([])
  })

  it('renaming a diagram renames its box, so the name sticks after the next edit (one undo step)', () => {
    const k = newKit()
    // A-0 from the Model Explorer or Properties: the top function and A0 follow.
    renameElements(k.engine, [k.context], 'Release Software')
    expect([name(k.top), name(k.context), name(k.child)]).toEqual(['Release Software', 'Release Software', 'Release Software'])
    // A decomposition diagram: its box follows.
    const a2 = k.boxes(k.child)[1]!.model as Elem
    const a2Diagram = decomposeFunction(k.engine, a2, 3)
    renameElements(k.engine, [a2Diagram], 'Build Package')
    expect(name(a2)).toBe('Build Package')
    expect(label(a2Diagram)).toBe('A2 Diagram: Build Package')
    // An edit on the sheet no longer reverts the name.
    const box = k.boxes(a2Diagram)[0] as NodeView
    moveSelection(k.envOf(a2Diagram), [box._id], 16, 0)
    moveSelection(k.envOf(k.context), [k.boxes(k.context)[0]!._id], 16, 0)
    expect([name(a2), name(a2Diagram), name(k.top), name(k.context)]).toEqual(['Build Package', 'Build Package', 'Release Software', 'Release Software'])
    // One undo step brings the box and the diagram back together.
    for (let i = 0; i < 3 && name(a2) === 'Build Package'; i++) k.engine.undo()
    expect(name(a2)).toBe('New Function 2')
    expect(name(a2Diagram)).toBe('New Function 2')
    expect(naming(k)).toEqual([])
  })

  it('keeps the names of a file through write and read', () => {
    const k = newKit()
    decomposeFunction(k.engine, k.boxes(k.child)[1]!.model as Elem, 3)
    renameElements(k.engine, [k.top], 'Process Order')
    const text = writeMdj(k.repository.project as Elem)
    const back = readMdj(text)
    expect(writeMdj(back.project)).toBe(text)
  })
})
