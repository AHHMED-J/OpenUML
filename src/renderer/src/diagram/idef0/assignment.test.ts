import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../../format'
import { functionViewsOf, type Diagram, type EdgeView, type Elem, type NodeView, type View } from '../../model'
import { assignParentArrow, assignmentLosses, portAssignment } from './assignment'
import { isPendingPort, pendingPorts } from './pending'
import { deleteViews, withGeometry } from '../editor/actions'
import { removeChildBoxes } from './boxCount'
import { addBoundaryArrow, decomposeFunction } from './decompose'
import { IDEF0_ROLE_COLORS } from './colors'
import { createIdef0Edge, pickEnd } from './gestures'
import { PENDING_STUB, type PortData } from './layout'
import { newKit, wireLikeDecompose, type IdefKit } from './testkit'
import { validateIdef0 } from './validate'

type Role = 'input' | 'control' | 'output' | 'mechanism'
const ARROW = { kind: 'IDEF0Arrow' }

/** A new model whose A-0 box has one named arrow per role: each waits on A0 as a pending arrow. */
function parentArrows(): IdefKit & { port: (role: Role) => Elem; box: (n: number) => Elem } {
  const k = newKit()
  const top = functionViewsOf(k.context)[0] as View
  const names: Record<Role, string> = { input: 'Order', control: 'Policy', output: 'Invoice', mechanism: 'Clerk' }
  for (const role of ['input', 'control', 'output', 'mechanism'] as Role[]) {
    const id = addBoundaryArrow(k.envOf(k.context), top, role) as string
    k.engine.transact('Name', (b) => b.set((k.repository.get(id) as View).model as Elem, 'name', names[role]))
  }
  const port = (role: Role): Elem => (k.top['ports'] as Elem[]).find((p) => p['role'] === role) as Elem
  const box = (n: number): Elem => k.boxes(k.child)[n - 1]!.model as Elem
  return { ...k, port, box }
}

const arrowsOf = (scope: Elem): Elem[] => (scope['arrows'] as Elem[]) ?? []
const viewOf = (d: Diagram, model: Elem): EdgeView => d.ownedViews.find((v) => v.model === model) as EdgeView
const text = (k: IdefKit): string => writeMdj(k.repository.project as Elem)
const contextState = (k: IdefKit): string => JSON.stringify([k.model['arrows'], k.model['ports']].map((l) => (l as Elem[]).map((e) => [e._id, e['name'], e['role']])))

describe('pending parent arrows', () => {
  it('gives every arrow of the parent box a pending port on the child diagram, with W19 until it is assigned', () => {
    const k = parentArrows()
    const pending = pendingPorts(k.child)
    expect(pending.map((p) => p['role']).sort()).toEqual(['control', 'input', 'mechanism', 'output'])
    expect(pending.every((p) => (p['corresponds'] as Elem)._parent === k.model)).toBe(true)
    expect(arrowsOf(k.top)).toHaveLength(0)
    const issues = validateIdef0(k.model).filter((i) => i.id === 'W19')
    expect(issues.map((i) => i.diagramId)).toEqual([k.child._id, k.child._id, k.child._id, k.child._id])
    expect(issues.find((i) => i.elementId === k.port('control')._id)?.message).toBe('Parent arrow "Policy" waits unconnected on "Top Function": connect it to a box')
    expect(validateIdef0(k.model).filter((i) => i.id === 'W09')).toEqual([])
  })

  it('draws a pending arrow as a stub into the sheet, in its role color, labeled with the parent arrow', () => {
    const k = parentArrows()
    const layout = k.layoutOf(k.child)
    const data = (role: Role): PortData => layout.nodes.get((k.child.ownedViews.find((v) => v.model === k.port(role)) as View)._id)!.data as PortData
    const control = data('control')
    expect(control.pending?.handle).toEqual({ x: control.anchor.x, y: control.anchor.y + PENDING_STUB })
    expect(control.pending?.color).toBe(IDEF0_ROLE_COLORS.control)
    expect(control.pending?.label?.text).toBe('Policy')
    expect(control.codeLine?.text).toBe('C1')
    expect(data('input').pending?.handle.x).toBe(data('input').anchor.x + PENDING_STUB)
    expect(data('output').pending?.handle.x).toBe(data('output').anchor.x - PENDING_STUB)
    expect(data('mechanism').pending?.handle.y).toBe(data('mechanism').anchor.y - PENDING_STUB)
    assignParentArrow(k.envOf(k.child), k.port('control'), [k.box(1)])
    expect(k.layoutOf(k.child).nodes.get((k.child.ownedViews.find((v) => v.model === k.port('control')) as View)._id)!.data).toMatchObject({ pending: null })
  })

  it('keeps pending ports and assignments through save and reopen', () => {
    const k = parentArrows()
    assignParentArrow(k.envOf(k.child), k.port('control'), [k.box(1), k.box(3)])
    const saved = text(k)
    const back = readMdj(saved)
    expect(back.warnings).toEqual([])
    expect(validateModel(back.project)).toEqual([])
    expect(writeMdj(back.project)).toBe(saved)
  })
})

describe('assignParentArrow', () => {
  for (const role of ['input', 'control', 'mechanism', 'output'] as Role[]) {
    it(`connects a pending ${role} to one box, labeled like the parent arrow, in one undo step`, () => {
      const k = parentArrows()
      const before = text(k)
      const depth = k.engine.undoDepth
      const port = k.port(role)
      expect(assignParentArrow(k.envOf(k.child), port, [k.box(2)])).toBe(true)
      expect(k.engine.undoDepth).toBe(depth + 1)
      expect(k.engine.undoName).toBe('Assign Parent Arrow')
      const [arrow] = arrowsOf(k.top)
      expect(arrow?.['role']).toBe(role)
      expect(arrow?.['name']).toBe((port['corresponds'] as Elem)['name'])
      if (role === 'output') expect([arrow?.['source'], arrow?.['target']]).toEqual([k.box(2), port])
      else expect([arrow?.['source'], arrow?.['target']]).toEqual([port, k.box(2)])
      expect(isPendingPort(port)).toBe(false)
      expect(portAssignment(port)?.boxes).toEqual([k.box(2)])
      expect(validateIdef0(k.model).filter((i) => i.id === 'W19').map((i) => i.elementId)).not.toContain(port._id)
      // Routed, and the port moved to where its arrow meets the box: a straight line.
      const points = viewOf(k.child, arrow as Elem).points
      expect(points.length).toBe(2)
      expect(assignParentArrow(k.envOf(k.child), port, [k.box(2)])).toBe(false)
      k.engine.undo()
      expect(text(k)).toBe(before)
    })
  }

  it('forks an input, a control or a mechanism to several boxes and joins an output from several', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    assignParentArrow(env, k.port('control'), [k.box(3), k.box(1), k.box(2)])
    const controls = arrowsOf(k.top).filter((a) => a['role'] === 'control')
    const trunk = controls.find((a) => a['source'] === k.port('control')) as Elem
    expect(trunk['target']).toBe(k.box(1))
    expect(controls.filter((a) => a['source'] === trunk).map((a) => a['target'])).toEqual([k.box(2), k.box(3)])
    expect(portAssignment(k.port('control'))?.boxes).toEqual([k.box(1), k.box(2), k.box(3)])
    // Branches carry the trunk's label.
    expect(controls.filter((a) => a !== trunk).map((a) => a['name'])).toEqual(['', ''])
    assignParentArrow(env, k.port('output'), [k.box(2), k.box(3)])
    const outputs = arrowsOf(k.top).filter((a) => a['role'] === 'output')
    const out = outputs.find((a) => a['target'] === k.port('output')) as Elem
    expect(out['source']).toBe(k.box(2))
    expect(outputs.filter((a) => a['target'] === out).map((a) => a['source'])).toEqual([k.box(3)])
    expect(portAssignment(k.port('output'))?.boxes).toEqual([k.box(2), k.box(3)])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    expect(validateIdef0(k.model).filter((i) => ['W07', 'W09', 'W18'].includes(i.id))).toEqual([])
  })

  it('keeps the arrows, labels and route hints of the boxes that stay, and promotes a branch when the trunk box goes', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    const port = k.port('control')
    assignParentArrow(env, port, [k.box(1), k.box(2), k.box(3)])
    const trunk = arrowsOf(k.top).find((a) => a['source'] === port) as Elem
    const to2 = arrowsOf(k.top).find((a) => a['target'] === k.box(2)) as Elem
    const to3 = arrowsOf(k.top).find((a) => a['target'] === k.box(3)) as Elem
    k.engine.transact('Label', (b) => {
      b.set(to3, 'name', 'Shipping Policy')
      b.set(viewOf(k.child, to3), 'routeX', 696)
    })
    assignParentArrow(env, port, [k.box(2), k.box(3)])
    expect(k.repository.get(trunk._id)).toBeUndefined()
    // The arrow to A2 is now the trunk, from the port, with the trunk's label.
    expect([to2['source'], to2['target'], to2['name']]).toEqual([port, k.box(2), 'Policy'])
    expect(viewOf(k.child, to2).tail).toBe(k.child.ownedViews.find((v) => v.model === port))
    expect([to3['source'], to3['name'], viewOf(k.child, to3)['routeX']]).toEqual([to2, 'Shipping Policy', 696])
    expect(viewOf(k.child, to3).tail).toBe(viewOf(k.child, to2))
    // Unchecking a branch box removes only that branch.
    assignParentArrow(env, port, [k.box(2)])
    expect(arrowsOf(k.top)).toEqual([to2])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('makes the arrow pending again with no boxes, keeping its port', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    const port = k.port('mechanism')
    assignParentArrow(env, port, [k.box(1), k.box(3)])
    assignParentArrow(env, port, [])
    expect(arrowsOf(k.top)).toHaveLength(0)
    expect(k.repository.get(port._id)).toBe(port)
    expect(isPendingPort(port)).toBe(true)
  })

  it('never touches the parent level', () => {
    const k = parentArrows()
    const before = contextState(k)
    const env = k.envOf(k.child)
    assignParentArrow(env, k.port('input'), [k.box(1), k.box(2)])
    assignParentArrow(env, k.port('input'), [k.box(3)])
    assignParentArrow(env, k.port('input'), [])
    expect(contextState(k)).toBe(before)
    expect(k.port('input')['corresponds']).toBeTruthy()
  })

  it('removes what the flow fed on the child diagram of a box it leaves, and gives a newly reached decomposed box a pending arrow', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    const port = k.port('input')
    assignParentArrow(env, port, [k.box(2)])
    const toA2 = arrowsOf(k.top)[0] as Elem
    const a2Diagram = decomposeFunction(k.engine, k.box(2), 3)
    wireLikeDecompose(k.envOf(a2Diagram))
    const below = [...arrowsOf(k.box(2))]
    expect(below).toHaveLength(1)
    const a1Diagram = decomposeFunction(k.engine, k.box(1), 3)
    expect(pendingPorts(a1Diagram)).toEqual([])
    expect(assignmentLosses(port, [k.box(1)])).toEqual(below)
    expect(assignmentLosses(port, [k.box(1), k.box(2)])).toEqual([])
    assignParentArrow(env, port, [k.box(1)])
    expect(k.repository.get(toA2._id)).toBeUndefined()
    expect(k.repository.get((below[0] as Elem)._id)).toBeUndefined()
    expect(k.box(2)['ports'] as Elem[]).toHaveLength(0)
    expect(pendingPorts(a1Diagram).map((p) => p['corresponds'])).toEqual([arrowsOf(k.top)[0]])
    expect(validateIdef0(k.model).filter((i) => ['W08', 'W09'].includes(i.id))).toEqual([])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('turns the arrows of a removed box back into pending arrows, with no W09', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    assignParentArrow(env, k.port('input'), [k.box(3)])
    assignParentArrow(env, k.port('control'), [k.box(1), k.box(3)])
    removeChildBoxes(env, [k.box(3)])
    expect(isPendingPort(k.port('input'))).toBe(true)
    expect(portAssignment(k.port('control'))?.boxes).toEqual([k.box(1)])
    expect(validateIdef0(k.model).filter((i) => i.id === 'W09')).toEqual([])
    // Deleting the box from the canvas does the same.
    const a1 = k.boxes(k.child)[0] as NodeView
    deleteViews(env, [a1._id])
    expect(isPendingPort(k.port('control'))).toBe(true)
    expect(validateIdef0(k.model).filter((i) => i.id === 'W09')).toEqual([])
  })

  it('refuses tunneled trees, boxes of other diagrams and ports that stand for no parent arrow', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    const port = k.port('control')
    assignParentArrow(env, port, [k.box(1)])
    const arrow = arrowsOf(k.top)[0] as Elem
    k.engine.transact('Tunnel', (b) => b.set(arrow, 'tunnelTarget', true))
    expect(portAssignment(port)?.readOnly).toMatch(/tunneled/i)
    expect(() => assignParentArrow(env, port, [k.box(2)])).toThrow(/tunneled/i)
    expect(() => assignParentArrow(env, k.port('input'), [k.top])).toThrow(/boxes of its child diagram/)
    const free = addBoundaryArrow(env, k.boxes(k.child)[0] as NodeView, 'mechanism') as string
    const tail = (k.repository.get(free) as EdgeView).tail as View
    expect(portAssignment(tail.model as Elem)).not.toBeNull()
    k.engine.transact('Unlink', (b) => b.set(tail.model as Elem, 'corresponds', null))
    expect(() => assignParentArrow(env, tail.model as Elem, [k.box(2)])).toThrow(/parent arrow/)
  })
})

describe('pending arrows on a crowded frame edge', () => {
  /** A child diagram with two named controls of the parent box, both pending. */
  function twoControls(): ReturnType<typeof parentArrows> & { views: () => NodeView[]; span: (v: View) => [number, number] } {
    const k = parentArrows()
    const id = addBoundaryArrow(k.envOf(k.context), functionViewsOf(k.context)[0] as View, 'control') as string
    k.engine.transact('Name', (b) => b.set((k.repository.get(id) as View).model as Elem, 'name', 'Budget Limits'))
    const views = (): NodeView[] =>
      (k.top['ports'] as Elem[]).filter((p) => p['role'] === 'control').map((p) => k.child.ownedViews.find((v) => v.model === p) as NodeView)
    // What a port covers along the top edge: its square, ICOM code, stub handle and name.
    const span = (v: View): [number, number] => {
      const node = k.layoutOf(k.child).nodes.get(v._id)!
      const data = node.data as PortData
      const rects = [node.box, data.codeLine?.box, data.pending?.label?.box].filter((r) => !!r)
      return [Math.min(...rects.map((r) => r.left)), Math.max(...rects.map((r) => r.left + r.width))]
    }
    return { ...k, views, span }
  }
  const apart = (a: [number, number], b: [number, number]): boolean => a[1] <= b[0] || b[1] <= a[0]

  it('moves a pending arrow dropped on another to the nearest free spot of the edge, leaving the other in place', () => {
    const k = twoControls()
    const [first, second] = k.views() as [NodeView, NodeView]
    const at = { left: first.left, top: first.top }
    withGeometry(k.envOf(k.child), 'Move', (b) => b.setAll(second, at))
    expect({ left: first.left, top: first.top }).toEqual(at)
    expect(second.top).toBe(at.top)
    expect(apart(k.span(first), k.span(second))).toBe(true)
    expect(Math.abs(second.left - first.left)).toBeLessThan(200)
  })

  it('keeps a parent arrow that goes back to pending off the boundary arrows still connected there', () => {
    const k = twoControls()
    const env = k.envOf(k.child)
    const [first, second] = k.views() as [NodeView, NodeView]
    const [one, two] = [first.model, second.model] as [Elem, Elem]
    assignParentArrow(env, one, [k.box(1)])
    assignParentArrow(env, two, [k.box(1)])
    // Two arrows drawn into the box from almost the same spot, as a modeler may leave them.
    withGeometry(env, 'Move', (b) => b.setAll(second, { left: first.left + 4 }))
    assignParentArrow(env, two, [])
    expect(isPendingPort(two)).toBe(true)
    expect(portAssignment(one)?.boxes).toEqual([k.box(1)])
    expect(apart(k.span(first), k.span(second))).toBe(true)
    // Nothing moves when nothing overlaps.
    const settled = { left: second.left, top: second.top }
    withGeometry(env, 'Touch', () => undefined)
    expect({ left: second.left, top: second.top }).toEqual(settled)
  })
})

describe('dragging a parent arrow to a box', () => {
  const center = (r: { left: number; top: number; width: number; height: number }) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

  it('connects a pending control dropped from above on a box, and forks it with the next drop', () => {
    const k = parentArrows()
    const env = k.envOf(k.child)
    const layout = k.layoutOf(k.child)
    const portView = k.child.ownedViews.find((v) => v.model === k.port('control')) as View
    const stub = layout.nodes.get(portView._id)!.outerHitAreas![0]!
    const press = center(stub)
    expect(pickEnd(layout, press, ARROW)).toBe(portView._id)
    const box2 = layout.nodes.get(k.boxes(k.child)[1]!._id)!.box
    const inside = { x: box2.left + 20, y: box2.top + box2.height - 10 }
    const above = { x: inside.x, y: box2.top - 30 }
    const id = createIdef0Edge(env, layout, ARROW, portView._id, k.boxes(k.child)[1]!._id, press, inside, [press, above, inside])
    expect(id).toBeTruthy()
    expect(portAssignment(k.port('control'))?.boxes).toEqual([k.box(2)])
    // The role comes from the port: a control drawn into the left side of a box is refused.
    const layout2 = k.layoutOf(k.child)
    const box1 = layout2.nodes.get(k.boxes(k.child)[0]!._id)!.box
    const left = { x: box1.left - 30, y: box1.top + 20 }
    const in1 = { x: box1.left + 10, y: box1.top + 20 }
    expect(() => createIdef0Edge(env, layout2, ARROW, portView._id, k.boxes(k.child)[0]!._id, press, in1, [press, left, in1])).toThrow(/top side of a box/)
    const top1 = { x: box1.left + 30, y: box1.top - 30 }
    createIdef0Edge(env, layout2, ARROW, portView._id, k.boxes(k.child)[0]!._id, press, in1, [press, top1, in1])
    expect(portAssignment(k.port('control'))?.boxes).toEqual([k.box(1), k.box(2)])
    expect(arrowsOf(k.top).filter((a) => a['source'] === k.port('control'))).toHaveLength(1)
  })

  it('connects a pending output dragged from a box to it', () => {
    const k = parentArrows()
    const layout = k.layoutOf(k.child)
    const portView = k.child.ownedViews.find((v) => v.model === k.port('output')) as View
    const release = center(layout.nodes.get(portView._id)!.outerHitAreas![0]!)
    const box3 = k.boxes(k.child)[2] as NodeView
    const press = center(layout.nodes.get(box3._id)!.box)
    expect(pickEnd(layout, release, ARROW)).toBe(portView._id)
    createIdef0Edge(k.envOf(k.child), layout, ARROW, box3._id, portView._id, press, release, [press, release])
    expect(portAssignment(k.port('output'))?.boxes).toEqual([k.box(3)])
  })
})
