import { describe, expect, it } from 'vitest'
import { validateModel } from '../../format'
import { isKindOf, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { applyQuickEdit } from '../editor/quickEditApply'
import { createNodeAt, deleteViews, moveSelection, reconnectEnd, resizeNode } from '../editor/actions'
import { addBoundaryArrow, decomposeFunction, renumberBoxes, syncPorts, toggleTunnel } from './decompose'
import { createIdef0Edge } from './gestures'
import { arrowView, edgeLayoutOf, exampleKit, newKit, nodeLayoutOf } from './testkit'
import { validateIdef0 } from './validate'

const fnName = (v: View): string => (v.model as Elem)['name'] as string
const numbers = (boxes: NodeView[]): number[] => boxes.map((b) => (b.model as Elem)['boxNumber'] as number)

describe('decomposition', () => {
  it('decomposes in one undo step with ports, arrows and routed geometry written back', () => {
    const k = exampleKit()
    const child = decomposeFunction(k.engine, k.example.a1, 3)
    expect(child.ownedViews.filter((v) => v._type === 'IDEF0FunctionView')).toHaveLength(3)
    expect(k.example.a1['childDiagram']).toBe(child)
    // A1 has an input, a control, a mechanism and an output on the parent diagram.
    expect((k.example.a1['ports'] as Elem[]).map((p) => p['role'])).toEqual(['input', 'control', 'mechanism', 'output'])
    const arrowViews = child.ownedViews.filter((v) => v._type === 'IDEF0ArrowView')
    expect(arrowViews.length).toBe(4 + 2)
    for (const v of arrowViews) expect((v as never as { points: unknown[] }).points.length).toBeGreaterThanOrEqual(2)
    expect(validateModel(k.example.project)).toEqual([])
    // The seeded child diagram is consistent with its parent.
    expect(validateIdef0(k.model).filter((i) => ['W08', 'W09', 'W11'].includes(i.id))).toEqual([])
    const codes = k.layoutOf(child)
    expect([...codes.nodes.values()].filter((n) => n.viewType === 'IDEF0PortView').map((n) => (n.data as { codeLine: { text: string } | null }).codeLine?.text)).toEqual(['I1', 'C1', 'M1', 'O1'])
    k.engine.undo()
    expect(k.example.a1['childDiagram']).toBeNull()
    expect((k.example.a1['ports'] as Elem[]).length).toBe(0)
  })

  it('seeds an unconnected box with an empty three-box diagram', () => {
    const k = newKit()
    expect(k.child.ownedViews.filter((v) => v._type === 'IDEF0FunctionView')).toHaveLength(3)
    expect(k.child.ownedViews.filter((v) => v._type === 'IDEF0ArrowView')).toHaveLength(0)
  })

  it('synchronizes missing ports without deleting anything', () => {
    const k = exampleKit()
    const ports = k.top['ports'] as Elem[]
    ports.splice(0, 1)
    k.child.ownedViews.splice(k.child.ownedViews.findIndex((v) => v._type === 'IDEF0PortView'), 1)
    expect(syncPorts(k.engine, k.child)).toBe(1)
    expect((k.top['ports'] as Elem[]).map((p) => p['role']).sort()).toEqual(['control', 'input', 'mechanism', 'output'])
    expect(syncPorts(k.engine, k.child)).toBe(0)
    expect(syncPorts(k.engine, k.context)).toBe(0)
  })

  it('toggles tunnels and clears the counterpart of a tunneled port end', () => {
    const k = exampleKit()
    const arrow = (k.top['arrows'] as Elem[]).find((a) => a['name'] === 'Customer Order') as Elem
    toggleTunnel(k.engine, arrow, 'target')
    expect(arrow['tunnelTarget']).toBe(true)
    toggleTunnel(k.engine, arrow, 'target')
    expect(arrow['tunnelTarget']).toBe(false)
    const port = arrow['source'] as Elem
    toggleTunnel(k.engine, arrow, 'source')
    expect(arrow['tunnelSource']).toBe(true)
    expect(port['corresponds']).toBeNull()
    k.engine.undo()
    expect(port['corresponds']).not.toBeNull()
  })
})

describe('box numbering', () => {
  it('numbers a new box with the next free number and undoes with the creation', () => {
    const k = newKit()
    const before = k.engine.undoDepth
    const id = createNodeAt(k.envOf(k.child), k.layoutOf(k.child), 'IDEF0Function', { left: 900, top: 520, width: 0, height: 0 })
    expect(id).not.toBeNull()
    expect(numbers(k.boxes(k.child))).toEqual([1, 2, 3, 4])
    expect(k.engine.undoDepth).toBe(before + 1)
    k.engine.undo()
    expect(numbers(k.boxes(k.child))).toEqual([1, 2, 3])
  })

  it('keeps box numbers when A1 is moved below A2 (regression: moving never renumbers)', () => {
    const k = newKit()
    const [b1, b2] = k.boxes(k.child) as [NodeView, NodeView]
    const [n1, n2] = [fnName(b1), fnName(b2)]
    const depth = k.engine.undoDepth
    moveSelection(k.envOf(k.child), [b1._id], 0, b2.top - b1.top + 300)
    expect(b1.top).toBeGreaterThan(b2.top)
    expect((b1.model as Elem)['boxNumber']).toBe(1)
    expect((b2.model as Elem)['boxNumber']).toBe(2)
    expect(k.boxes(k.child).map(fnName).slice(0, 2)).toEqual([n1, n2])
    expect(k.engine.undoDepth).toBe(depth + 1)
    // Moving it past every other box does not renumber either.
    moveSelection(k.envOf(k.child), [b1._id], 800, 400)
    expect(numbers(k.boxes(k.child))).toEqual([1, 2, 3])
    expect(fnName(k.boxes(k.child)[0] as NodeView)).toBe(n1)
  })

  it('keeps the numbers of a file without autoNumber and follows the staircase only when opted in', () => {
    const k = newKit()
    expect(k.child['autoNumber']).toBe(false)
    const [b1] = k.boxes(k.child) as [NodeView]
    k.child['autoNumber'] = true
    moveSelection(k.envOf(k.child), [b1._id], 800, 400)
    expect(fnName(k.boxes(k.child).at(-1) as NodeView)).toBe(fnName(b1))
    k.engine.undo()
    expect(fnName(k.boxes(k.child)[0] as NodeView)).toBe(fnName(b1))
  })

  it('renumbers along the staircase only on command (Renumber Boxes)', () => {
    const k = newKit()
    const [b1] = k.boxes(k.child) as [NodeView]
    moveSelection(k.envOf(k.child), [b1._id], 800, 400)
    expect(fnName(k.boxes(k.child)[0] as NodeView)).toBe(fnName(b1))
    const depth = k.engine.undoDepth
    expect(renumberBoxes(k.engine, k.child)).toBe(3)
    expect(fnName(k.boxes(k.child).at(-1) as NodeView)).toBe(fnName(b1))
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect(renumberBoxes(k.engine, k.child)).toBe(0)
  })

  it('keeps the title of the child diagram equal to the box name when a box is renamed inline', () => {
    const k = exampleKit()
    const a1 = k.example.a1
    const diagram = decomposeFunction(k.engine, a1, 3)
    expect(diagram['name']).toBe('Receive Order')
    expect(applyQuickEdit(k.engine, { kind: 'name', elementId: a1._id }, 'Accept Order')).toBe(true)
    expect(diagram['name']).toBe('Accept Order')
    // Renaming the top function renames A-0 and A0 together.
    expect(applyQuickEdit(k.engine, { kind: 'name', elementId: k.top._id }, 'Handle Orders')).toBe(true)
    expect(k.context['name']).toBe('Handle Orders')
    expect(k.child['name']).toBe('Handle Orders')
  })

  it('resizing a box keeps numbering consistent', () => {
    const k = newKit()
    const [b1] = k.boxes(k.child) as [NodeView]
    resizeNode(k.envOf(k.child), b1._id, { left: b1.left, top: b1.top, width: 300, height: 120 })
    expect(b1.width).toBe(300)
    expect(numbers(k.boxes(k.child))).toEqual([1, 2, 3])
  })
})

describe('arrow gestures', () => {
  const rolesOf = (k: ReturnType<typeof newKit>) => (k.top['arrows'] as Elem[]).map((a) => `${a['role']}:${a['name']}`)

  it('derives the role from the side the drag came into the box through and refuses the right side', () => {
    const k = newKit()
    const [b1, b2] = k.boxes(k.child) as [NodeView, NodeView]
    const layout = k.layoutOf(k.child)
    const r = layout.nodes.get(b2._id)!.box
    const from = { x: b1.left + b1.width / 2, y: b1.top + b1.height / 2 }
    const [cx, cy, right, bottom] = [r.left + r.width / 2, r.top + r.height / 2, r.left + r.width, r.top + r.height]
    const env = k.envOf(k.child)
    const tool = { kind: 'IDEF0Arrow' }
    const draw = (path: Array<{ x: number; y: number }>) => createIdef0Edge(env, k.layoutOf(k.child), tool, b1._id, b2._id, from, path[path.length - 1]!, [from, ...path])
    // In through the left side, released in the middle: input.
    const onLeft = draw([{ x: r.left - 30, y: cy }, { x: r.left + 40, y: cy }])
    // Down through the top, released near the bottom: control.
    const onTop = draw([{ x: cx, y: r.top - 30 }, { x: cx, y: bottom - 4 }])
    // Around and up through the bottom, released near the top: mechanism.
    const onBottom = draw([{ x: r.left - 30, y: bottom + 30 }, { x: cx, y: bottom + 30 }, { x: cx, y: r.top + 4 }])
    // In through the right side and released next to it: refused (outputs leave there).
    expect(() => draw([{ x: right + 30, y: 700 }, { x: right + 30, y: cy }, { x: right - 4, y: cy }])).toThrow(/right side of a box/)
    expect(onLeft && onTop && onBottom).toBeTruthy()
    expect((k.top['arrows'] as Elem[]).map((a) => a['role'])).toEqual(['input', 'control', 'mechanism'])
    expect(k.engine.undoName).toBe('Create Arrow')
  })

  it('keeps the side the pointer last came in through, near corners and after detours', () => {
    const k = newKit()
    const [b1] = k.boxes(k.child) as [NodeView]
    const r = k.layoutOf(k.child).nodes.get(b1._id)!.box
    const bottom = r.top + r.height
    const env = k.envOf(k.child)
    const tool = { kind: 'IDEF0Arrow' }
    const draw = (path: Array<{ x: number; y: number }>) =>
      createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, path[0]!, path[path.length - 1]!, path)
    // Pressed up-left of the box (not above it), moved right above it, then down into it; released
    // near the bottom-left corner: control.
    draw([{ x: r.left - 60, y: r.top - 50 }, { x: r.left + 30, y: r.top - 50 }, { x: r.left + 30, y: r.top + 10 }, { x: r.left + 6, y: bottom - 6 }])
    // Down into the top right next to the top-left corner, released at the corner: control.
    draw([{ x: r.left + 3, y: r.top - 40 }, { x: r.left + 3, y: r.top + 2 }])
    // In through the top, out through the left, back in through the bottom: mechanism.
    draw([{ x: r.left + 50, y: r.top - 40 }, { x: r.left + 50, y: r.top + 20 }, { x: r.left - 20, y: r.top + 20 }, { x: r.left - 20, y: bottom + 20 }, { x: r.left + 50, y: bottom + 20 }, { x: r.left + 50, y: bottom - 10 }])
    // Released just above the top without getting in: control (the side it was released next to).
    draw([{ x: r.left + 70, y: r.top - 60 }, { x: r.left + 70, y: r.top - 4 }])
    expect((k.top['arrows'] as Elem[]).map((a) => a['role'])).toEqual(['control', 'control', 'mechanism', 'control'])
  })

  it('takes the side a boundary arrow comes from, not where it is released, when drawn straight at a box', () => {
    const k = newKit()
    const [b1, b2] = k.boxes(k.child) as [NodeView, NodeView]
    const env = k.envOf(k.child)
    const tool = { kind: 'IDEF0Arrow' }
    const box = k.layoutOf(k.child).nodes.get(b1._id)!.box
    const x = box.left + 40
    // Dragged up from below the box and released in its upper part, even right at the top edge.
    createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, { x, y: 650 }, { x, y: box.top + box.height / 3 })
    createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, { x: x + 40, y: 650 }, { x: x + 40, y: box.top + 2 })
    // Dragged down from above and released in its lower part.
    createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, { x: x + 80, y: 70 }, { x: x + 80, y: box.top + box.height - 3 })
    // Dragged right from the left and released near the top.
    createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, { x: 40, y: box.top + 20 }, { x: box.left + box.width / 2, y: box.top + 4 })
    expect((k.top['arrows'] as Elem[]).map((a) => a['role'])).toEqual(['mechanism', 'mechanism', 'control', 'input'])
    // The ports sit on the matching edges of the frame, and the parent levels get the same roles.
    expect((k.top['ports'] as Elem[]).map((p) => p['role'])).toEqual(['mechanism', 'mechanism', 'control', 'input'])
    const bottomPorts = k.child.ownedViews.filter((v) => v._type === 'IDEF0PortView' && (v.model as Elem)['role'] === 'mechanism') as NodeView[]
    expect(bottomPorts.every((v) => v.top > box.top + box.height)).toBe(true)
    expect((k.model['arrows'] as Elem[]).map((a) => a['role'])).toEqual(['mechanism', 'mechanism', 'control', 'input'])
    // Off a corner (not straight below, above or beside the box) the release side still decides.
    const box2 = k.layoutOf(k.child).nodes.get(b2._id)!.box
    createIdef0Edge(env, k.layoutOf(k.child), tool, null, b2._id, { x: box2.left - 60, y: 680 }, { x: box2.left + 3, y: box2.top + box2.height / 2 })
    expect((k.top['arrows'] as Elem[]).at(-1)?.['role']).toBe('input')
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('creates boundary ports for an end released or started on empty canvas', () => {
    const k = newKit()
    const [b1, b2] = k.boxes(k.child) as [NodeView, NodeView]
    const env = k.envOf(k.child)
    const tool = { kind: 'IDEF0Arrow' }
    // Output: starts at a box, released on empty canvas.
    const out = createIdef0Edge(env, k.layoutOf(k.child), tool, b2._id, null, { x: 0, y: 0 }, { x: 900, y: 460 })
    expect(out).toBeTruthy()
    // Control: starts on empty canvas above box 1, released on its top.
    const box = k.layoutOf(k.child).nodes.get(b1._id)!.box
    const ctl = createIdef0Edge(env, k.layoutOf(k.child), tool, null, b1._id, { x: box.left + 40, y: 90 }, { x: box.left + 40, y: box.top + 3 })
    expect(ctl).toBeTruthy()
    const ports = k.top['ports'] as Elem[]
    expect(ports.map((p) => p['role'])).toEqual(['output', 'control'])
    // Each new boundary arrow was propagated to the top function on A-0 (same roles).
    expect(ports.every((p) => p['corresponds'] !== null)).toBe(true)
    expect((k.model['arrows'] as Elem[]).map((a) => a['role'])).toEqual(['output', 'control'])
    const outPort = k.child.ownedViews.find((v) => v._type === 'IDEF0PortView' && (v.model as Elem)['role'] === 'output') as NodeView
    expect(outPort.left + 4).toBe(1000)
    expect(rolesOf(k)).toEqual(['output:', 'control:'])
    // Linked ports are not flagged as standing for nothing.
    expect(validateIdef0(k.model).filter((i) => i.id === 'W08')).toHaveLength(0)
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('forks off and joins into an existing arrow', () => {
    const k = exampleKit()
    const [b1, b2, b3] = k.boxes(k.child) as [NodeView, NodeView, NodeView]
    const env = k.envOf(k.child)
    const layout = k.layoutOf(k.child)
    const trunk = arrowView(k.child, 'Validated Order')
    const box3 = layout.nodes.get(b3._id)!.box
    const fork = createIdef0Edge(env, layout, { kind: 'IDEF0Arrow' }, trunk._id, b3._id, { x: 0, y: 0 }, { x: box3.left + 4, y: box3.top + 40 })
    const forkView = k.repository.get(fork!) as View
    expect(forkView['tail']).toBe(trunk)
    expect((forkView.model as Elem)['source']).toBe(trunk.model)
    expect((forkView.model as Elem)['role']).toBe('input')
    const join = createIdef0Edge(env, k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, b2._id, trunk._id, { x: 0, y: 0 }, { x: 344, y: 200 })
    const joinView = k.repository.get(join!) as View
    expect((joinView.model as Elem)['target']).toBe(trunk.model)
    expect((joinView.model as Elem)['role']).toBe('output')
    // A join branch has no arrowhead at the trunk.
    expect(edgeLayoutOf(k.layoutOf(k.child), joinView).headEnd.style).toBe('flat')
    expect(edgeLayoutOf(k.layoutOf(k.child), forkView).headEnd.style).toBe('solidArrow')
    // A branch may not feed back into its own trunk.
    expect(() => createIdef0Edge(env, k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, forkView._id, trunk._id, { x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(/can't end on another arrow/)
    void b1
  })

  it('creates call arrows, one per box', () => {
    const k = newKit()
    const [b1, b2, b3] = k.boxes(k.child) as [NodeView, NodeView, NodeView]
    const env = k.envOf(k.child)
    const tool = { kind: 'IDEF0Call' }
    const first = createIdef0Edge(env, k.layoutOf(k.child), tool, b1._id, b2._id, { x: 0, y: 0 }, { x: 0, y: 0 })
    expect(first).toBeTruthy()
    expect((b1.model as Elem)['calledFunction']).toBe(b2.model)
    expect(() => createIdef0Edge(env, k.layoutOf(k.child), tool, b1._id, b3._id, { x: 0, y: 0 }, { x: 0, y: 0 })).toThrow('This box already has a call arrow')
    const free = createIdef0Edge(env, k.layoutOf(k.child), tool, b3._id, null, { x: 0, y: 0 }, { x: 0, y: 0 })
    expect(free).toBeTruthy()
    expect((k.repository.get(free!) as View)['head']).toBeNull()
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    expect(validateIdef0(k.model).some((i) => i.id === 'W14')).toBe(true)
  })

  it('adds boundary arrows from a box in each role', () => {
    const k = newKit()
    const [b1] = k.boxes(k.child) as [NodeView]
    for (const role of ['input', 'control', 'output', 'mechanism'] as const) expect(addBoundaryArrow(k.envOf(k.child), b1, role)).toBeTruthy()
    expect((k.top['ports'] as Elem[]).map((p) => p['role'])).toEqual(['input', 'control', 'output', 'mechanism'])
    const layout = k.layoutOf(k.child)
    for (const p of k.child.ownedViews.filter((v) => v._type === 'IDEF0PortView')) expect(nodeLayoutOf(layout, p).box.width).toBe(8)
  })

  it('changes the role by dragging the head end to another side of the same box, and refuses the right side', () => {
    const k = exampleKit()
    const env = k.envOf(k.child)
    const view = arrowView(k.child, 'Validated Order')
    const layout = k.layoutOf(k.child)
    const target = view['head'] as NodeView
    const box = layout.nodes.get(target._id)!.box
    expect(reconnectEnd(env, view._id, 'head', target._id, { x: box.left + box.width / 2, y: box.top + 2 })).toBe(true)
    expect((view.model as Elem)['role']).toBe('control')
    expect(reconnectEnd(env, view._id, 'head', target._id, { x: box.left + box.width - 2, y: box.top + box.height / 2 })).toBe(false)
    expect((view.model as Elem)['role']).toBe('control')
    // Re-attach to another box (the third) on its left side.
    const third = k.boxes(k.child)[2] as NodeView
    const box3 = k.layoutOf(k.child).nodes.get(third._id)!.box
    expect(reconnectEnd(env, view._id, 'head', third._id, { x: box3.left + 2, y: box3.top + 40 })).toBe(true)
    expect((view.model as Elem)).toMatchObject({ role: 'input', target: third.model })
    expect(view['head']).toBe(third)
  })
})

describe('deleting', () => {
  it('turns arrows that also reach another box into boundary arrows and drops the rest', () => {
    const k = exampleKit()
    const env = k.envOf(k.child)
    const middle = k.boxes(k.child)[1] as NodeView
    deleteViews(env, [middle._id])
    expect(k.repository.get(middle.model!._id)).toBeUndefined()
    const arrows = k.top['arrows'] as Elem[]
    // "Validated Order" now enters from a new boundary port; "Approved Order" leaves to a new output port.
    const validated = arrows.find((a) => a['name'] === 'Validated Order') as Elem
    const approved = arrows.find((a) => a['name'] === 'Approved Order') as Elem
    expect(isKindOf(approved['source'] as Elem, 'IDEF0Port')).toBe(true)
    expect(isKindOf(validated['source'] as Elem, 'IDEF0Function')).toBe(true)
    expect(isKindOf(validated['target'] as Elem, 'IDEF0Port')).toBe(true)
    // The control fork branch to the deleted box is gone, the box numbers close up.
    expect(arrows.filter((a) => a['role'] === 'control')).toHaveLength(2)
    expect(numbers(k.boxes(k.child))).toEqual([1, 2])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    k.engine.undo()
    expect(k.repository.get(middle.model!._id)).toBeDefined()
    expect(numbers(k.boxes(k.child))).toEqual([1, 2, 3])
  })

  it('promotes the first branch when a trunk is deleted', () => {
    const k = exampleKit()
    const trunk = arrowView(k.child, 'Sales Policy')
    const trunkModel = trunk.model as Elem
    const branches = (k.top['arrows'] as Elem[]).filter((a) => a['source'] === trunkModel)
    expect(branches).toHaveLength(1)
    deleteViews(k.envOf(k.child), [trunk._id])
    expect(k.repository.get(trunkModel._id)).toBeUndefined()
    const branch = branches[0] as Elem
    expect(k.repository.get(branch._id)).toBeDefined()
    expect(isKindOf(branch['source'] as Elem, 'IDEF0Port')).toBe(true)
    const next = (k.top['arrows'] as Elem[]).find((a) => a['source'] === branch) as Elem
    expect(next).toBeDefined()
    const view = k.repository.viewsOf(branch)[0] as View
    expect((view['tail'] as View).model).toBe(branch['source'])
    expect(validateModel(k.repository.project as Elem)).toEqual([])
  })

  it('deletes a port with its arrows and never deletes the frame or the only box of A-0', () => {
    const k = exampleKit()
    const port = k.child.ownedViews.find((v) => v._type === 'IDEF0PortView') as View
    const frame = k.child.ownedViews[0] as View
    deleteViews(k.envOf(k.child), [port._id, frame._id])
    expect(k.repository.get(port.model!._id)).toBeUndefined()
    expect(k.repository.get(frame._id)).toBeDefined()
    expect((k.top['arrows'] as Elem[]).some((a) => a['name'] === 'Customer Order')).toBe(false)
    const topView = k.context.ownedViews.find((v) => v._type === 'IDEF0FunctionView') as View
    deleteViews(k.envOf(k.context as Diagram), [topView._id])
    expect(k.repository.get(topView._id)).toBeDefined()
  })

  it('removes an unused boundary port together with its only arrow', () => {
    const k = newKit()
    const [b1] = k.boxes(k.child) as [NodeView]
    const id = addBoundaryArrow(k.envOf(k.child), b1, 'input')!
    deleteViews(k.envOf(k.child), [id])
    expect(k.top['ports'] as Elem[]).toHaveLength(0)
    expect(k.top['arrows'] as Elem[]).toHaveLength(0)
  })
})
