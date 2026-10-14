import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { moveViews, setFields } from '../../commands'
import type { Elem, UMLAssociation, View } from '../../model'
import { renderDiagramSvg } from '../../export/svg'
import { LineStyle, type Point, type Rect } from '../core'
import { edgeLayoutBounds } from '../layout/edges'
import type { EdgeLayout } from '../layout/types'
import { EdgeShape } from '../render/primitives'
import { testDiagram } from '../testUtils'
import { edgeEditAt, edgeSlotAt, endElementAt, nearEdgeEnd } from './edgeEnds'
import { hitTestDiagram } from './hitTest'

const center = (r: Rect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/** Point at arc length `s` along a polyline. */
function along(points: readonly Point[], s: number): Point {
  let left = s
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len }
    left -= len
  }
  return points[points.length - 1] as Point
}

function lengthOf(points: readonly Point[]): number {
  let n = 0
  for (let i = 1; i < points.length; i++) n += Math.hypot((points[i] as Point).x - (points[i - 1] as Point).x, (points[i] as Point).y - (points[i - 1] as Point).y)
  return n
}

function customerOrder() {
  const t = testDiagram()
  const customer = t.node('Class', 0, 0, 100, 50)
  const order = t.node('Class', 400, 0, 100, 50)
  setFields(t.engine, customer.model as Elem, { name: 'Customer' })
  setFields(t.engine, order.model as Elem, { name: 'Order' })
  const e = t.edge('Association', customer, order)
  const assoc = e.model as UMLAssociation
  const edge = (): EdgeLayout => t.layout().edges.get(e._id) as EdgeLayout
  return { t, e, assoc, end1: assoc.end1 as Elem, end2: assoc.end2 as Elem, edge }
}

const multiplicityOf = (end: Elem) => ({ kind: 'field', elementId: end._id, field: 'multiplicity' })

describe('nearEdgeEnd', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 400, y: 0 }
  ]
  it('takes the first and last quarter (at least 40 units) as the ends', () => {
    expect(nearEdgeEnd(line, { x: 10, y: 3 })).toBe('tail')
    expect(nearEdgeEnd(line, { x: 99, y: -3 })).toBe('tail')
    expect(nearEdgeEnd(line, { x: 390, y: 0 })).toBe('head')
    expect(nearEdgeEnd(line, { x: 200, y: 0 })).toBeNull()
    expect(nearEdgeEnd(line, { x: 120, y: 0 })).toBeNull()
  })
  it('keeps a middle on short edges', () => {
    const short = [
      { x: 0, y: 0 },
      { x: 60, y: 0 }
    ]
    expect(nearEdgeEnd(short, { x: 5, y: 0 })).toBe('tail')
    expect(nearEdgeEnd(short, { x: 55, y: 0 })).toBe('head')
    expect(nearEdgeEnd(short, { x: 30, y: 0 })).toBeNull()
  })
  it('measures along bends', () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 200, y: 200 }
    ]
    expect(nearEdgeEnd(bent, { x: 2, y: 30 })).toBe('tail')
    expect(nearEdgeEnd(bent, { x: 180, y: 198 })).toBe('head')
    expect(nearEdgeEnd(bent, { x: 0, y: 200 })).toBeNull()
  })
})

describe('empty association end labels', () => {
  it('get an edit slot but no rendered text', () => {
    const { edge, end1, end2 } = customerOrder()
    const l = edge()
    expect(l.labels.filter((x) => x.edit && 'elementId' in x.edit && [end1._id, end2._id].includes(x.edit.elementId))).toEqual([])
    expect(l.slots?.map((s) => s.hint).sort()).toEqual(['multiplicity', 'multiplicity', 'role', 'role'])
    expect(l.endEdits).toEqual({ tail: multiplicityOf(end1), head: multiplicityOf(end2) })
    const markup = renderToStaticMarkup(createElement('svg', null, createElement(EdgeShape, { layout: l })))
    expect(markup).not.toContain('multiplicity')
    expect(markup).not.toContain('role')
    expect(markup).not.toContain('<text')
  })

  it('are not part of the exported SVG or its bounds', () => {
    const { t, edge } = customerOrder()
    const out = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(out.svg).not.toContain('multiplicity')
    expect(out.svg).not.toContain('>role<')
    const l = edge()
    const bounds = edgeLayoutBounds(l)
    for (const slot of l.slots ?? []) expect(bounds).not.toContainEqual(slot.box)
  })

  it('no multiplicity slot when multiplicities are hidden; the role name is then the end edit', () => {
    const { t, e, end1, edge } = customerOrder()
    setFields(t.engine, e, { showMultiplicity: false })
    const l = edge()
    expect(l.slots?.map((s) => s.hint)).toEqual(['role', 'role'])
    expect(l.endEdits?.tail).toEqual({ kind: 'name', elementId: end1._id })
  })
})

describe('double-click near an association end', () => {
  it('edits the multiplicity of the end it is near, the name in the middle', () => {
    const { edge, end1, end2 } = customerOrder()
    const l = edge()
    const len = lengthOf(l.points)
    const tail = edgeEditAt(l, along(l.points, 10))
    expect(tail?.target).toEqual(multiplicityOf(end1))
    expect(tail?.text).toBe('')
    expect(edgeEditAt(l, along(l.points, len - 10))?.target).toEqual(multiplicityOf(end2))
    expect(edgeEditAt(l, along(l.points, len / 2))).toBeNull()
  })

  it('pre-fills the current value and uses the shown label once set', () => {
    const { t, edge, end1, end2 } = customerOrder()
    setFields(t.engine, end1, { multiplicity: '1' })
    const l = edge()
    const r = edgeEditAt(l, along(l.points, 5))
    expect(r?.text).toBe('1')
    expect(r?.box).toEqual(l.labels.find((x) => x.text === '1')?.box)
    // The other end still has its slot.
    expect(l.slots?.some((s) => s.hint === 'multiplicity' && 'elementId' in s.edit && s.edit.elementId === end2._id)).toBe(true)
    expect(l.slots?.some((s) => s.hint === 'multiplicity' && 'elementId' in s.edit && s.edit.elementId === end1._id)).toBe(false)
  })

  it('edits the slot under the pointer (role or multiplicity), even on an unselected edge', () => {
    const { t, e, edge, end2 } = customerOrder()
    const l = edge()
    const role = l.slots?.find((s) => s.hint === 'role' && 'elementId' in s.edit && s.edit.elementId === end2._id)
    expect(role).toBeDefined()
    const p = center(role!.box)
    expect(edgeEditAt(l, p)?.target).toEqual({ kind: 'name', elementId: end2._id })
    expect(edgeSlotAt(t.layout(), p)).toMatchObject({ viewId: e._id, region: { target: { kind: 'name', elementId: end2._id } } })
    // Selected: the slot hits the edge (so it stays selected); unselected: nothing.
    expect(hitTestDiagram(t.layout(), p, { selected: new Set([e._id]), zoom: 1 })).toEqual({ kind: 'edge', viewId: e._id })
    expect(hitTestDiagram(t.layout(), p, { selected: new Set(), zoom: 1 })).toBeNull()
  })

  it('resolves both ends of a self-association', () => {
    const t = testDiagram()
    const a = t.node('Class', 100, 100, 100, 60)
    const e = t.edge('Association', a, a)
    const assoc = e.model as UMLAssociation
    const l = t.layout().edges.get(e._id) as EdgeLayout
    expect(l.points.length).toBeGreaterThan(2)
    const len = lengthOf(l.points)
    expect(edgeEditAt(l, along(l.points, 3))?.target).toEqual(multiplicityOf(assoc.end1 as Elem))
    expect(edgeEditAt(l, along(l.points, len - 3))?.target).toEqual(multiplicityOf(assoc.end2 as Elem))
    expect(edgeEditAt(l, along(l.points, len / 2))).toBeNull()
  })

  it('follows rectilinear lines and moved classes', () => {
    const { t, e, edge, end1, end2 } = customerOrder()
    const order = e['head'] as View
    moveViews(t.engine, [order], 0, 200)
    setFields(t.engine, e, { lineStyle: LineStyle.Rectilinear })
    const l = edge()
    expect(l.points.length).toBeGreaterThan(2)
    const len = lengthOf(l.points)
    expect(edgeEditAt(l, along(l.points, 8))?.target).toEqual(multiplicityOf(end1))
    expect(edgeEditAt(l, along(l.points, len - 8))?.target).toEqual(multiplicityOf(end2))
    expect(endElementAt(l, along(l.points, len - 8))).toBe(end2._id)
    expect(endElementAt(l, along(l.points, len / 2))).toBeNull()
  })

  it('names the end of a label under the pointer for the context menu', () => {
    const { t, edge, end1 } = customerOrder()
    setFields(t.engine, end1, { name: 'buyer' })
    const l = edge()
    const label = l.labels.find((x) => x.text === 'buyer')
    expect(endElementAt(l, center(label!.box))).toBe(end1._id)
  })

  it('leaves edges without end edits to the caller (directed relationships)', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 400, 0, 100, 50)
    const e = t.edge('Generalization', a, b)
    const l = t.layout().edges.get(e._id) as EdgeLayout
    expect(l.slots).toBeUndefined()
    expect(edgeEditAt(l, along(l.points, 5))).toBeNull()
  })
})
