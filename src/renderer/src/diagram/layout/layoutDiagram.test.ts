import { describe, expect, it } from 'vitest'
import { moveSelection } from '../editor/actions'
import { testDiagram } from '../testUtils'
import { computeDiagramLayout, sameLayoutData } from './layoutDiagram'

describe('sameLayoutData', () => {
  it('compares plain data deeply, as JSON would', () => {
    expect(sameLayoutData({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })).toBe(true)
    expect(sameLayoutData({ a: 1, b: [1, { c: 'x' }] }, { a: 1, b: [1, { c: 'y' }] })).toBe(false)
    expect(sameLayoutData([1, 2], [1, 2, 3])).toBe(false)
    expect(sameLayoutData([], {})).toBe(false)
    expect(sameLayoutData({ a: null }, { a: undefined })).toBe(false)
    expect(sameLayoutData(1, '1')).toBe(false)
  })

  it('treats undefined-valued properties as absent', () => {
    expect(sameLayoutData({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameLayoutData({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(sameLayoutData({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameLayoutData({ a: 1, b: 2 }, { a: 1 })).toBe(false)
  })
})

describe('computeDiagramLayout structural sharing', () => {
  it('keeps the layout objects of unchanged views and replaces changed ones', () => {
    const t = testDiagram()
    const a = t.node('Class', 40, 40)
    const b = t.node('Class', 300, 40)
    const c = t.node('Class', 40, 300)
    const ab = t.edge('Association', a, b)
    const first = computeDiagramLayout(t.diagram, t.repository, t.measurer)
    expect(computeDiagramLayout(t.diagram, t.repository, t.measurer, { previous: first })).toBe(first)

    moveSelection(t, [b._id], 0, 40)
    const next = computeDiagramLayout(t.diagram, t.repository, t.measurer, { previous: first })
    expect(next).not.toBe(first)
    expect(next.nodes.get(a._id)).toBe(first.nodes.get(a._id))
    expect(next.nodes.get(c._id)).toBe(first.nodes.get(c._id))
    expect(next.nodes.get(b._id)).not.toBe(first.nodes.get(b._id))
    expect(next.edges.get(ab._id)).not.toBe(first.edges.get(ab._id))
  })
})
