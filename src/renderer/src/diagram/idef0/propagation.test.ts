import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../../format'
import { boxArrowGroups, icomCodes, type Diagram, type Elem, type Idef0Role, type NodeView, type View } from '../../model'
import { addBoundaryArrow, decomposeFunction, syncPorts, toggleTunnel } from './decompose'
import { createIdef0Edge } from './gestures'
import { propagateUp } from './propagation'
import { exampleKit, measurer, newKit, type IdefKit } from './testkit'
import { validateIdef0 } from './validate'

/** 1-based position of `arrow` among the arrows of `role` at `fn` (0 when it is not attached there). */
function arrowPositionAt(arrow: Elem, fn: Elem, role: Idef0Role): number {
  const group = boxArrowGroups(fn).find((g) => g.role === role)
  return (group?.arrows.indexOf(arrow) ?? -1) + 1
}

const arrows = (scope: Elem): Elem[] => scope['arrows'] as Elem[]
const ports = (scope: Elem): Elem[] => scope['ports'] as Elem[]
const snapshot = (k: IdefKit): string => writeMdj(k.repository.project as Elem)
const boxesOf = (k: IdefKit, diagram: Elem): NodeView[] => k.boxes(diagram as Diagram)

/** Draws an input boundary arrow from the left edge of the drawing area (port at height `y`) to the left side of `box`. */
function drawInput(k: IdefKit, diagram: Elem, box: NodeView, y = box.top + box.height / 2): string | null {
  const d = diagram as Diagram
  // Pressed on empty canvas at height `y` (where the port goes), released on the box's left side.
  return createIdef0Edge(k.envOf(d), k.layoutOf(d), { kind: 'IDEF0Arrow' }, null, box._id, { x: 60, y }, { x: box.left + 3, y: box.top + box.height / 2 })
}

/** The arrow of a newly drawn view. */
const modelOfView = (k: IdefKit, id: string | null): Elem => (k.repository.get(id as string) as View).model as Elem

describe('upward propagation of boundary arrows', () => {
  it('adds the matching arrow to the top function on A-0 for a boundary arrow drawn on A0 (one level, one undo step)', () => {
    const k = newKit()
    const before = snapshot(k)
    const depth = k.engine.undoDepth
    const [b1] = boxesOf(k, k.child) as [NodeView]
    const arrow = modelOfView(k, drawInput(k, k.child, b1))
    const port = arrow['source'] as Elem
    const parent = port['corresponds'] as Elem
    expect(parent).toBeTruthy()
    expect(parent._parent).toBe(k.model)
    expect(parent).toMatchObject({ role: 'input', target: k.top })
    // The parent arrow is drawn on A-0 from a new boundary port, routed and with its label view.
    const views = k.repository.viewsOf(parent)
    expect(views).toHaveLength(1)
    expect(k.repository.diagramOf(views[0] as Elem)).toBe(k.context)
    expect(((views[0] as Elem)['points'] as unknown[]).length).toBeGreaterThanOrEqual(2)
    expect((parent['source'] as Elem)['corresponds']).toBeNull()
    expect(icomCodes(k.child).get(port._id)).toBe('I1')
    expect(k.engine.undoDepth).toBe(depth + 1)
    k.engine.undo()
    expect(snapshot(k)).toBe(before)
  })

  it('propagates level by level up to A-0 in one undo step, with consistent ICOM codes', () => {
    const k = exampleKit()
    const a2 = k.example.a2
    const child = decomposeFunction(k.engine, a2, 3)
    const before = snapshot(k)
    const depth = k.engine.undoDepth
    const [c1] = boxesOf(k, child) as [NodeView]
    // Below the port of "Validated Order" (the input A2 already has).
    const arrow = modelOfView(k, drawInput(k, child, c1, 600))
    const port = arrow['source'] as Elem
    const onA0 = port['corresponds'] as Elem
    expect(onA0).toMatchObject({ role: 'input', target: a2 })
    expect(onA0._parent).toBe(k.top)
    const portA0 = onA0['source'] as Elem
    const onContext = portA0['corresponds'] as Elem
    expect(onContext).toMatchObject({ role: 'input', target: k.top })
    expect(onContext._parent).toBe(k.model)
    // ICOM codes follow the order at the parent box: below "Validated Order" means I2 at A2.
    expect(arrowPositionAt(onA0, a2, 'input')).toBe(2)
    expect(icomCodes(child).get(port._id)).toBe('I2')
    expect(icomCodes(k.child).get(portA0._id)).toBe(`I${arrowPositionAt(onContext, k.top, 'input')}`)
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect(validateModel(k.repository.project as Elem)).toEqual([])
    k.engine.undo()
    expect(snapshot(k)).toBe(before)
    // Redo re-creates the elements (fresh objects with the same ids) and their links.
    k.engine.redo()
    expect(((k.repository.get(port._id) as Elem)['corresponds'] as Elem)._id).toBe(onA0._id)
  })

  it('maps the boundary side to the role at the parent box', () => {
    const k = exampleKit()
    const a3 = k.example.a3
    const child = decomposeFunction(k.engine, a3, 3)
    const [c1] = boxesOf(k, child) as [NodeView]
    const roles = ['input', 'control', 'output', 'mechanism'] as const
    for (const role of roles) addBoundaryArrow(k.envOf(child as Diagram), c1, role)
    const added = ports(a3).slice(-4)
    expect(added.map((p) => p['role'])).toEqual([...roles])
    const parents = added.map((p) => p['corresponds'] as Elem)
    expect(parents.map((a) => a['role'])).toEqual([...roles])
    expect(parents.slice(0, 2).every((a) => a['target'] === a3)).toBe(true)
    expect(parents[2]?.['source']).toBe(a3)
    expect(parents[3]?.['target']).toBe(a3)
    // Each counterpart is itself linked one level up, to the top function on A-0.
    const parentPorts = parents.map((a) => (a['source'] === a3 ? a['target'] : a['source']) as Elem)
    expect(parentPorts.map((p) => (p['corresponds'] as Elem | null)?._parent)).toEqual([k.model, k.model, k.model, k.model])
  })

  it('names the parent arrows after a named boundary arrow', () => {
    const k = newKit()
    const [b1] = boxesOf(k, k.child) as [NodeView]
    const arrow = modelOfView(k, drawInput(k, k.child, b1))
    k.engine.transact('Name', (b) => b.set(arrow, 'name', 'Order Form'))
    // Tunnel and untunnel the unconnected end: the counterpart is re-created from the named arrow.
    toggleTunnel(k.engine, arrow, 'source', measurer)
    toggleTunnel(k.engine, arrow, 'source', measurer)
    expect(((arrow['source'] as Elem)['corresponds'] as Elem)['name']).toBe('Order Form')
  })

  it('does not propagate a boundary arrow tunneled at its unconnected end', () => {
    const k = newKit()
    const [b1] = boxesOf(k, k.child) as [NodeView]
    const arrow = modelOfView(k, drawInput(k, k.child, b1))
    const port = arrow['source'] as Elem
    k.engine.transact('Unlink', (b) => {
      b.set(arrow, 'tunnelSource', true)
      b.set(port, 'corresponds', null)
    })
    expect(k.engine.transact('Propagate', (b) => propagateUp(b, { engine: k.engine, measurer }, port))).toEqual([])
  })

  it('removes the parent counterparts when the arrow is tunneled, in one undo step, and restores them when untunneled', () => {
    const k = exampleKit()
    const a2 = k.example.a2
    const child = decomposeFunction(k.engine, a2, 3)
    const [c1] = boxesOf(k, child) as [NodeView]
    const arrow = modelOfView(k, drawInput(k, child, c1, 600))
    const port = arrow['source'] as Elem
    const onA0 = port['corresponds'] as Elem
    const onContext = (onA0['source'] as Elem)['corresponds'] as Elem
    const before = snapshot(k)
    const depth = k.engine.undoDepth
    const counts = [arrows(k.top).length, arrows(k.model).length]
    toggleTunnel(k.engine, arrow, 'source', measurer)
    expect(arrow['tunnelSource']).toBe(true)
    expect(port['corresponds']).toBeNull()
    expect(k.repository.get(onA0._id)).toBeUndefined()
    expect(k.repository.get(onContext._id)).toBeUndefined()
    expect([arrows(k.top).length, arrows(k.model).length]).toEqual([counts[0]! - 1, counts[1]! - 1])
    // A tunneled boundary arrow is not a dangling one.
    expect(validateIdef0(k.model).filter((i) => i.elementId === port._id)).toEqual([])
    expect(k.engine.undoDepth).toBe(depth + 1)
    k.engine.undo()
    expect(snapshot(k)).toBe(before)
    k.engine.redo()
    toggleTunnel(k.engine, arrow, 'source', measurer)
    expect(arrow['tunnelSource']).toBe(false)
    const again = port['corresponds'] as Elem
    expect(again).toMatchObject({ role: 'input', target: a2 })
    expect(((again['source'] as Elem)['corresponds'] as Elem | null)?.['target']).toBe(k.top)
  })

  it('agrees with the downward synchronization: no duplicates, idempotent', () => {
    const k = exampleKit()
    const a1 = k.example.a1
    const child = decomposeFunction(k.engine, a1, 3)
    const [c1] = boxesOf(k, child) as [NodeView]
    const arrow = modelOfView(k, drawInput(k, child, c1, 500))
    const port = arrow['source'] as Elem
    const counts = (): number[] => [ports(a1).length, ports(k.top).length, ports(k.model).length, arrows(k.top).length, arrows(k.model).length]
    const after = counts()
    expect(syncPorts(k.engine, child)).toBe(0)
    expect(syncPorts(k.engine, k.child)).toBe(0)
    expect(k.engine.transact('Again', (b) => propagateUp(b, { engine: k.engine, measurer }, port))).toEqual([])
    expect(counts()).toEqual(after)
    // Every level is consistent: no unlinked port, no parent arrow without its boundary arrow.
    expect(validateIdef0(k.model).filter((i) => ['W08', 'W09'].includes(i.id))).toEqual([])
  })

  it('round-trips a propagated model through .mdj unchanged', () => {
    const k = exampleKit()
    const child = decomposeFunction(k.engine, k.example.a2, 3)
    const [c1] = boxesOf(k, child) as [NodeView]
    drawInput(k, child, c1, 600)
    const text = snapshot(k)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(validateModel(back.project)).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
  })
})
