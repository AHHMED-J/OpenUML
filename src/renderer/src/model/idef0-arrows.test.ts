import { describe, expect, it } from 'vitest'
import { buildOrderExample } from './idef0-example'
import { arrowDisplayName, arrowPositionAt, arrowRoleLabel, boxArrowGroups, rolesAt } from './idef0-numbering'
import { createElement } from './index'
import type { Elem, View } from './types'

function addArrow(scope: Elem, diagram: Elem, props: Record<string, unknown>, points: Array<[number, number]>): Elem {
  const arrow = createElement('IDEF0Arrow', { ...props, _parent: scope })
  ;(scope['arrows'] as Elem[]).push(arrow)
  const view = createElement<View>('IDEF0ArrowView', { model: arrow, points: points.map(([x, y]) => ({ x, y })), _parent: diagram })
  ;(diagram['ownedViews'] as View[]).push(view)
  return arrow
}

const labels = (fn: Elem): string[] =>
  boxArrowGroups(fn).flatMap((g) => g.arrows.map((a, i) => arrowRoleLabel(g.role, i + 1, arrowDisplayName(a))))

describe('IDEF0 arrows of a box', () => {
  it('labels each arrow by its role at the box and its position on that side', () => {
    const ex = buildOrderExample()
    expect(labels(ex.a1)).toEqual(['Input 1: Customer Order', 'Control 1: Sales Policy', 'Output 1: Validated Order', 'Mechanism 1: Order Staff'])
    // A box-to-box arrow has one role at each box; an unlabeled fork branch is just "Control 1".
    expect(labels(ex.a2)).toEqual(['Input 1: Validated Order', 'Control 1', 'Output 1: Approved Order'])
    expect(labels(ex.top)).toEqual(['Input 1: Customer Order', 'Control 1: Sales Policy', 'Output 1: Shipped Order', 'Mechanism 1: Order Staff'])
  })

  it('numbers inputs and outputs top to bottom, controls and mechanisms left to right', () => {
    const ex = buildOrderExample()
    const d = ex.childDiagram
    // A second input entering A1 above "Customer Order" (y 154) becomes Input 1.
    const upper = addArrow(ex.top, d, { name: 'Rush Order', role: 'input', source: null, target: ex.a1 }, [[24, 130], [119, 130]])
    // A control left of "Sales Policy" (x 204) becomes Control 1, one to its right Control 3.
    const left = addArrow(ex.top, d, { name: 'Credit Rules', role: 'control', source: null, target: ex.a1 }, [[150, 64], [150, 109]])
    const right = addArrow(ex.top, d, { name: 'Calendar', role: 'control', source: null, target: ex.a1 }, [[260, 64], [260, 109]])
    // Mechanisms: right of "Order Staff" (x 204).
    const tool = addArrow(ex.top, d, { name: 'Order System', role: 'mechanism', source: null, target: ex.a1 }, [[250, 696], [250, 199]])
    // Outputs: above "Validated Order" (y 154 at A1's right side).
    const reject = addArrow(ex.top, d, { name: 'Rejected Order', role: 'output', source: ex.a1, target: null }, [[289, 120], [1000, 120]])
    expect(labels(ex.a1)).toEqual([
      'Input 1: Rush Order',
      'Input 2: Customer Order',
      'Control 1: Credit Rules',
      'Control 2: Sales Policy',
      'Control 3: Calendar',
      'Output 1: Rejected Order',
      'Output 2: Validated Order',
      'Mechanism 1: Order Staff',
      'Mechanism 2: Order System'
    ])
    expect(arrowPositionAt(upper, ex.a1, 'input')).toBe(1)
    expect(arrowPositionAt(left, ex.a1, 'control')).toBe(1)
    expect(arrowPositionAt(right, ex.a1, 'control')).toBe(3)
    expect(arrowPositionAt(tool, ex.a1, 'mechanism')).toBe(2)
    expect(arrowPositionAt(reject, ex.a1, 'output')).toBe(1)
    expect(arrowPositionAt(reject, ex.a2, 'output')).toBe(0)
  })

  it('keeps model order for arrows without a route and shows call arrows by their reference', () => {
    const ex = buildOrderExample()
    const scope = ex.top
    const first = createElement('IDEF0Arrow', { name: 'First', role: 'mechanism', target: ex.a3, _parent: scope })
    const second = createElement('IDEF0Arrow', { role: 'mechanism', target: ex.a3, _parent: scope })
    const call = createElement('IDEF0Arrow', { role: 'call', source: ex.a3, _parent: scope })
    ;(scope['arrows'] as Elem[]).push(first, second, call)
    ex.a3['calledFunction'] = ex.a1
    expect(labels(ex.a3)).toEqual(['Input 1: Approved Order', 'Control 1', 'Output 1: Shipped Order', 'Mechanism 1: First', 'Mechanism 2', 'Call 1: OM/A1'])
    call['calledNode'] = 'XM/A3'
    expect(arrowDisplayName(call)).toBe('XM/A3')
    expect(rolesAt(call, ex.a3)).toEqual(['call'])
  })

  it('gives a box feeding itself both roles', () => {
    const ex = buildOrderExample()
    const loop = createElement('IDEF0Arrow', { name: 'Retry', role: 'control', source: ex.a2, target: ex.a2, _parent: ex.top })
    expect(rolesAt(loop, ex.a2)).toEqual(['control', 'output'])
    expect(rolesAt(loop, ex.a1)).toEqual([])
  })
})
