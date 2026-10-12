import { describe, expect, it } from 'vitest'
import { setFields } from '../../commands'
import type { Elem, UMLAssociation } from '../../model'
import { testDiagram } from '../testUtils'
import { computeDiagramLayout } from './layoutDiagram'

function center(box: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** Label boxes are floored, so their center is within half a unit of the polar center. */
function expectCenter(box: { left: number; top: number; width: number; height: number } | undefined, x: number, y: number): void {
  expect(box).toBeDefined()
  const c = center(box as NonNullable<typeof box>)
  expect(Math.abs(c.x - x)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(c.y - y)).toBeLessThanOrEqual(0.5)
}

describe('edge layout', () => {
  it('routes oblique edges from box border to box border', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 300, 0, 100, 50)
    const e = t.edge('Association', a, b)
    const l = t.layout().edges.get(e._id)
    // Boxes are enlarged by 1 for junctions.
    expect(l?.points).toEqual([
      { x: 101, y: 25 },
      { x: 299, y: 25 }
    ])
    expect(l?.dash).toBe('solid')
  })

  it('places association labels with the default polar parameters', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 300, 0, 100, 50)
    const e = t.edge('DirectedAssociation', a, b)
    const assoc = e.model as UMLAssociation
    setFields(t.engine, assoc, { name: 'owns' })
    setFields(t.engine, assoc.end1 as Elem, { name: 'owner', multiplicity: '1' })
    setFields(t.engine, assoc.end2 as Elem, { name: 'items', multiplicity: '0..*' })
    const l = t.layout().edges.get(e._id)
    const byText = (text: string) => l?.labels.find((x) => x.text === text)
    // Name: 15 above the middle (200, 25).
    const name = byText('owns')
    expectCenter(name?.box, 200, 10)
    expect(name?.edit).toEqual({ kind: 'name', elementId: assoc._id })
    // Tail role above the line, tail multiplicity below it (anchor (101, 25), direction +x).
    expect(center(byText('owner')!.box).y).toBeLessThan(25)
    expect(center(byText('1')!.box).y).toBeGreaterThan(25)
    // Head (299, 25), direction −x: role above, multiplicity below.
    const role = byText('items')!
    expectCenter(role.box, 299 + Math.floor(30 * Math.cos(Math.PI + Math.PI / 6)), 25 + Math.floor(30 * Math.sin(Math.PI + Math.PI / 6)))
    const mult = byText('0..*')!
    expectCenter(mult.box, 299 + Math.floor(25 * Math.cos(Math.PI - Math.PI / 6)), 25 + Math.floor(25 * Math.sin(Math.PI - Math.PI / 6)))
    expect(mult.edit).toEqual({ kind: 'field', elementId: (assoc.end2 as Elem)._id, field: 'multiplicity' })
    // Directed association: stick arrow at the head only.
    expect(l?.headEnd.style).toBe('stickArrow')
    expect(l?.tailEnd.style).toBe('flat')
  })

  it('uses a dragged label position stored on the label view', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 300, 0, 100, 50)
    const e = t.edge('Generalization', a, b)
    setFields(t.engine, e.model as Elem, { name: 'g' })
    setFields(t.engine, e['nameLabel'] as Elem, { alpha: -Math.PI / 2, distance: 40 })
    const label = t.layout().edges.get(e._id)?.labels.find((x) => x.text === 'g')
    expectCenter(label?.box, 200, 25 + 40)
  })

  it('maps relationship kinds to dashes and end decorations', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 300, 0, 100, 50)
    const i = t.node('Interface', 300, 200)
    setFields(t.engine, i, { stereotypeDisplay: 'label' })
    const gen = t.edge('Generalization', a, b)
    const dep = t.edge('Dependency', a, b)
    const real = t.edge('InterfaceRealization', a, i)
    const comp = t.edge('Composition', a, b)
    const layout = t.layout()
    expect(layout.edges.get(gen._id)?.headEnd.style).toBe('triangle')
    expect(layout.edges.get(dep._id)?.dash).toBe('dot')
    expect(layout.edges.get(dep._id)?.headEnd.style).toBe('stickArrow')
    expect(layout.edges.get(real._id)?.dash).toBe('dot')
    expect(layout.edges.get(real._id)?.headEnd.style).toBe('triangle')
    expect(layout.edges.get(comp._id)?.headEnd.style).toBe('filledDiamond')
  })

  it('draws realizations into a lollipop solid and without arrowhead', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const i = t.node('Interface', 300, 0)
    const real = t.edge('InterfaceRealization', a, i)
    const dep = t.edge('Dependency', a, i)
    const layout = t.layout()
    expect(layout.edges.get(real._id)?.dash).toBe('solid')
    expect(layout.edges.get(real._id)?.headEnd.style).toBe('flat')
    expect((layout.edges.get(dep._id)?.data as { socket: string }).socket).toMatch(/^M.* A/)
  })

  it('reuses unchanged view layouts between passes', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 50)
    const b = t.node('Class', 300, 0, 100, 50)
    const first = t.layout()
    setFields(t.engine, b.model as Elem, { name: 'Renamed' })
    const second = computeDiagramLayout(t.diagram, t.repository, t.measurer, { previous: first })
    expect(second.nodes.get(a._id)).toBe(first.nodes.get(a._id))
    expect(second.nodes.get(b._id)).not.toBe(first.nodes.get(b._id))
  })
})
