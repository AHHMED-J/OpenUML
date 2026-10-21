import { describe, expect, it } from 'vitest'
import { applyPlan } from '../../commands'
import { listField, planBoundaryArrow, roleOf, type Diagram, type Elem, type NodeView, type View } from '../../model'
import type { Rect } from '../core'
import { withGeometry } from '../editor/actions'
import { addBoundaryArrow, decomposeFunction } from './decompose'
import { createIdef0Edge } from './gestures'
import type { PortData } from './layout'
import { packAlong, spreadBoundaryArrows } from './spread'
import { newKit, type IdefKit } from './testkit'

const ARROW = { kind: 'IDEF0Arrow' }

const hit = (a: Rect, b: Rect): boolean => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

/** Pairs of boundary ports of `diagram` whose square, ICOM code or pending name overlap, as "C1×C2". */
function clashes(k: IdefKit, diagram: Diagram): string[] {
  const layout = k.layoutOf(diagram)
  const ports = diagram.ownedViews
    .filter((v) => v._type === 'IDEF0PortView')
    .map((v) => {
      const node = layout.nodes.get(v._id)!
      const data = node.data as PortData
      const rects = [node.box, ...(data.codeLine ? [data.codeLine.box] : []), ...(data.pending?.label ? [data.pending.label.box] : [])]
      return { name: data.codeLine?.text ?? `${roleOf((v as View).model as Elem)}:${v._id.slice(-4)}`, rects }
    })
  const out: string[] = []
  ports.forEach((p, i) => {
    for (const q of ports.slice(i + 1)) if (p.rects.some((r) => q.rects.some((s) => hit(r, s)))) out.push(`${p.name}×${q.name}`)
  })
  return out
}

function boxView(diagram: Diagram, number: number): NodeView {
  return diagram.ownedViews.find((v) => v._type === 'IDEF0FunctionView' && (v.model as Elem)['boxNumber'] === number) as NodeView
}

/** A0 with its box 2 decomposed (A2): the three levels the arrows propagate through. */
function threeLevels(): { k: IdefKit; a2: Diagram } {
  const k = newKit()
  const fn2 = boxView(k.child, 2).model as Elem
  return { k, a2: decomposeFunction(k.engine, fn2, 3) }
}

/** Ports of `diagram` along their edge, in edge order. */
function portsAlong(diagram: Diagram, role: string): NodeView[] {
  const vertical = role === 'input' || role === 'output'
  return (diagram.ownedViews.filter((v) => v._type === 'IDEF0PortView' && roleOf((v as View).model as Elem) === role) as NodeView[]).sort((a, b) =>
    vertical ? a.top - b.top : a.left - b.left
  )
}

describe('boundary ports placed by an edit get their own place on the frame edge', () => {
  it('gives every arrow propagated to the parent sheets its own slot (no stacked codes on A0 or A-0)', () => {
    const { k, a2 } = threeLevels()
    const env = k.envOf(a2)
    const box = boxView(a2, 1)
    // Boundary arrows drawn from the frame edge into box 1 of A2, a little apart from each other.
    for (let i = 0; i < 4; i++) {
      const x = box.left + 12 + i * 24
      createIdef0Edge(env, k.layoutOf(a2), ARROW, null, box._id, { x, y: 70 }, { x, y: box.top + 2 })
    }
    for (let i = 0; i < 4; i++) {
      const y = box.top + 8 + i * 16
      createIdef0Edge(env, k.layoutOf(a2), ARROW, null, box._id, { x: 40, y }, { x: box.left + 2, y })
    }
    const top = k.top
    expect(listField(top, 'arrows').filter((a) => a['target'] === boxView(k.child, 2).model)).toHaveLength(8)
    expect(listField(k.model, 'arrows')).toHaveLength(8)
    expect(clashes(k, a2)).toEqual([])
    expect(clashes(k, k.child)).toEqual([])
    expect(clashes(k, k.context)).toEqual([])
  })

  it('places repeated Add Boundary Arrow commands side by side on every level', () => {
    const k = newKit()
    const env = k.envOf(k.child)
    for (let i = 0; i < 3; i++) addBoundaryArrow(env, boxView(k.child, 1), 'control')
    for (let i = 0; i < 3; i++) addBoundaryArrow(env, boxView(k.child, 3), 'output')
    expect(clashes(k, k.child)).toEqual([])
    expect(clashes(k, k.context)).toEqual([])
    expect(portsAlong(k.context, 'control')).toHaveLength(3)
  })
})

describe('Spread Boundary Arrows', () => {
  /** A0 with five inputs and three controls of box 2 stacked on one spot each, as older versions drew them. */
  function stacked(): { k: IdefKit; inputs: Elem[]; controls: Elem[] } {
    const k = newKit()
    const box = boxView(k.child, 2)
    const inputs: Elem[] = []
    const controls: Elem[] = []
    k.engine.transact('Old drawing', (b) => {
      for (let i = 0; i < 5; i++) {
        const plan = planBoundaryArrow(k.child, box, 'input', `In ${i + 1}`, box.top + 8)
        applyPlan(b, plan)
        inputs.push(plan.model as Elem)
      }
      for (let i = 0; i < 3; i++) {
        const plan = planBoundaryArrow(k.child, box, 'control', `Ctl ${i + 1}`, box.left + 8)
        applyPlan(b, plan)
        controls.push(plan.model as Elem)
      }
    })
    withGeometry(k.envOf(k.child), 'Route', () => undefined)
    return { k, inputs, controls }
  }

  it('leaves a drawing with stacked ports alone until the command runs', () => {
    const { k } = stacked()
    const before = clashes(k, k.child)
    expect(before.length).toBeGreaterThan(0)
    withGeometry(k.envOf(k.child), 'Move', (b) => b.setAll(boxView(k.child, 3), { left: boxView(k.child, 3).left + 8 }))
    expect(clashes(k, k.child)).toEqual(before)
  })

  it('gives every port its own slot in the order its arrow meets the box, in one undo step', () => {
    const { k } = stacked()
    const layout = () => k.layoutOf(k.child)
    const endAlong = (port: NodeView, vertical: boolean): number => {
      const arrow = listField(k.top, 'arrows').find((a) => a['source'] === port.model || a['target'] === port.model) as Elem
      const view = k.child.ownedViews.find((v) => v.model === arrow) as View
      const points = layout().edges.get(view._id)!.points
      const end = points[points.length - 1]!
      return vertical ? end.y : end.x
    }
    expect(spreadBoundaryArrows(k.envOf(k.child))).toBeGreaterThan(0)
    expect(k.engine.undoName).toBe('Spread Boundary Arrows')
    expect(clashes(k, k.child)).toEqual([])
    for (const [role, vertical] of [
      ['input', true],
      ['control', false]
    ] as const) {
      const ends = portsAlong(k.child, role).map((p) => endAlong(p, vertical))
      expect(ends, role).toEqual([...ends].sort((a, b) => a - b))
    }
    expect(spreadBoundaryArrows(k.envOf(k.child))).toBe(0)
    k.engine.undo()
    expect(clashes(k, k.child).length).toBeGreaterThan(0)
  })
})

describe('packAlong', () => {
  it('keeps ports on the grid, in order, at least their gap apart and centered on where they want to be', () => {
    const at = packAlong([100, 100, 100], [20, 20], 0, 1000)
    expect(at.every((x) => x % 8 === 0)).toBe(true)
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(20)
    expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(20)
    expect(Math.abs((at[0]! + at[2]!) / 2 - 100)).toBeLessThanOrEqual(8)
  })

  it('leaves ports that already have room where they want to be', () => {
    expect(packAlong([40, 200, 400], [20, 20], 0, 1000)).toEqual([40, 200, 400])
  })

  it('stays inside the edge', () => {
    const at = packAlong([990, 990, 990], [20, 20], 16, 1000)
    expect(Math.max(...at)).toBeLessThanOrEqual(1000)
    expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(20)
  })
})
