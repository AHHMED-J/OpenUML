import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../../format'
import type { Diagram, EdgeView, Elem } from '../../model'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { ensureNotations } from '../notations'
import { createIdef0Edge } from './gestures'
import { decomposeFunction } from './decompose'
import { measurer, newKit } from './testkit'

const fixture = readFileSync(new URL('../../format/fixtures/idef0-order.mdj', import.meta.url), 'utf8')

describe('IDEF0 .mdj round trip with layout', () => {
  it('routes every arrow of the worked example exactly as the spec tables say', () => {
    ensureNotations()
    const { repository } = readMdj(fixture)
    for (const id of ['DgA-0000000000000000001', 'DgA0000000000000000001']) {
      const diagram = repository.get(id) as Diagram
      const layout = computeDiagramLayout(diagram, repository, measurer)
      const arrows = diagram.ownedViews.filter((v) => v._type === 'IDEF0ArrowView') as EdgeView[]
      expect(arrows.length).toBeGreaterThanOrEqual(4)
      for (const view of arrows) expect(layout.edges.get(view._id)?.points, `${(view.model as Elem)['name']} ${view._id}`).toEqual(view.points)
    }
  })

  it('keeps a decomposed and edited model stable through write, read and layout', () => {
    const k = newKit()
    const [b1, b2] = k.boxes(k.child)
    const env = k.envOf(k.child)
    createIdef0Edge(env, k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, b1!._id, b2!._id, { x: 0, y: 0 }, { x: b2!.left + 4, y: b2!.top + 40 })
    createIdef0Edge(env, k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, b2!._id, null, { x: 0, y: 0 }, { x: 900, y: 400 })
    decomposeFunction(k.engine, b1!.model as Elem, 3)
    const text = writeMdj(k.repository.project as Elem)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(validateModel(back.project)).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
    for (const diagram of back.repository.diagrams().filter((d) => d._type === 'IDEF0Diagram')) {
      const layout = computeDiagramLayout(diagram, back.repository, measurer)
      for (const view of diagram.ownedViews.filter((v) => v._type === 'IDEF0ArrowView') as EdgeView[]) {
        expect(layout.edges.get(view._id)?.points).toEqual(view.points)
      }
    }
  })
})
