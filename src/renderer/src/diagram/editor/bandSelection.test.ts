import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, ModelEngine } from '../../commands'
import { createDefaultProject, Repository, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { FixedWidthTextMeasurer, type Point, type Rect } from '../core'
import { arrowView, exampleKit } from '../idef0/testkit'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout } from '../layout/types'
import { ensureNotations } from '../notations'
import { testDiagram } from '../testUtils'
import { bandSelection } from './hitTest'

/** The smallest band around `rects` and `points`, grown by `margin`. */
function bandAround(rects: readonly Rect[], points: readonly Point[] = [], margin = 4): Rect {
  const xs = [...rects.flatMap((r) => [r.left, r.left + r.width]), ...points.map((p) => p.x)]
  const ys = [...rects.flatMap((r) => [r.top, r.top + r.height]), ...points.map((p) => p.y)]
  const left = Math.min(...xs) - margin
  const top = Math.min(...ys) - margin
  return { left, top, width: Math.max(...xs) + margin - left, height: Math.max(...ys) + margin - top }
}

describe('rubber band selection of edges', () => {
  it('selects two classes and the association between them, not an edge that leaves the band', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    const c = t.node('Class', 300, 300, 100, 60)
    const ab = t.edge('Association', a, b)
    const bc = t.edge('Dependency', b, c)
    const layout = t.layout()
    const band = bandAround([layout.nodes.get(a._id)!.box, layout.nodes.get(b._id)!.box], layout.edges.get(ab._id)!.points)
    const ids = bandSelection(layout, band, [], false)
    expect(ids.sort()).toEqual([a._id, b._id, ab._id].sort())
    expect(ids).not.toContain(bc._id)
  })

  it('selects IDEF0 boxes with the arrow between them; an arrow only partly inside stays out', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.child)
    const [b1, b2] = k.boxes(k.child) as [NodeView, NodeView]
    const between = arrowView(k.child, 'Validated Order')
    const band = bandAround([layout.nodes.get(b1._id)!.box, layout.nodes.get(b2._id)!.box], layout.edges.get(between._id)!.points)
    const ids = bandSelection(layout, band, [], false)
    expect(ids).toEqual(expect.arrayContaining([b1._id, b2._id, between._id]))
    // Every selected arrow lies wholly in the band; the boundary input of box 1 starts at the frame edge.
    const input = arrowView(k.child, 'Customer Order')
    expect(layout.edges.get(input._id)!.points.some((p) => p.x < band.left)).toBe(true)
    expect(ids).not.toContain(input._id)
    for (const id of ids) for (const p of layout.edges.get(id)?.points ?? []) expect(p.x >= band.left && p.x <= band.left + band.width && p.y >= band.top && p.y <= band.top + band.height).toBe(true)
  })

  it('selects an IDEF0 fork branch on its own when only the branch lies in the band', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.child)
    const branches = k.child.ownedViews.filter((v) => v._type === 'IDEF0ArrowView' && ((v as View)['tail'] as View | null)?._type === 'IDEF0ArrowView') as View[]
    expect(branches.length).toBeGreaterThan(0)
    const branch = branches[0] as View
    const trunk = branch['tail'] as View
    const band = bandAround([], layout.edges.get(branch._id)!.points, 2)
    const ids = bandSelection(layout, band, [], false)
    expect(ids).toContain(branch._id)
    expect(ids).not.toContain(trunk._id)
    // A band around the whole sheet takes every arrow, trunks and branches alike.
    const all = bandSelection(layout, { left: -10, top: -10, width: 2000, height: 2000 }, [], false)
    for (const v of k.child.ownedViews.filter((x) => x._type === 'IDEF0ArrowView')) expect(all).toContain(v._id)
  })

  it('selects sequence messages lying in the band', () => {
    ensureNotations()
    const repository = new Repository(createDefaultProject())
    const engine = new ModelEngine(repository)
    const owner = (repository.root?.['ownedElements'] as Elem[])[0] as Elem
    const diagram = createDiagram(engine, 'SequenceDiagram', owner).diagram as Diagram
    const l1 = createNode(engine, { kind: 'Lifeline', diagram, left: 40, top: 40, width: 100, height: 300 }).view as View
    const l2 = createNode(engine, { kind: 'Lifeline', diagram, left: 300, top: 40, width: 100, height: 300 }).view as View
    const m1 = createEdge(engine, { kind: 'Message', diagram, tail: l1, head: l2, y: 150, messageSort: 'synchCall' }).view as View
    const m2 = createEdge(engine, { kind: 'Message', diagram, tail: l2, head: l1, y: 250, messageSort: 'reply' }).view as View
    const layout: DiagramLayout = computeDiagramLayout(diagram, repository, new FixedWidthTextMeasurer())
    const ids = bandSelection(layout, bandAround([], layout.edges.get(m1._id)!.points, 10), [], false)
    expect(ids).toContain(m1._id)
    expect(ids).not.toContain(m2._id)
  })

  it('adds the enclosed views to the current selection when additive', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    const c = t.node('Class', 0, 300, 100, 60)
    const ab = t.edge('Association', a, b)
    const layout = t.layout()
    const band = bandAround([layout.nodes.get(a._id)!.box, layout.nodes.get(b._id)!.box], layout.edges.get(ab._id)!.points)
    expect(bandSelection(layout, band, [c._id], true).sort()).toEqual([a._id, b._id, c._id, ab._id].sort())
    expect(bandSelection(layout, band, [c._id, a._id], true).filter((id) => id === a._id)).toHaveLength(1)
    expect(bandSelection(layout, band, [c._id], false)).not.toContain(c._id)
  })
})
