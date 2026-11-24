/** Compact layout of RAD diagrams: order kept, interactions level, one undo step, no new overlaps. */
import { describe, expect, it } from 'vitest'
import { createDiagram, setFields } from '../../commands'
import type { Diagram, Elem, NodeView, View } from '../../model'
import type { Rect } from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout, NodeLayout } from '../layout/types'
import { compactRadDiagram, RAD_ROLE_GAP, RAD_STEP } from './compact'
import { clerkFixture, insuranceFixture, legendFixture, letterFixture, type RadBuilder } from './fixtures'

const env = (b: RadBuilder) => ({ engine: b.engine, diagram: b.diagram, measurer: b.measurer })
const lay = (b: RadBuilder): DiagramLayout => computeDiagramLayout(b.diagram, b.repository, b.measurer)
const cy = (n: NodeLayout): number => n.box.top + n.box.height / 2
const cx = (n: NodeLayout): number => n.box.left + n.box.width / 2

function symbols(l: DiagramLayout): NodeLayout[] {
  return [...l.nodes.values()].filter((n) => n.viewType !== 'RADRoleView')
}

function roles(l: DiagramLayout): NodeLayout[] {
  return [...l.nodes.values()].filter((n) => n.viewType === 'RADRoleView').sort((a, b) => a.box.left - b.box.left)
}

function snapshot(b: RadBuilder): string {
  return JSON.stringify(((b.diagram.ownedViews ?? []) as View[]).map((v) => [v._id, (v as NodeView).left, (v as NodeView).top, (v as NodeView).width, (v as NodeView).height, v['points']]))
}

function overlap(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width - 0.5 && b.left < a.left + a.width - 0.5 && a.top < b.top + b.height - 0.5 && b.top < a.top + a.height - 0.5
}

function rects(n: NodeLayout): Rect[] {
  return [n.box, ...(n.extraBounds ?? [])].filter((r) => r.width > 0 || r.height > 0)
}

function overlappingPairs(l: DiagramLayout): Set<string> {
  const nodes = symbols(l)
  const out = new Set<string>()
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as NodeLayout
      const c = nodes[j] as NodeLayout
      if (rects(a).some((ra) => rects(c).some((rc) => overlap(ra, rc)))) out.add([a.viewId, c.viewId].sort().join('|'))
    }
  }
  return out
}

/** Pairs of symbols by vertical order (above, same row, below) and, in one role, horizontal order. */
function orderOf(b: RadBuilder, l: DiagramLayout): Map<string, string> {
  const nodes = symbols(l)
  const out = new Map<string, string>()
  for (const a of nodes) {
    for (const c of nodes) {
      if (a === c) continue
      const dy = cy(c) - cy(a)
      const v = Math.abs(dy) <= 6 ? '=' : dy > 0 ? 'v' : '^'
      const sameRole = (b.repository.get(a.viewId) as View).containerView === (b.repository.get(c.viewId) as View).containerView
      const h = sameRole ? (cx(c) > cx(a) ? '>' : cx(c) < cx(a) ? '<' : '|') : ''
      out.set(`${a.viewId}/${c.viewId}`, v + h)
    }
  }
  return out
}

const fixtures = { insurance: insuranceFixture, letter: letterFixture, legend: legendFixture, clerk: clerkFixture }

describe('Compact Layout', () => {
  for (const [name, make] of Object.entries(fixtures)) {
    describe(`on the ${name} process`, () => {
      it('keeps the order of every step, above and below, left and right', () => {
        const b = make()
        const order = orderOf(b, lay(b))
        expect(compactRadDiagram(env(b))).toMatchObject({ ok: true })
        expect(orderOf(b, lay(b))).toEqual(order)
      })

      it('keeps interaction links and refinement branches level', () => {
        const b = make()
        const before = lay(b)
        const level = [...before.edges.values()]
          .filter((e) => e.viewType === 'RADInteractionLinkView')
          .map((e) => b.repository.get(e.viewId) as View)
          .filter((v) => Math.abs(cy(before.nodes.get((v.tail as View)._id) as NodeLayout) - cy(before.nodes.get((v.head as View)._id) as NodeLayout)) < 1)
        compactRadDiagram(env(b))
        const after = lay(b)
        for (const v of level) expect(cy(after.nodes.get((v.tail as View)._id) as NodeLayout)).toBe(cy(after.nodes.get((v.head as View)._id) as NodeLayout))
        for (const n of symbols(after).filter((s) => s.viewType === 'RADBranchView')) {
          const refinement = (b.repository.get(n.viewId) as View).model?.['refinement'] as Elem | undefined
          const rv = refinement ? b.repository.viewsOf(refinement)[0] : null
          if (rv && Math.abs(cy(before.nodes.get(rv._id) as NodeLayout) - cy(before.nodes.get(n.viewId) as NodeLayout)) <= 6) {
            expect(Math.abs(cy(after.nodes.get(rv._id) as NodeLayout) - cy(n))).toBeLessThanOrEqual(6)
          }
        }
      })

      it('is one step that undo takes back whole', () => {
        const b = make()
        const start = snapshot(b)
        const outcome = compactRadDiagram(env(b))
        expect(outcome).toEqual({ ok: true, changed: true })
        expect(snapshot(b)).not.toBe(start)
        expect(b.engine.undo()?.name).toBe('Compact Layout')
        expect(snapshot(b)).toBe(start)
      })

      it('makes nothing overlap that did not before, and never grows the drawing', () => {
        const b = make()
        const before = lay(b)
        const pairs = overlappingPairs(before)
        compactRadDiagram(env(b))
        const after = lay(b)
        for (const p of overlappingPairs(after)) expect(pairs.has(p), p).toBe(true)
        expect(after.bounds?.height ?? 0).toBeLessThanOrEqual((before.bounds?.height ?? 0) + 1)
        expect(after.bounds?.width ?? 0).toBeLessThanOrEqual((before.bounds?.width ?? 0) + 1)
        // Roles do not overlap and hold their steps.
        const rs = roles(after)
        for (let i = 1; i < rs.length; i++) expect((rs[i] as NodeLayout).box.left).toBeGreaterThanOrEqual((rs[i - 1] as NodeLayout).box.left + (rs[i - 1] as NodeLayout).box.width)
      })
    })
  }

  it('brings steps about one step apart and roles 28 apart', () => {
    const b = insuranceFixture()
    compactRadDiagram(env(b))
    const l = lay(b)
    // Two consecutive single-line steps of one thread.
    const a1 = l.nodes.get(b.v('a1')._id) as NodeLayout
    const a2 = l.nodes.get(b.v('a2')._id) as NodeLayout
    expect(cy(a2) - cy(a1)).toBe(RAD_STEP)
    const [customer, agent] = roles(l) as [NodeLayout, NodeLayout]
    expect(agent.box.left - (customer.box.left + customer.box.width)).toBeGreaterThanOrEqual(RAD_ROLE_GAP)
    expect(agent.box.left - (customer.box.left + customer.box.width)).toBeLessThan(RAD_ROLE_GAP + 2)
    // Each role is as tall as what it holds.
    const lastStep = l.nodes.get(b.v('a5')._id) as NodeLayout
    expect(agent.box.top + agent.box.height).toBeLessThan(cy(lastStep) + 40)
  })

  it('leaves a drawing with overlapping symbols as it is and says why', () => {
    const b = insuranceFixture()
    const a2 = b.v('a2') as NodeView
    setFields(b.engine, a2, { left: (b.v('a1') as NodeView).left, top: (b.v('a1') as NodeView).top + 4 })
    const start = snapshot(b)
    const outcome = compactRadDiagram(env(b))
    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? '' : outcome.reason).toMatch(/overlap/)
    expect(snapshot(b)).toBe(start)
  })

  it('does nothing to other diagrams', () => {
    const b = insuranceFixture()
    const other = createDiagram(b.engine, 'ClassDiagram', b.repository.project as Elem).diagram as Diagram
    expect(compactRadDiagram({ engine: b.engine, diagram: other, measurer: b.measurer }).ok).toBe(false)
  })

  it('a compact drawing stays as it is', () => {
    const b = insuranceFixture()
    compactRadDiagram(env(b))
    const once = snapshot(b)
    expect(compactRadDiagram(env(b))).toEqual({ ok: true, changed: false })
    expect(snapshot(b)).toBe(once)
  })

  it('keeps lines into one step on one shared bus when steps come close', () => {
    const b = insuranceFixture()
    compactRadDiagram(env(b))
    const l = lay(b)
    const into = [b.e('m3', 'a4'), b.e('f3', 'a4')].map((v) => l.edges.get(v._id)?.points ?? [])
    const busY = into.map((pts) => pts[1]?.y)
    expect(busY[0]).toBe(busY[1])
    const a4 = l.nodes.get(b.v('a4')._id) as NodeLayout
    expect(busY[0]).toBeLessThan(a4.box.top)
  })
})
