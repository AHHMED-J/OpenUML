import { describe, expect, it } from 'vitest'
import { instantiate, type Elem, type NodeView } from '../../model'
import { exampleKit } from './testkit'
import { validateDiagram, validateIdef0, type IdefIssueId } from './validate'

type Kit = ReturnType<typeof exampleKit>

function ids(k: Kit): IdefIssueId[] {
  return validateIdef0(k.model).map((i) => i.id)
}

const arrowNamed = (scope: Elem, name: string): Elem => (scope['arrows'] as Elem[]).find((a) => a['name'] === name) as Elem

function addFunction(k: Kit, name: string, boxNumber: number): Elem {
  const fn = instantiate('IDEF0Function')
  Object.assign(fn, { _id: `extra${boxNumber}`, name, boxNumber, _parent: k.top })
  ;(k.top['functions'] as Elem[]).push(fn)
  const view = instantiate('IDEF0FunctionView') as NodeView
  Object.assign(view, { _id: `extraV${boxNumber}`, model: fn, left: 100 + boxNumber * 300, top: 100 + boxNumber * 150, width: 168, height: 88, _parent: k.child })
  k.child.ownedViews.push(view)
  return fn
}

function addArrow(scope: Elem, props: Record<string, unknown>): Elem {
  const arrow = instantiate('IDEF0Arrow')
  Object.assign(arrow, { _id: `arrow${(scope['arrows'] as Elem[]).length}${Math.random()}`, _parent: scope, ...props })
  ;(scope['arrows'] as Elem[]).push(arrow)
  return arrow
}

describe('IDEF0 validation', () => {
  it('finds no warning in the worked example', () => {
    const k = exampleKit()
    expect(validateIdef0(k.model)).toEqual([])
  })

  it('returns warning-severity issues that point at an element and a diagram', () => {
    const k = exampleKit()
    ;(k.example.a1 as Elem)['name'] = ''
    const issue = validateIdef0(k.model)[0]!
    expect(issue).toMatchObject({ id: 'W05', severity: 'warning', elementId: k.example.a1._id, diagramId: k.child._id })
    expect(validateDiagram(k.model, k.child)).toHaveLength(1)
    expect(validateDiagram(k.model, k.context)).toHaveLength(0)
  })

  it('W01: too few or too many boxes, and box numbers above 9', () => {
    const k = exampleKit()
    ;(k.top['functions'] as Elem[]).pop()
    expect(ids(k)).toContain('W01')
    const k2 = exampleKit()
    addFunction(k2, 'Close Order', 4)
    addFunction(k2, 'Archive Order', 5)
    addFunction(k2, 'Review Order', 6)
    addFunction(k2, 'Audit Order', 7)
    expect(ids(k2)).toContain('W01')
    const k3 = exampleKit()
    k3.example.a3['boxNumber'] = 10
    expect(validateIdef0(k3.model).some((i) => i.id === 'W01' && i.elementId === k3.example.a3._id)).toBe(true)
  })

  it('W02: the context diagram needs exactly one box numbered 0', () => {
    const k = exampleKit()
    k.top['boxNumber'] = 2
    expect(ids(k)).toContain('W02')
    const k2 = exampleKit()
    const extra = instantiate('IDEF0FunctionView') as NodeView
    Object.assign(extra, { _id: 'second', model: k2.example.a1, _parent: k2.context })
    k2.context.ownedViews.push(extra)
    expect(ids(k2)).toContain('W02')
  })

  it('W03: a box without control or without output', () => {
    const k = exampleKit()
    const scope = k.top
    scope['arrows'] = (scope['arrows'] as Elem[]).filter((a) => !(a['target'] === k.example.a3 && a['role'] === 'control'))
    expect(validateIdef0(k.model).some((i) => i.id === 'W03' && i.elementId === k.example.a3._id && i.message.includes('control'))).toBe(true)
    const k2 = exampleKit()
    k2.top['arrows'] = (k2.top['arrows'] as Elem[]).filter((a) => a['name'] !== 'Shipped Order')
    expect(validateIdef0(k2.model).some((i) => i.id === 'W03' && i.message.includes('output'))).toBe(true)
  })

  it('W04: more than one call arrow', () => {
    const k = exampleKit()
    addArrow(k.top, { role: 'call', source: k.example.a1, name: '' })
    addArrow(k.top, { role: 'call', source: k.example.a1, name: '' })
    expect(ids(k).filter((i) => i === 'W04')).toHaveLength(1)
  })

  it('W05: empty or generic names and labels', () => {
    const k = exampleKit()
    k.example.a1['name'] = 'Process'
    expect(ids(k)).toContain('W05')
    const k2 = exampleKit()
    arrowNamed(k2.top, 'Approved Order')['name'] = ''
    expect(ids(k2)).toContain('W05')
    const k3 = exampleKit()
    arrowNamed(k3.top, 'Approved Order')['name'] = 'Input'
    expect(ids(k3)).toContain('W05')
  })

  it('W06: one-word names that are not verbs, unless confirmed with (v)', () => {
    const k = exampleKit()
    k.example.a2['name'] = 'Order'
    expect(ids(k)).toContain('W06')
    k.example.a2['name'] = 'Order (v)'
    expect(ids(k)).not.toContain('W06')
    k.example.a2['name'] = 'Approve'
    expect(ids(k)).not.toContain('W06')
  })

  it('W07: an unlabeled branch whose trunk is also unlabeled', () => {
    const k = exampleKit()
    arrowNamed(k.top, 'Sales Policy')['name'] = ''
    const found = validateIdef0(k.model).filter((i) => i.id === 'W07')
    expect(found).toHaveLength(2)
  })

  it('W08: a boundary arrow with neither counterpart nor tunnel', () => {
    const k = exampleKit()
    const port = (k.top['ports'] as Elem[])[0] as Elem
    port['corresponds'] = null
    expect(ids(k)).toContain('W08')
    arrowNamed(k.top, 'Customer Order')['tunnelSource'] = true
    expect(ids(k)).not.toContain('W08')
  })

  it('W09: a parent arrow without a boundary arrow on the child diagram, unless tunneled', () => {
    const k = exampleKit()
    k.top['ports'] = (k.top['ports'] as Elem[]).filter((p) => p['role'] !== 'mechanism')
    expect(validateIdef0(k.model).some((i) => i.id === 'W09' && i.message.includes('Order Staff'))).toBe(true)
    arrowNamed(k.model, 'Order Staff')['tunnelTarget'] = true
    expect(ids(k)).not.toContain('W09')
  })

  it('W10: duplicate numbers, gaps and numbers that disagree with the staircase', () => {
    const k = exampleKit()
    k.example.a3['boxNumber'] = 2
    expect(ids(k)).toContain('W10')
    const k2 = exampleKit()
    k2.example.a3['boxNumber'] = 5
    expect(ids(k2)).toContain('W10')
    const k3 = exampleKit()
    k3.example.a1['boxNumber'] = 3
    k3.example.a3['boxNumber'] = 1
    expect(ids(k3)).toContain('W10')
  })

  it('W11: child diagram named differently or not owned by its box', () => {
    const k = exampleKit()
    k.child['name'] = 'Something else'
    expect(ids(k)).toContain('W11')
    const k2 = exampleKit()
    k2.child._parent = k2.model
    expect(ids(k2)).toContain('W11')
  })

  it('W12: a box feeding itself', () => {
    const k = exampleKit()
    addArrow(k.top, { role: 'input', name: 'Loop', source: k.example.a2, target: k.example.a2 })
    expect(ids(k)).toContain('W12')
  })

  it('W13: duplicate labels and duplicate box names on one diagram', () => {
    const k = exampleKit()
    arrowNamed(k.top, 'Approved Order')['name'] = 'Validated Order'
    expect(ids(k)).toContain('W13')
    const k2 = exampleKit()
    k2.example.a2['name'] = 'receive order'
    expect(ids(k2)).toContain('W13')
  })

  it('W14: a call arrow that says nothing about what it calls', () => {
    const k = exampleKit()
    addArrow(k.top, { role: 'call', source: k.example.a1 })
    expect(ids(k)).toContain('W14')
    k.example.a1['calledFunction'] = k.example.a2
    expect(ids(k)).not.toContain('W14')
  })

  it('W15: A-0 without purpose or viewpoint', () => {
    const k = exampleKit()
    k.model['purpose'] = ''
    expect(ids(k)).toContain('W15')
    const k2 = exampleKit()
    k2.model['viewpoint'] = '  '
    expect(ids(k2)).toContain('W15')
  })

  it('W16: a box without arrows', () => {
    const k = exampleKit()
    k.top['arrows'] = (k.top['arrows'] as Elem[]).filter((a) => a['source'] !== k.example.a2 && a['target'] !== k.example.a2)
    expect(validateIdef0(k.model).some((i) => i.id === 'W16' && i.elementId === k.example.a2._id)).toBe(true)
  })

  it('W17: a tunneled connected end whose boundary arrow has no parent counterpart', () => {
    const k = exampleKit()
    const port = (k.top['ports'] as Elem[])[0] as Elem
    port['corresponds'] = null
    arrowNamed(k.top, 'Customer Order')['tunnelTarget'] = true
    expect(ids(k)).toContain('W17')
  })

  it('W18: a branch cycle or a trunk on another diagram', () => {
    const k = exampleKit()
    const trunk = arrowNamed(k.top, 'Sales Policy')
    const branch = (k.top['arrows'] as Elem[]).find((a) => a['source'] === trunk) as Elem
    trunk['source'] = branch
    expect(ids(k)).toContain('W18')
    const k2 = exampleKit()
    const b2 = (k2.top['arrows'] as Elem[]).find((a) => a['source'] === arrowNamed(k2.top, 'Sales Policy')) as Elem
    ;(b2['source'] as Elem)._parent = k2.model
    expect(ids(k2)).toContain('W18')
  })
})
