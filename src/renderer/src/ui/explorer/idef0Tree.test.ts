import { describe, expect, it } from 'vitest'
import { writeMdj } from '../../format'
import { buildOrderExample } from '../../model/idef0-example'
import { createElement, type Elem } from '../../model'
import {
  arrowFolderKeys,
  elementNode,
  expandableIds,
  folderKey,
  hasTreeChildren,
  revealPath,
  treeChildren,
  treeLabel,
  treeTooltip,
  type TreeNode,
  type TreeOptions
} from './tree'

const labels = (nodes: readonly TreeNode[]): string[] => nodes.map((n) => treeLabel(n))
const childrenOf = (el: Elem, options?: TreeOptions): TreeNode[] => treeChildren(elementNode(el), options)
const folder = (el: Elem, role: string): TreeNode => {
  const found = childrenOf(el).find((n) => n.kind === 'folder' && n.role === role)
  if (!found) throw new Error(`no ${role} folder`)
  return found
}

describe('IDEF0 boxes in the Model Explorer', () => {
  it('lists the child diagram, role folders with counts and the child boxes by node number', () => {
    const ex = buildOrderExample()
    expect(labels(childrenOf(ex.model))).toEqual(['A-0 Context diagram: Process Customer Order', 'A0 Process Customer Order'])
    expect(labels(childrenOf(ex.top))).toEqual([
      'A0 Diagram: Process Customer Order',
      'Inputs (1)',
      'Controls (1)',
      'Outputs (1)',
      'Mechanisms (1)',
      'A1 Receive Order',
      'A2 Check Credit and Stock',
      'A3 Ship and Invoice'
    ])
    // A2 has no mechanism and no call: those folders are hidden.
    expect(labels(childrenOf(ex.a2))).toEqual(['Inputs (1)', 'Controls (1)', 'Outputs (1)'])
    expect(labels(treeChildren(folder(ex.a1, 'input')))).toEqual(['Input 1: Customer Order'])
    expect(labels(treeChildren(folder(ex.a2, 'control')))).toEqual(['Control 1'])
  })

  it('orders boxes by node number whatever their model order', () => {
    const ex = buildOrderExample()
    const fns = ex.top['functions'] as Elem[]
    fns.reverse()
    expect(labels(childrenOf(ex.top)).slice(-3)).toEqual(['A1 Receive Order', 'A2 Check Credit and Stock', 'A3 Ship and Invoice'])
    expect(labels(childrenOf(ex.top, { sortBy: 'name' })).slice(-3)).toEqual(['A1 Receive Order', 'A2 Check Credit and Stock', 'A3 Ship and Invoice'])
  })

  it('lists a box-to-box arrow under both boxes with its role at each, as the same element', () => {
    const ex = buildOrderExample()
    const out = treeChildren(folder(ex.a1, 'output'))[0] as TreeNode
    const inp = treeChildren(folder(ex.a2, 'input'))[0] as TreeNode
    expect(treeLabel(out)).toBe('Output 1: Validated Order')
    expect(treeLabel(inp)).toBe('Input 1: Validated Order')
    expect(out.kind === 'arrow' && inp.kind === 'arrow' && out.el === inp.el).toBe(true)
    expect(out.key).not.toBe(inp.key)
    expect(treeTooltip(inp)).toBe('Input 1 of A2 (Validated Order) · from Output 1 of A1')
    expect(treeTooltip(out)).toBe('Output 1 of A1 (Validated Order) · to Input 1 of A2')
  })

  it('describes boundary arrows with their ICOM codes and the code under which a detailed box shows an arrow', () => {
    const ex = buildOrderExample()
    const inA1 = treeChildren(folder(ex.a1, 'input'))[0] as TreeNode
    expect(treeTooltip(inA1)).toBe('Input 1 of A1 (Customer Order) · from boundary I1')
    const onTop = treeChildren(folder(ex.top, 'input'))[0] as TreeNode
    expect(treeTooltip(onTop)).toBe('Input 1 of A0 (Customer Order) · from the boundary · ICOM I1 on A0')
    const branch = treeChildren(folder(ex.a3, 'control'))[0] as TreeNode
    expect(treeTooltip(branch)).toBe('Control 1 of A3 · branch of Sales Policy')
    expect(treeTooltip(folder(ex.a3, 'control'))).toBe('Controls (1) of A3')
  })

  it('shows a flat list with role labels when grouping is off', () => {
    const ex = buildOrderExample()
    expect(labels(childrenOf(ex.a1, { groupArrows: false }))).toEqual([
      'Input 1: Customer Order',
      'Control 1: Sales Policy',
      'Output 1: Validated Order',
      'Mechanism 1: Order Staff'
    ])
  })

  it('keeps arrows that touch no box under their owner', () => {
    const ex = buildOrderExample()
    const port = createElement('IDEF0Port', { role: 'input', _parent: ex.top })
    const trunk = (ex.top['arrows'] as Elem[]).find((a) => a['name'] === 'Validated Order') as Elem
    const join = createElement('IDEF0Arrow', { name: 'Walk-in Order', role: 'output', source: port, target: trunk, _parent: ex.top })
    ;(ex.top['arrows'] as Elem[]).push(join)
    expect(childrenOf(ex.top).some((n) => n.kind === 'element' && n.el === join)).toBe(true)
  })

  it('makes boxes with arrows expandable, lists folder keys and reveals an arrow under its box', () => {
    const ex = buildOrderExample()
    const leaf = createElement('IDEF0Function', { name: 'Lonely', boxNumber: 4, _parent: ex.top })
    ;(ex.top['functions'] as Elem[]).push(leaf)
    expect(hasTreeChildren(elementNode(ex.a3))).toBe(true)
    expect(hasTreeChildren(elementNode(leaf))).toBe(false)
    expect(expandableIds(ex.project)).toEqual(expect.arrayContaining([ex.top._id, ex.a1._id, ex.a2._id, ex.a3._id]))
    expect(expandableIds(ex.project)).not.toContain(leaf._id)
    expect(arrowFolderKeys(ex.project)).toContain(folderKey(ex.a2, 'input'))
    expect(arrowFolderKeys(ex.project)).toHaveLength(4 + 4 + 3 + 3)
    const validated = (ex.top['arrows'] as Elem[]).find((a) => a['name'] === 'Validated Order') as Elem
    expect(revealPath(validated)).toEqual({ expand: [ex.top._id, ex.model._id, ex.project._id, ex.a2._id], folder: folderKey(ex.a2, 'input') })
    expect(revealPath(validated, { groupArrows: false }).folder).toBeNull()
    const output = (ex.top['arrows'] as Elem[]).find((a) => a['name'] === 'Shipped Order') as Elem
    expect(revealPath(output).folder).toBe(folderKey(ex.a3, 'output'))
  })

  it('never writes the virtual folders or entries into the project file', () => {
    const ex = buildOrderExample()
    const before = writeMdj(ex.project)
    const walk = (node: TreeNode, options: TreeOptions): void => {
      for (const child of treeChildren(node, options)) walk(child, options)
    }
    walk(elementNode(ex.project), {})
    walk(elementNode(ex.project), { groupArrows: false })
    const after = writeMdj(ex.project)
    expect(after).toBe(before)
    expect(after).not.toMatch(/Inputs \(|"folder"/)
  })
})
