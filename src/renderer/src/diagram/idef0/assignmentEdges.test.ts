import { describe, expect, it } from 'vitest'
import { writeMdj } from '../../format'
import { functionViewsOf, type Elem, type View } from '../../model'
import { assignParentArrow } from './assignment'
import { addBoundaryArrow, toggleTunnel } from './decompose'
import { pendingPorts } from './pending'
import { measurer, newKit } from './testkit'
import { validateIdef0 } from './validate'

type Role = 'input' | 'control' | 'output' | 'mechanism'

/** A new model whose A-0 box has one named arrow per role, each pending on A0. */
function parentArrows() {
  const k = newKit()
  const top = functionViewsOf(k.context)[0] as View
  const arrows = new Map<Role, Elem>()
  for (const role of ['input', 'control', 'output', 'mechanism'] as Role[]) {
    const id = addBoundaryArrow(k.envOf(k.context), top, role) as string
    const arrow = (k.repository.get(id) as View).model as Elem
    k.engine.transact('Name', (b) => b.set(arrow, 'name', role))
    arrows.set(role, arrow)
  }
  const port = (role: Role): Elem => (k.top['ports'] as Elem[]).find((p) => p['role'] === role) as Elem
  const box = (n: number): Elem => k.boxes(k.child)[n - 1]!.model as Elem
  return { ...k, parent: (role: Role) => arrows.get(role) as Elem, port, box }
}

const linkedPorts = (k: ReturnType<typeof parentArrows>, role: Role): Elem[] => (k.top['ports'] as Elem[]).filter((p) => p['corresponds'] === k.parent(role))
const w19 = (k: ReturnType<typeof parentArrows>): string[] => validateIdef0(k.model).filter((i) => i.id === 'W19').map((i) => i.message)

describe('a parent arrow tunneled at the decomposed box', () => {
  it('takes its pending arrow off the child diagram, and untunneling brings it back', () => {
    const k = parentArrows()
    const before = writeMdj(k.repository.project as Elem)
    toggleTunnel(k.engine, k.parent('control'), 'target', measurer)
    expect(pendingPorts(k.child).map((p) => p['role'])).not.toContain('control')
    expect(linkedPorts(k, 'control')).toEqual([])
    expect(w19(k).some((m) => m.includes('"control"'))).toBe(false)
    k.engine.undo()
    expect(writeMdj(k.repository.project as Elem)).toBe(before)
    k.engine.redo()
    toggleTunnel(k.engine, k.parent('control'), 'target', measurer)
    expect(linkedPorts(k, 'control')).toHaveLength(1)
    expect(pendingPorts(k.child).map((p) => p['role'])).toContain('control')
  })

  it('keeps a tunneled output end connected below as it is (only pending ports go)', () => {
    const k = parentArrows()
    assignParentArrow(k.envOf(k.child), k.port('output'), [k.box(3)])
    toggleTunnel(k.engine, k.parent('output'), 'source', measurer)
    expect(linkedPorts(k, 'output')).toHaveLength(1)
    expect(pendingPorts(k.child).map((p) => p['role'])).not.toContain('output')
  })
})
