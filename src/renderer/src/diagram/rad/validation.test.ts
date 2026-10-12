import { describe, expect, it } from 'vitest'
import { createEdge, createNode, deleteFromModel, setFields } from '../../commands'
import type { Elem, View } from '../../model'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { NodeLayout } from '../layout/types'
import { RadBuilder, clerkFixture, insuranceFixture, legendFixture, letterFixture } from './fixtures'
import type { ActivityData, RoleData } from './layout'
import { radWarnings, radWarningsByElement, type RadWarningCode } from './validation'

function codes(b: RadBuilder, withPositions = true): RadWarningCode[] {
  const byModel = new Map<Elem, View>()
  for (const v of b.diagram.ownedViews as View[]) if (v.model) byModel.set(v.model, v)
  const position = (e: Elem) => {
    const v = byModel.get(e) as unknown as { left: number; top: number; width: number; height: number } | undefined
    return v ? { x: v.left + v.width / 2, y: v.top + v.height / 2 } : null
  }
  return radWarnings(b.process, withPositions ? { position } : {}).map((w) => w.code)
}

function small(): RadBuilder {
  const b = new RadBuilder()
  b.role('r', { left: 0, top: 0, agent: 'Clerk', name: 'Filing papers' })
  return b
}

describe('worked examples', () => {
  it('raise no warning for the four fixtures', () => {
    for (const make of [insuranceFixture, letterFixture, clerkFixture, legendFixture]) expect(codes(make())).toEqual([])
  })
})

describe('role-gerund', () => {
  it('triggers for a name without a gerund and clears when it has one; an empty name is excluded', () => {
    const b = small()
    const role = b.roles.get('r')?.model as Elem
    setFields(b.engine, role, { name: 'Paperwork desk' })
    expect(codes(b)).toEqual(['role-gerund'])
    setFields(b.engine, role, { name: '' })
    expect(codes(b)).toEqual([])
    setFields(b.engine, role, { name: 'Archivando documentos' })
    expect(codes(b)).toEqual([])
  })
})

describe('main-flow-left', () => {
  it('triggers when the first element of a thread is not in the leftmost column and clears when it moves', () => {
    const b = small()
    b.el('a', 'r', 'RADActivity', 1, 0, 'Start here')
    b.el('b', 'r', 'RADActivity', 0, 1, 'Then here')
    expect(codes(b)).toContain('main-flow-left')
    b.line('a', 'b')
    // The first element (no incoming line) is still the one in column 1.
    expect(codes(b)).toContain('main-flow-left')
    setFields(b.engine, b.v('a'), { left: (b.v('b') as unknown as { left: number }).left + 6 })
    expect(codes(b)).not.toContain('main-flow-left')
    expect(codes(b, false)).not.toContain('main-flow-left')
  })
})

describe('interactions', () => {
  it('flags an interaction with neither a link nor an outside party', () => {
    const b = small()
    b.role('o', { left: 400, top: 0, agent: 'Boss', name: 'Approving requests' })
    b.el('i', 'r', 'RADInteraction', 0, 0, 'Ask')
    b.el('j', 'o', 'RADInteraction', 0, 0, 'Answer')
    expect(codes(b).filter((c) => c === 'interaction-unlinked')).toHaveLength(2)
    b.link('i', 'j')
    expect(codes(b)).toEqual([])
    deleteFromModel(b.engine, [b.k('i', 'j').model as Elem])
    setFields(b.engine, b.v('i').model as Elem, { externalParty: 'Customer' })
    expect(codes(b)).toEqual(['interaction-unlinked'])
  })

  it('reports a link inside one role as blocked (it cannot be created, but a file may contain one)', () => {
    const b = small()
    b.el('i', 'r', 'RADInteraction', 0, 0, 'Ask')
    b.el('j', 'r', 'RADInteraction', 0, 1, 'Answer')
    const link = { _type: 'RADInteractionLink', _id: 'x', _parent: b.process, source: b.v('i').model, target: b.v('j').model, name: '' } as unknown as Elem
    ;(b.process['interactions'] as Elem[]).push(link)
    const warnings = radWarnings(b.process)
    expect(warnings.find((w) => w.code === 'interaction-same-role')).toMatchObject({ level: 'blocked', elementId: 'x' })
  })
})

describe('branches and refinements', () => {
  it('flags an unattached branch and clears once it sits on its refinement row', () => {
    const b = small()
    b.el('q', 'r', 'RADCaseRefinement', 0, 0, 'Fine?')
    const orphan = b.el('o', 'r', 'RADCaseBranch', 3, 2, 'Maybe')
    expect(codes(b)).toContain('branch-unattached')
    setFields(b.engine, orphan.model as Elem, { refinement: b.v('q').model })
    expect(codes(b)).not.toContain('branch-unattached')
    // The kind must match: a part branch of a case refinement is unattached.
    const wrong = b.el('w', 'r', 'RADPartBranch', 4, 0, '')
    setFields(b.engine, wrong.model as Elem, { refinement: b.v('q').model })
    expect(codes(b)).toContain('branch-unattached')
  })

  it('flags a refinement with fewer than two branches', () => {
    const b = small()
    b.refinement('q', 'r', 'RADCaseRefinement', 0, 0, 'Fine?', [{ key: 'y', col: 1, name: 'Yes' }, { key: 'n', col: 2, name: 'No' }])
    expect(codes(b)).toEqual([])
    deleteFromModel(b.engine, [b.v('n').model as Elem])
    expect(codes(b)).toEqual(['refinement-lonely'])
  })

  it('flags a case branch without a condition', () => {
    const b = small()
    b.refinement('q', 'r', 'RADCaseRefinement', 0, 0, 'Fine?', [{ key: 'y', col: 1, name: '' }, { key: 'n', col: 2, name: 'No' }])
    expect(codes(b)).toEqual(['case-unconditional'])
    setFields(b.engine, b.v('y').model as Elem, { name: 'Yes' })
    expect(codes(b)).toEqual([])
    // Part branches need no name.
    b.refinement('p', 'r', 'RADPartRefinement', 3, 3, 'Both', [{ key: 'p1', col: 4, name: '' }, { key: 'p2', col: 5, name: '' }])
    b.el('m', 'r', 'RADActivity', 3, 5, 'Join')
    b.el('x1', 'r', 'RADActivity', 4, 4, 'X1')
    b.el('x2', 'r', 'RADActivity', 5, 4, 'X2')
    for (const [f, t] of [['p1', 'x1'], ['p2', 'x2'], ['x1', 'm'], ['x2', 'm']] as const) b.line(f, t)
    expect(codes(b)).toEqual([])
  })

  it('flags parallel paths that never meet again and clears when they merge', () => {
    const b = small()
    b.refinement('p', 'r', 'RADPartRefinement', 0, 0, 'Both', [{ key: 'p1', col: 1, name: '' }, { key: 'p2', col: 2, name: '' }])
    b.el('x1', 'r', 'RADActivity', 1, 1, 'X1')
    b.el('x2', 'r', 'RADActivity', 2, 1, 'X2')
    b.line('p1', 'x1')
    b.line('p2', 'x2')
    expect(codes(b)).toContain('part-no-merge')
    b.el('m', 'r', 'RADActivity', 0, 3, 'Join')
    b.line('x1', 'm')
    expect(codes(b)).toContain('part-no-merge')
    b.line('x2', 'm')
    expect(codes(b)).not.toContain('part-no-merge')
  })
})

describe('dead-end hint', () => {
  it('triggers for an element without a line that has elements below it in its column and clears when connected', () => {
    const b = small()
    b.el('a', 'r', 'RADActivity', 0, 0, 'First')
    b.el('b', 'r', 'RADActivity', 0, 2, 'Second')
    expect(radWarnings(b.process, { position: () => null })).toEqual([])
    expect(codes(b)).toEqual(['dead-end'])
    expect(radWarnings(b.process, { position: undefined }).map((w) => w.code)).toEqual([])
    b.line('a', 'b')
    expect(codes(b)).toEqual([])
  })

  it('does not apply to end markers, refinements, loop-back sources or the last element of a column', () => {
    const b = small()
    b.el('a', 'r', 'RADActivity', 0, 0, 'First')
    b.el('e', 'r', 'RADEndMarker', 0, 1, 'End')
    b.el('b', 'r', 'RADActivity', 0, 2, 'Below the end')
    b.line('a', 'e')
    expect(codes(b)).toEqual([])
    const c = small()
    c.el('a', 'r', 'RADActivity', 0, 0, 'First')
    c.el('b', 'r', 'RADActivity', 0, 2, 'Second')
    c.line('a', 'b')
    c.line('b', 'a')
    expect(codes(c)).toEqual([])
  })
})

describe('warnings never block', () => {
  it('are plain data about elements and show in the layouts of the offending elements only', () => {
    const b = small()
    b.el('a', 'r', 'RADInteraction', 0, 0, 'Lonely interaction')
    setFields(b.engine, b.roles.get('r')?.model as Elem, { name: 'Filing' })
    expect(radWarningsByElement(b.process).get(b.v('a').model?._id ?? '')?.[0]?.code).toBe('interaction-unlinked')
    const layout = computeDiagramLayout(b.diagram, b.repository, b.measurer)
    const n = layout.nodes.get(b.v('a')._id) as NodeLayout<ActivityData>
    expect(n.data.warnLines).toHaveLength(n.data.lines.length)
    expect(n.data.warnTitle).toMatch(/not linked/)
    expect((layout.nodes.get(b.roles.get('r')?.view._id ?? '') as NodeLayout<RoleData>).data.warnLines).toEqual([])
    // Editing is never refused: the changes above went through, and nothing was corrected.
    expect(b.v('a').model?.['name']).toBe('Lonely interaction')
    void createNode
    void createEdge
  })
})
