import { afterEach, describe, expect, it } from 'vitest'
import { functionViewsOf, type Elem, type View } from '../../model'
import { hooksFor } from '../editor/actions'
import { assignParentArrow, linkedPortOf } from './assignment'
import { arrowHeader, assignPopoverState, assignResult, boxChoices, closeAssignPopover, lossWarning, openAssignPopover, toggleAssignBox } from './assignPopover'
import { addBoundaryArrow, decomposeFunction } from './decompose'
import type { PortData } from './layout'
import { newKit, wireLikeDecompose } from './testkit'

type Role = 'input' | 'control' | 'output' | 'mechanism'

function kitWithArrows() {
  const k = newKit()
  const top = functionViewsOf(k.context)[0] as View
  for (const [role, name] of [['control', 'Policy'], ['output', ''], ['input', 'Order']] as Array<[Role, string]>) {
    const id = addBoundaryArrow(k.envOf(k.context), top, role) as string
    k.engine.transact('Name', (b) => b.set((k.repository.get(id) as View).model as Elem, 'name', name))
  }
  const port = (role: Role): Elem => (k.top['ports'] as Elem[]).find((p) => p['role'] === role) as Elem
  const portView = (role: Role): View => k.child.ownedViews.find((v) => v.model === port(role)) as View
  const box = (n: number): Elem => k.boxes(k.child)[n - 1]!.model as Elem
  return { ...k, port, portView, box }
}

afterEach(() => closeAssignPopover())

describe('the box table of a parent arrow', () => {
  it('opens on a click on a pending arrow with nothing checked, and toggles boxes', () => {
    const k = kitWithArrows()
    const hooks = hooksFor(k.child)
    const layout = k.layoutOf(k.child)
    const view = k.portView('control')
    hooks?.clickView?.(k.envOf(k.child), layout, view._id, { x: 0, y: 0 })
    expect(assignPopoverState()).toEqual({ diagramId: k.child._id, portId: k.port('control')._id, checked: [] })
    toggleAssignBox(k.box(1)._id)
    toggleAssignBox(k.box(3)._id)
    toggleAssignBox(k.box(1)._id)
    expect(assignPopoverState()?.checked).toEqual([k.box(3)._id])
    // A click on a box does nothing to it.
    closeAssignPopover()
    hooks?.clickView?.(k.envOf(k.child), layout, k.boxes(k.child)[0]!._id, { x: 0, y: 0 })
    expect(assignPopoverState()).toBeNull()
  })

  it('starts with the boxes the arrow reaches when reopened (Connect to...)', () => {
    const k = kitWithArrows()
    assignParentArrow(k.envOf(k.child), k.port('control'), [k.box(1), k.box(2)])
    const branch = (k.top['arrows'] as Elem[]).find((a) => a['target'] === k.box(2)) as Elem
    expect(linkedPortOf(branch)).toBe(k.port('control'))
    openAssignPopover(k.child, linkedPortOf(branch) as Elem)
    expect(assignPopoverState()?.checked).toEqual([k.box(1)._id, k.box(2)._id])
    // An arrow between two boxes stands for no parent arrow.
    expect(linkedPortOf(null)).toBeNull()
  })

  it('says what the arrow is, where it goes and what the choice makes of it', () => {
    const k = kitWithArrows()
    expect(arrowHeader(k.child, k.port('control'))).toEqual({ code: 'C1', name: 'Policy', role: 'control', subtitle: 'Control · enters from the top of:' })
    expect(arrowHeader(k.child, k.port('output'))).toMatchObject({ code: 'O1', name: '(unnamed)', subtitle: 'Output · leaves from the right of:' })
    expect(boxChoices(k.child).map((c) => `${c.number} ${c.name}`)).toEqual(['A1 New Function 1', 'A2 New Function 2', 'A3 New Function 3'])
    expect(['input', 'output'].flatMap((r) => [0, 1, 3].map((n) => assignResult(r as Role, n)))).toEqual(['not assigned', '1 box', 'fork to 3', 'not assigned', '1 box', 'join from 3'])
  })

  it('warns before a box with its own child diagram loses the arrow', () => {
    const k = kitWithArrows()
    assignParentArrow(k.envOf(k.child), k.port('input'), [k.box(2)])
    wireLikeDecompose(k.envOf(decomposeFunction(k.engine, k.box(2), 3)))
    expect(lossWarning(k.port('input'), [k.box(1), k.box(2)])).toBeNull()
    expect(lossWarning(k.port('input'), [k.box(1)])).toBe('Removes 1 arrow inside A2 Diagram')
  })

  it('draws from the round handle of a pending arrow with the Select tool; the rest of the stub moves the port', () => {
    const k = kitWithArrows()
    const hooks = hooksFor(k.child)
    const layout = k.layoutOf(k.child)
    const view = k.portView('input')
    const data = layout.nodes.get(view._id)!.data as PortData
    expect(hooks?.dragHandle?.(layout, view._id, data.pending!.handle)).toEqual({ kind: 'IDEF0Arrow' })
    expect(hooks?.dragHandle?.(layout, view._id, data.anchor)).toBeNull()
    expect(hooks?.dragHandle?.(layout, k.boxes(k.child)[0]!._id, data.pending!.handle)).toBeNull()
  })
})
