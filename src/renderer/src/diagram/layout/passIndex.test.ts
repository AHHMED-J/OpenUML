import { describe, expect, it } from 'vitest'
import { setFields } from '../../commands'
import type { Diagram, Repository } from '../../model'
import { FixedWidthTextMeasurer } from '../core'
import { testDiagram } from '../testUtils'
import { edgesAt } from './passIndex'
import type { LayoutContext } from './types'

function contextOf(diagram: Diagram, repository: Repository): LayoutContext {
  return { measurer: new FixedWidthTextMeasurer(), repository, diagram, nodeLayout: () => undefined, edgeLayout: () => undefined }
}

describe('edgesAt', () => {
  it('lists visible edges of a type under both ends, in diagram order, once per pass', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0)
    const b = t.node('Class', 300, 0)
    const c = t.node('Class', 0, 300)
    const ab = t.edge('Association', a, b)
    const ca = t.edge('Association', c, a)
    const hidden = t.edge('Association', b, c)
    t.edge('Dependency', a, c)
    setFields(t.engine, hidden, { visible: false })
    const ctx = contextOf(t.diagram, t.repository)
    const index = edgesAt(ctx, 'UMLAssociationView')
    expect(index.get(a)).toEqual([ab, ca])
    expect(index.get(b)).toEqual([ab])
    expect(index.get(c)).toEqual([ca])
    expect(edgesAt(ctx, 'UMLAssociationView')).toBe(index)
    // A new pass (context) sees the current model.
    setFields(t.engine, hidden, { visible: true })
    expect(edgesAt(contextOf(t.diagram, t.repository), 'UMLAssociationView').get(c)).toEqual([ca, hidden])
  })
})
