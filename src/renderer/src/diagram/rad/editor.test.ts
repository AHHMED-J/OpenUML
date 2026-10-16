import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteFromModel, deleteFromView } from '../../commands'
import { isKindOf, setRadAutoThread, type Elem, type NodeView, type View } from '../../model'
import { createEdgeBetween, createNodeAt, findDropContainer, moveSelection, reconnectEnd, type DiagramEnv } from '../editor/actions'
import { SelectionOverlay } from '../editor/Overlays'
import { applyQuickEdit } from '../editor/quickEditApply'
import { hitTestDiagram } from '../editor/hitTest'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { RadBuilder, insuranceFixture, letterFixture } from './fixtures'

afterEach(() => setRadAutoThread(true))

function env(b: RadBuilder): DiagramEnv {
  return { engine: b.engine, diagram: b.diagram, measurer: b.measurer }
}

function layout(b: RadBuilder) {
  return computeDiagramLayout(b.diagram, b.repository, b.measurer)
}

/** Two empty roles side by side with a column of three activities in the first. */
function twoRoles(): RadBuilder {
  const b = new RadBuilder()
  b.role('r1', { left: 0, top: 0, width: 300, height: 400, agent: 'One', name: 'Doing one thing' })
  b.role('r2', { left: 400, top: 0, width: 300, height: 400, agent: 'Two', name: 'Doing another thing' })
  b.el('a', 'r1', 'RADActivity', 0, 0, 'A')
  b.el('b', 'r1', 'RADActivity', 0, 1, 'B')
  b.el('c', 'r1', 'RADInteraction', 0, 2, 'C')
  b.el('x', 'r2', 'RADInteraction', 0, 0, 'X')
  b.line('a', 'b')
  b.line('b', 'c')
  return b.done()
}

describe('creating in a role', () => {
  it('puts a clicked element into the role under the cursor, owned by the role', () => {
    const b = twoRoles()
    const before = (b.roles.get('r2')?.model['elements'] as Elem[]).length
    const id = createNodeAt(env(b), layout(b), 'RADActivity', { left: 500, top: 200, width: 0, height: 0 })
    expect(id).not.toBeNull()
    const view = b.repository.get(id as string) as NodeView
    expect(view.containerView).toBe(b.roles.get('r2')?.view)
    expect(view.model?._parent).toBe(b.roles.get('r2')?.model)
    expect((b.roles.get('r2')?.model['elements'] as Elem[]).length).toBe(before + 1)
    expect(b.roles.get('r2')?.view.containedViews).toContain(view)
  })

  it('refuses elements on the bare canvas but creates roles there', () => {
    const b = twoRoles()
    const count = b.diagram.ownedViews.length
    const warn = console.warn
    console.warn = () => undefined
    try {
      expect(createNodeAt(env(b), layout(b), 'RADActivity', { left: 900, top: 900, width: 0, height: 0 })).toBeNull()
    } finally {
      console.warn = warn
    }
    expect(b.diagram.ownedViews.length).toBe(count)
    const role = createNodeAt(env(b), layout(b), 'RADRole', { left: 900, top: 100, width: 200, height: 300 })
    expect(role).not.toBeNull()
    expect((b.repository.get(role as string) as NodeView).model?._parent).toBe(b.process)
  })

  it('creates a role by dragging a rectangle with that size, even over another role', () => {
    const b = twoRoles()
    const id = createNodeAt(env(b), layout(b), 'RADRole', { left: 100, top: 50, width: 200, height: 250 })
    const view = b.repository.get(id as string) as NodeView
    expect(view.containerView ?? null).toBeNull()
    expect([view.left, view.top, view.width, view.height]).toEqual([100, 50, 200, 250])
  })

  it('threads a new element in the same single undo step when auto-thread is on', () => {
    const b = twoRoles()
    setRadAutoThread(true)
    const lines = (): number => (b.roles.get('r1')?.model['stateLines'] as Elem[]).length
    const before = lines()
    // Below the interaction C (column x = 12): within 12 horizontally, under it.
    const id = createNodeAt(env(b), layout(b), 'RADActivity', { left: 52 - 12, top: 42 + 3 * 70 - 12, width: 0, height: 0 })
    expect(id).not.toBeNull()
    expect(lines()).toBe(before + 1)
    b.engine.undo()
    expect(lines()).toBe(before)
    expect((b.roles.get('r1')?.model['elements'] as Elem[]).length).toBe(3)
    b.engine.redo()
    expect(lines()).toBe(before + 1)
  })
})

describe('containment', () => {
  it('drops onto the role under the cursor and not onto the canvas', () => {
    const b = twoRoles()
    const l = layout(b)
    const x = b.v('x')
    expect(findDropContainer(env(b), l, { x: 100, y: 250 }, [x])).toBe(b.roles.get('r1')?.view)
    expect(findDropContainer(env(b), l, { x: 900, y: 900 }, [x])).toBeNull()
    // A role is never dropped into another role.
    expect(findDropContainer(env(b), l, { x: 100, y: 250 }, [b.roles.get('r2')?.view as View])).toBeNull()
  })

  it('moving a role moves its elements, which keep their lines', () => {
    const b = twoRoles()
    const before = layout(b)
    const a0 = before.nodes.get(b.v('a')._id)?.box
    const role = b.roles.get('r1')?.view as NodeView
    moveSelection(env(b), [role._id], 40, 30)
    const after = layout(b)
    const a1 = after.nodes.get(b.v('a')._id)?.box
    expect([a1?.left, a1?.top]).toEqual([(a0?.left ?? 0) + 40, (a0?.top ?? 0) + 30])
    expect(after.nodes.get(role._id)?.box.left).toBe((before.nodes.get(role._id)?.box.left ?? 0) + 40)
    const line = after.edges.get(b.e('a', 'b')._id)
    expect(line?.points[0]?.x).toBe((a1?.left ?? 0) + 12)
  })

  it('reparents an element dragged into another role: the model moves and lines that would cross roles go, in one step', () => {
    const b = twoRoles()
    const r1 = b.roles.get('r1')?.model as Elem
    const r2 = b.roles.get('r2')?.model as Elem
    const lineViewAB = b.e('a', 'b')
    const lineViewBC = b.e('b', 'c')
    moveSelection(env(b), [b.v('b')._id], 400, 0, { container: b.roles.get('r2')?.view as View })
    expect(b.v('b').model?._parent).toBe(r2)
    expect((r1['elements'] as Elem[]).map((e) => e['name'])).toEqual(['A', 'C'])
    expect((r2['elements'] as Elem[]).map((e) => e['name'])).toEqual(['X', 'B'])
    expect(b.v('b').containerView).toBe(b.roles.get('r2')?.view)
    expect(r1['stateLines']).toEqual([])
    expect(b.repository.has(lineViewAB._id)).toBe(false)
    expect(b.repository.has(lineViewBC._id)).toBe(false)
    b.engine.undo()
    expect(b.v('b').model?._parent).toBe(r1)
    expect(b.v('b').containerView).toBe(b.roles.get('r1')?.view)
    expect((r1['stateLines'] as Elem[]).length).toBe(2)
    expect(b.repository.has(lineViewAB._id)).toBe(true)
  })

  it('removes an interaction link that would join a role to itself when an interaction moves into its partner role', () => {
    const b = twoRoles()
    b.link('c', 'x')
    moveSelection(env(b), [b.v('c')._id], 400, 0, { container: b.roles.get('r2')?.view as View })
    expect(b.process['interactions']).toEqual([])
    expect(b.v('c').model?._parent).toBe(b.roles.get('r2')?.model)
  })

  it('detaches branches from a refinement that moves to another role', () => {
    const b = twoRoles()
    b.refinement('q', 'r1', 'RADCaseRefinement', 1, 3, 'Fine?', [{ key: 'y', col: 2, name: 'Yes' }, { key: 'n', col: 3, name: 'No' }])
    moveSelection(env(b), [b.v('q')._id], 400, 0, { container: b.roles.get('r2')?.view as View })
    expect(b.v('y').model?.['refinement']).toBeNull()
    expect(b.v('q').model?._parent).toBe(b.roles.get('r2')?.model)
  })

  it('keeps an element in its role when it is dropped outside every role', () => {
    const b = twoRoles()
    const view = b.v('a') as NodeView
    const role = b.roles.get('r1')?.view as NodeView
    moveSelection(env(b), [view._id], 900, 600, { container: null })
    expect(view.containerView).toBe(role)
    expect(role.containedViews).toContain(view)
    expect(view.model?._parent).toBe(b.roles.get('r1')?.model)
    // The role grew to follow it instead.
    const l = layout(b)
    const r = l.nodes.get(role._id)?.box
    expect((r?.left ?? 0) + (r?.width ?? 0)).toBeGreaterThanOrEqual(view.left + 24)
    expect((r?.top ?? 0) + (r?.height ?? 0)).toBeGreaterThanOrEqual(view.top + 24)
  })
})

describe('connecting', () => {
  it('creates state lines and interaction links with the line tools and refuses invalid pairs', () => {
    const b = twoRoles()
    const l = layout(b)
    const e = env(b)
    expect(createEdgeBetween(e, l, { kind: 'RADStateLine' }, b.v('a')._id, b.v('x')._id, { x: 0, y: 0 })).toBeNull()
    const link = createEdgeBetween(e, l, { kind: 'RADInteractionLink' }, b.v('c')._id, b.v('x')._id, { x: 0, y: 0 })
    expect(link).not.toBeNull()
    expect(createEdgeBetween(e, layout(b), { kind: 'RADInteractionLink' }, b.v('x')._id, b.v('c')._id, { x: 0, y: 0 })).toBeNull()
    const line = createEdgeBetween(e, layout(b), { kind: 'RADStateLine' }, b.v('c')._id, b.v('a')._id, { x: 0, y: 0 })
    expect(line).not.toBeNull()
    expect((b.repository.get(line as string) as View).model?.['loopBack']).toBe(true)
  })

  it('reconnects the end of a state line inside the role only', () => {
    const b = twoRoles()
    const line = b.e('a', 'b')
    expect(reconnectEnd(env(b), line._id, 'head', b.v('x')._id)).toBe(false)
    expect(reconnectEnd(env(b), line._id, 'head', b.v('c')._id)).toBe(true)
    expect(line.model?.['target']).toBe(b.v('c').model)
    b.engine.undo()
    expect(line.model?.['target']).toBe(b.v('b').model)
  })
})

describe('deleting', () => {
  it('deleting a role view leaves the model, deleting the role removes its elements, lines and links', () => {
    const b = letterFixture()
    const boss = b.roles.get('boss') as { view: NodeView; model: Elem }
    deleteFromView(b.engine, [b.v('b1')])
    expect(b.repository.has(b.v('b1')._id)).toBe(false)
    expect(b.repository.has(b.v('b1').model?._id ?? '')).toBe(true)
    expect(b.repository.has(b.e('b1', 'b2')._id)).toBe(false)
    deleteFromModel(b.engine, [boss.model])
    expect(b.repository.has(boss.view._id)).toBe(false)
    expect(b.repository.has(b.v('b4')._id)).toBe(false)
    expect(b.repository.has(b.k('b2', 's1')._id)).toBe(false)
    expect(b.repository.has(b.k('s5', 'b3')._id)).toBe(false)
    expect(b.process['interactions']).toEqual([])
    expect((b.process['roles'] as Elem[]).length).toBe(1)
    b.engine.undo()
    expect((b.process['roles'] as Elem[]).length).toBe(2)
    expect((b.process['interactions'] as Elem[]).length).toBe(2)
  })
})

describe('quick edit', () => {
  it('edits the role header as Agent- Role and an element name verbatim', () => {
    const b = insuranceFixture()
    const role = b.roles.get('agent')?.model as Elem
    expect(applyQuickEdit(b.engine, { kind: 'custom', elementId: role._id, syntax: 'radRoleTitle' }, 'Clerk- Reviewing applications')).toBe(true)
    expect(role).toMatchObject({ agent: 'Clerk', name: 'Reviewing applications' })
    expect(applyQuickEdit(b.engine, { kind: 'custom', elementId: role._id, syntax: 'radRoleTitle' }, 'Archiving files')).toBe(true)
    expect(role).toMatchObject({ agent: 'Clerk', name: 'Archiving files' })
    const act = b.v('a2').model as Elem
    expect(applyQuickEdit(b.engine, { kind: 'custom', elementId: act._id, syntax: 'radName' }, '- Review <<it>> now\n')).toBe(true)
    expect(act['name']).toBe('- Review <<it>> now')
    expect(act['stereotype']).toBeFalsy()
    b.engine.undo()
    expect(act['name']).toBe('Create a customer record')
    // External party and goal are plain fields.
    const c = b.v('c1').model as Elem
    expect(applyQuickEdit(b.engine, { kind: 'field', elementId: c._id, field: 'externalParty' }, ' Broker ')).toBe(true)
    expect(c['externalParty']).toBe('Broker')
    expect(isKindOf(c, 'RADInteraction')).toBe(true)
  })
})

describe('editor surfaces', () => {
  it('hits an element by its label and opens the label for editing', () => {
    const b = insuranceFixture()
    const l = layout(b)
    const n = l.nodes.get(b.v('a2')._id)
    const label = n && (n.data as { lines: Array<{ box: { left: number; top: number; width: number; height: number } }> }).lines[0]
    expect(label).toBeTruthy()
    const p = { x: (label?.box.left ?? 0) + 5, y: (label?.box.top ?? 0) + 5 }
    const hit = hitTestDiagram(l, p, { selected: new Set(), zoom: 1 })
    expect(hit).toMatchObject({ kind: 'node', viewId: b.v('a2')._id })
    expect(hit?.kind === 'node' ? hit.region?.target : null).toEqual({ kind: 'custom', elementId: b.v('a2').model?._id, syntax: 'radName' })
    // Inside the role but off every label and thread, the role itself is hit; its title is a region of it.
    const role = b.roles.get('agent')?.view as NodeView
    expect(hitTestDiagram(l, { x: (role.left ?? 0) + 15, y: (role.top ?? 0) + 300 }, { selected: new Set(), zoom: 1 })).toMatchObject({ kind: 'node', viewId: role._id })
    const title = l.nodes.get(role._id)?.regions[0]
    expect(title && hitTestDiagram(l, { x: title.box.left + 2, y: title.box.top + 2 }, { selected: new Set(), zoom: 1 })).toMatchObject({ kind: 'node', viewId: role._id, region: { target: { syntax: 'radRoleTitle' } } })
    // A thread is hit on its line, above the role it crosses.
    const line = l.edges.get(b.e('a1', 'a2')._id)
    const mid = line && { x: line.points[0]?.x ?? 0, y: ((line.points[0]?.y ?? 0) + (line.points[1]?.y ?? 0)) / 2 }
    expect(mid && hitTestDiagram(l, mid, { selected: new Set(), zoom: 1 })).toMatchObject({ kind: 'edge', viewId: b.e('a1', 'a2')._id })
  })

  it('draws the selection overlay for every view of the examples', () => {
    for (const make of [insuranceFixture, letterFixture]) {
      const b = make()
      const l = layout(b)
      const html = renderToStaticMarkup(createElement('svg', null, createElement(SelectionOverlay, { layout: l, selected: [...l.nodes.keys(), ...l.edges.keys()], zoom: 1 })))
      expect(html.length).toBeGreaterThan(100)
    }
  })
})

describe('moving a refinement with its branches', () => {
  function parallel(): RadBuilder {
    const b = new RadBuilder()
    b.role('r', { left: 0, top: 0, width: 600, height: 500, agent: 'A', name: 'Working in parallel' })
    b.refinement('split', 'r', 'RADPartRefinement', 0, 1, 'Split', [
      { key: 'p1', col: 1, name: 'one' },
      { key: 'p2', col: 2, name: 'two' }
    ])
    b.el('other', 'r', 'RADActivity', 0, 3, 'Other')
    return b.done()
  }
  const pos = (v: View): string => `${(v as NodeView).left},${(v as NodeView).top}`

  it('moves the circle and every branch when any of them is dragged', () => {
    for (const key of ['p1', 'split']) {
      const b = parallel()
      const [split, p1, p2, other] = ['split', 'p1', 'p2', 'other'].map((k) => b.v(k)) as [View, View, View, View]
      const before = [split, p1, p2].map((v) => (v as NodeView).left)
      const otherBefore = pos(other)
      moveSelection(env(b), [b.v(key)._id], 40, 16, undefined, layout(b))
      expect([split, p1, p2].map((v) => (v as NodeView).left)).toEqual(before.map((x) => x + 40))
      expect(pos(other)).toBe(otherBefore)
    }
  })

  it('moves one branch alone with Option/Alt (to space the paths)', () => {
    const b = parallel()
    const [split, p1, p2] = ['split', 'p1', 'p2'].map((k) => b.v(k)) as [View, View, View]
    const [s0, p10] = [pos(split), pos(p1)]
    const p2x = (p2 as NodeView).left
    moveSelection(env(b), [p2._id], 40, 0, undefined, layout(b), { alone: true })
    expect((p2 as NodeView).left).toBe(p2x + 40)
    expect([pos(split), pos(p1)]).toEqual([s0, p10])
  })

  it('is one undo step', () => {
    const b = parallel()
    const p1 = b.v('p1')
    const split = b.v('split')
    const before = pos(split)
    moveSelection(env(b), [p1._id], 40, 16, undefined, layout(b))
    b.engine.undo()
    expect(pos(split)).toBe(before)
  })
})
