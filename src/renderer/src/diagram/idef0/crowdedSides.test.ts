import { describe, expect, it } from 'vitest'
import type { Elem, NodeView, View } from '../../model'
import type { Point, Rect } from '../core'
import { addBoundaryArrow } from './decompose'
import { createIdef0Edge, pickEnd } from './gestures'
import { arrowView, exampleKit, newKit } from './testkit'

type Side = 'left' | 'top' | 'right' | 'bottom'
type Kit = ReturnType<typeof newKit>

const ARROW = { kind: 'IDEF0Arrow' }
const ROLE_OF_SIDE = { left: 'input', top: 'control', right: 'output', bottom: 'mechanism' } as const

/** A new model whose middle box on A0 has `n` boundary arrows on each side. */
function crowded(n: number): { k: Kit; view: NodeView } {
  const k = newKit()
  const view = k.boxes(k.child)[1] as NodeView
  for (const role of ['input', 'control', 'output', 'mechanism'] as const) for (let i = 0; i < n; i++) addBoundaryArrow(k.envOf(k.child), view, role)
  return { k, view }
}

const boxOf = (k: Kit, view: View): Rect => k.layoutOf(k.child).nodes.get(view._id)!.box

/** Where the existing arrows meet `side` of `box` (x along top/bottom, y along left/right). */
function endsOnSide(k: Kit, box: Rect, side: Side): number[] {
  const out: number[] = []
  const right = box.left + box.width
  const bottom = box.top + box.height
  for (const e of k.layoutOf(k.child).edges.values()) {
    for (const p of [e.points[0], e.points[e.points.length - 1]] as Point[]) {
      const alongX = p.x > box.left && p.x < right
      const alongY = p.y > box.top && p.y < bottom
      if (side === 'bottom' && alongX && Math.abs(p.y - bottom) < 2) out.push(p.x)
      if (side === 'top' && alongX && Math.abs(p.y - box.top) < 2) out.push(p.x)
      if (side === 'left' && alongY && Math.abs(p.x - box.left) < 2) out.push(p.y)
      if (side === 'right' && alongY && Math.abs(p.x - right) < 2) out.push(p.y)
    }
  }
  return out.sort((a, b) => a - b)
}

/** A point on `side` of `box` at `along`, `offset` units outside (negative: inside). */
function onSide(box: Rect, side: Side, along: number, offset: number): Point {
  switch (side) {
    case 'left':
      return { x: box.left - offset, y: along }
    case 'right':
      return { x: box.left + box.width + offset, y: along }
    case 'top':
      return { x: along, y: box.top - offset }
    case 'bottom':
      return { x: along, y: box.top + box.height + offset }
  }
}

/** A point on empty canvas (nothing picked) out from `side` of `box`, away from every arrow. */
function emptyOutside(k: Kit, box: Rect, side: Side): Point {
  const layout = k.layoutOf(k.child)
  const mid = side === 'left' || side === 'right' ? box.top + box.height / 2 : box.left + box.width / 2
  for (let d = 0; d < 120; d += 3) {
    for (const along of [mid + d, mid - d]) {
      const p = onSide(box, side, along, 70)
      if (pickEnd(layout, p, ARROW) === null) return p
    }
  }
  throw new Error('no empty point')
}

const rolesOn = (k: Kit, view: View): string[] =>
  (k.top['arrows'] as Elem[]).filter((a) => a['target'] === view.model || a['source'] === view.model).map((a) => a['role'] as string)

describe('creating arrows on crowded box sides', () => {
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    it(`the box wins over the arrows already on its ${side} side`, () => {
      const { k, view } = crowded(6)
      const layout = k.layoutOf(k.child)
      const box = boxOf(k, view)
      const ends = endsOnSide(k, box, side)
      expect(ends).toHaveLength(6)
      // On the stubs of the existing arrows and between them, just inside and up to 8 units outside the outline.
      for (const along of ends.flatMap((a) => [a - 3, a, a + 2])) {
        for (const offset of [-3, 0, 2, 6, 8]) expect(pickEnd(layout, onSide(box, side, along, offset), ARROW)).toBe(view._id)
      }
    })

    it(`adds a new ${ROLE_OF_SIDE[side]} on the crowded ${side} side`, () => {
      const { k, view } = crowded(6)
      const env = k.envOf(k.child)
      const layout = k.layoutOf(k.child)
      const box = boxOf(k, view)
      const ends = endsOnSide(k, box, side)
      // Right on the stub of an existing arrow, a few units outside the box.
      const atBox = onSide(box, side, ends[2] as number, 4)
      const free = emptyOutside(k, box, side)
      const [press, release] = side === 'right' ? [atBox, free] : [free, atBox]
      const id = createIdef0Edge(env, layout, ARROW, pickEnd(layout, press, ARROW), pickEnd(layout, release, ARROW), press, release)
      expect(id).toBeTruthy()
      const created = k.repository.get(id!) as View
      expect((created.model as Elem)['role']).toBe(ROLE_OF_SIDE[side])
      expect(rolesOn(k, view).filter((r) => r === ROLE_OF_SIDE[side])).toHaveLength(7)
      // A new boundary arrow: its other end is a new port.
      const other = (side === 'right' ? created['head'] : created['tail']) as View
      expect(other._type).toBe('IDEF0PortView')
      // The side now spreads seven ends.
      expect(endsOnSide(k, boxOf(k, view), side)).toHaveLength(7)
    })
  }

  it('says why an arrow released on the right side of a crowded box is refused', () => {
    const { k, view } = crowded(5)
    const layout = k.layoutOf(k.child)
    const box = boxOf(k, view)
    const release = onSide(box, 'right', endsOnSide(k, box, 'right')[1] as number, 3)
    const press = emptyOutside(k, box, 'right')
    expect(pickEnd(layout, release, ARROW)).toBe(view._id)
    expect(() => createIdef0Edge(k.envOf(k.child), layout, ARROW, pickEnd(layout, press, ARROW), view._id, press, release)).toThrow(/right side of a box/)
    // Drawn from the left of the box into it, the arrow comes in on the left (an input) even when
    // released next to the right side.
    const fromLeft = emptyOutside(k, box, 'left')
    const inside = onSide(box, 'right', release.y, -3)
    const id = createIdef0Edge(k.envOf(k.child), layout, ARROW, pickEnd(layout, fromLeft, ARROW), view._id, fromLeft, inside)
    expect(((k.repository.get(id as string) as View).model as Elem)['role']).toBe('input')
  })

  it('says why an arrow with no box at either end is refused', () => {
    const k = newKit()
    expect(() => createIdef0Edge(k.envOf(k.child), k.layoutOf(k.child), ARROW, null, null, { x: 300, y: 650 }, { x: 320, y: 600 })).toThrow(/needs a box at one end/)
  })

  it('still forks off the middle of an existing arrow, away from the boxes', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.child)
    const trunk = arrowView(k.child, 'Validated Order')
    const pts = layout.edges.get(trunk._id)!.points
    const b3 = k.boxes(k.child)[2] as NodeView
    // The middle of the trunk's longest segment.
    let mid: Point | null = null
    let longest = 0
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as Point
      const b = pts[i] as Point
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > longest) {
        longest = len
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      }
    }
    expect(pickEnd(layout, mid!, ARROW)).toBe(trunk._id)
    // Its end on the box side belongs to the box.
    const head = trunk['head'] as View
    expect(pickEnd(layout, pts[pts.length - 1] as Point, ARROW)).toBe(head._id)
    const box3 = layout.nodes.get(b3._id)!.box
    const release = { x: box3.left + 3, y: box3.top + 30 }
    const fork = createIdef0Edge(k.envOf(k.child), layout, ARROW, pickEnd(layout, mid!, ARROW), pickEnd(layout, release, ARROW), mid!, release)
    const forkView = k.repository.get(fork!) as View
    expect(forkView['tail']).toBe(trunk)
    expect((forkView.model as Elem)['role']).toBe('input')
  })

  it('still makes a boundary arrow from empty canvas near the frame edge', () => {
    const { k, view } = crowded(5)
    const layout = k.layoutOf(k.child)
    const box = boxOf(k, view)
    // Near the bottom frame edge, away from the mechanism ports.
    const press = { x: box.left - 60, y: 690 }
    expect(pickEnd(layout, press, ARROW)).toBeNull()
    const release = onSide(box, 'bottom', box.left + 10, 2)
    const id = createIdef0Edge(k.envOf(k.child), layout, ARROW, null, pickEnd(layout, release, ARROW), press, release)
    const created = k.repository.get(id!) as View
    expect((created['tail'] as View)._type).toBe('IDEF0PortView')
    expect((created.model as Elem)['role']).toBe('mechanism')
  })

  it('does not fork an arrow where it runs along the frame edge', () => {
    const { k } = crowded(5)
    const layout = k.layoutOf(k.child)
    // Every point within 8 units of the frame edge picks a port or nothing, never an arrow.
    for (let x = 30; x < 1000; x += 7) {
      for (const y of [64 + 6, 696 - 6]) {
        const id = pickEnd(layout, { x, y }, ARROW)
        if (id) expect((k.repository.get(id) as View)._type).not.toBe('IDEF0ArrowView')
      }
    }
  })
})
