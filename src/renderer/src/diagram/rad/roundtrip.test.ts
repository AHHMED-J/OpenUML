/** `.mdj` round trip, palettes, Add menu and explorer of the RAD family, on the four worked examples. */
import { describe, expect, it } from 'vitest'
import { createDiagram, ModelEngine } from '../../commands'
import { readMdj, validateModel, writeMdj } from '../../format'
import { createDefaultProject, isKindOf, Repository, walk, type Diagram, type Elem } from '../../model'
import { explorerChildren, explorerLabel, dropField } from '../../ui/explorer/tree'
import { ADD_DIAGRAM_ITEMS, addDiagram, addDiagramItemsFor, addItemsFor, addModelElement } from '../../ui/modelActions'
import { PALETTES, palettesFor } from '../../ui/toolbox/palettes'
import { FixedWidthTextMeasurer } from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { ensureNotations } from '../notations'
import { RadBuilder, clerkFixture, insuranceFixture, legendFixture, letterFixture } from './fixtures'

const fixtures: Array<[string, () => RadBuilder]> = [
  ['insurance application', insuranceFixture],
  ['writing a letter', letterFixture],
  ['reviewing and sending letters', clerkFixture],
  ['legend', legendFixture]
]

describe('.mdj round trip', () => {
  for (const [name, make] of fixtures) {
    it(`writes and re-reads the ${name} example byte for byte`, () => {
      const b = make()
      const text = writeMdj(b.repository.project as Elem)
      const back = readMdj(text)
      expect(back.warnings).toEqual([])
      expect(writeMdj(back.project)).toBe(text)
      expect(validateModel(back.project)).toEqual([])
      expect(validateModel(b.repository.project as Elem)).toEqual([])
    })

    it(`lays out the re-read ${name} example like the original`, () => {
      ensureNotations()
      const b = make()
      const back = readMdj(writeMdj(b.repository.project as Elem))
      const measurer = new FixedWidthTextMeasurer()
      const original = computeDiagramLayout(b.diagram, b.repository, measurer)
      const diagram = Array.from(walk(back.project)).find((e) => e._type === 'RADDiagram') as Diagram
      const again = computeDiagramLayout(diagram, back.repository, measurer)
      expect(again.nodes.size).toBe(original.nodes.size)
      expect(again.edges.size).toBe(original.edges.size)
      expect(again.bounds).toEqual(original.bounds)
      const sig = (l: typeof original) => [...l.edges.values()].map((e) => JSON.stringify(e.points)).sort()
      expect(sig(again)).toEqual(sig(original))
    })
  }

  it('uses only the RAD type names and keeps defaults out of the file', () => {
    const b = insuranceFixture()
    const types = new Set(Array.from(walk(b.repository.project as Elem)).map((e) => e._type))
    for (const t of ['RADProcess', 'RADRole', 'RADActivity', 'RADInteraction', 'RADUndefinedProcess', 'RADPartRefinement', 'RADPartBranch', 'RADStateLine', 'RADInteractionLink', 'RADDiagram', 'RADRoleView', 'RADActivityView', 'RADRefinementView', 'RADBranchView', 'RADStateLineView', 'RADInteractionLinkView']) {
      expect(types, t).toContain(t)
    }
    const json = JSON.parse(writeMdj(b.repository.project as Elem))
    const process = json.ownedElements[1]
    expect(process._type).toBe('RADProcess')
    const line = process.roles[1].stateLines[0]
    expect(line).not.toHaveProperty('routing')
    expect(line).not.toHaveProperty('loopBack')
    expect(line).not.toHaveProperty('showArrow')
    expect(line.source.$ref).toBeTruthy()
    const link = process.interactions[0]
    expect(link).not.toHaveProperty('showDirection')
  })

  it('keeps non-default values and references', () => {
    const b = clerkFixture()
    const back = readMdj(writeMdj(b.repository.project as Elem))
    const els = Array.from(walk(back.project))
    expect(els.find((e) => e._type === 'RADStateLine' && e['loopBack'] === true)).toBeTruthy()
    const inter = els.find((e) => e._type === 'RADInteraction') as Elem
    expect(inter['externalParty']).toBe('Interaction with the author')
    const branch = els.find((e) => e._type === 'RADCaseBranch') as Elem
    expect((branch['refinement'] as Elem)._type).toBe('RADCaseRefinement')
    const start = els.find((e) => e._type === 'RADStateMarker') as Elem
    expect(start['kind']).toBe('start')
    const legend = readMdj(writeMdj(legendFixture().repository.project as Elem))
    const rs = Array.from(walk(legend.project)).find((e) => e._type === 'RADRoleStart' && e['role']) as Elem
    expect((rs['role'] as Elem)._type).toBe('RADRole')
  })

  it('preserves unknown RAD fields of newer files', () => {
    const b = insuranceFixture()
    const text = writeMdj(b.repository.project as Elem)
    const json = JSON.parse(text)
    json.ownedElements[1].roles[0].futureField = { nested: [1, 2, 3] }
    const back = readMdj(JSON.stringify(json))
    expect(JSON.parse(writeMdj(back.project)).ownedElements[1].roles[0].futureField).toEqual({ nested: [1, 2, 3] })
  })
})

describe('palette', () => {
  it('shows the RAD groups and the annotations on a RAD diagram', () => {
    expect(palettesFor('RADDiagram').map((g) => g.id)).toEqual(['rad-basic', 'rad-advanced', 'annotations'])
    const basic = PALETTES.find((g) => g.id === 'rad-basic')
    expect(basic?.items.map((i) => [i.label, i.gesture])).toEqual([
      ['Role', 'rect'],
      ['Activity', 'point'],
      ['Line', 'line'],
      ['Case Refinement', 'point'],
      ['Part Refinement', 'point'],
      ['Start', 'point'],
      ['End', 'point']
    ])
    expect(basic?.autoExpand).toEqual(['RADDiagram'])
    // The explicit interaction tools are in the advanced group.
    const advanced = PALETTES.find((g) => g.id === 'rad-advanced')
    expect(advanced?.items.slice(0, 2).map((i) => i.label)).toEqual(['Interaction', 'Interaction Link'])
    expect(palettesFor('UMLClassDiagram').some((g) => g.id.startsWith('rad'))).toBe(false)
  })
})

describe('Add menu and explorer', () => {
  function setup() {
    const repo = new Repository(createDefaultProject())
    return { repo, engine: new ModelEngine(repo), project: repo.project as Elem, model: (repo.project?.['ownedElements'] as Elem[])[0] as Elem }
  }

  it('offers Role Activity Diagram on projects, packages and processes', () => {
    const { project, model, engine } = setup()
    const label = 'Role Activity Diagram'
    expect(ADD_DIAGRAM_ITEMS.find((i) => i.kind === 'RADDiagram')?.type).toBe('RADDiagram')
    expect(addDiagramItemsFor(project).map((i) => i.label)).toContain(label)
    expect(addDiagramItemsFor(model).map((i) => i.label)).toContain(label)
    const diagram = addDiagram(engine, model, 'RADDiagram') as Diagram
    const process = diagram._parent as Elem
    expect(process._type).toBe('RADProcess')
    expect(addDiagramItemsFor(process).map((i) => i.label)).toContain(label)
    expect(addDiagramItemsFor(diagram).map((i) => i.label)).not.toContain(label)
  })

  it('offers RAD Process, Role and the element kinds under the right parents', () => {
    const { project, model, engine } = setup()
    const labels = (e: Elem): string[] => addItemsFor(e).map((i) => i.label)
    expect(labels(project)).toContain('RAD Process')
    expect(labels(model)).toContain('RAD Process')
    const process = addModelElement(engine, model, addItemsFor(model).find((i) => i.id === 'rad-process') as never)
    expect(process['name']).toBe('RADProcess1')
    expect(labels(process)).toEqual(['Role'])
    const role = addModelElement(engine, process, addItemsFor(process)[0] as never)
    expect(role['name']).toBe('Role1')
    expect((process['roles'] as Elem[])[0]).toBe(role)
    expect(labels(role)).toEqual(['Activity', 'Interaction', 'Undefined Process', 'State Marker', 'Wait', 'Role Start', 'Case Refinement', 'Part Refinement'])
    const act = addModelElement(engine, role, addItemsFor(role)[0] as never)
    expect(act).toMatchObject({ _type: 'RADActivity', name: 'Activity1' })
    expect(act._parent).toBe(role)
    expect(role['elements']).toEqual([act])
    const marker = addModelElement(engine, role, addItemsFor(role).find((i) => i.id === 'rad-state-marker') as never)
    expect(marker['name']).toBe('')
    expect(labels(act)).toEqual([])
  })

  it('lists process, role and element children in the explorer with readable labels', () => {
    const b = insuranceFixture()
    const process = b.process
    const kids = explorerChildren(process)
    expect(kids[0]?._type).toBe('RADDiagram')
    expect(kids.filter((k) => k._type === 'RADRole')).toHaveLength(2)
    expect(kids.filter((k) => k._type === 'RADInteractionLink')).toHaveLength(2)
    const agent = (process['roles'] as Elem[])[1] as Elem
    const inner = explorerChildren(agent)
    expect(inner.some((e) => e._type === 'RADPartRefinement')).toBe(true)
    expect(inner.filter((e) => e._type === 'RADStateLine')).toHaveLength(11)
    const line = inner.find((e) => e._type === 'RADStateLine') as Elem
    expect(explorerLabel(line)).toBe('(Receive the application→Create a customer record)')
    expect(explorerLabel(agent)).toBe('Processing an insurance application')
  })

  it('does not let roles or elements be dropped onto packages or other kinds of owners', () => {
    const b = insuranceFixture()
    const model = b.repository.project?.['ownedElements'] as Elem[]
    const pkg = model[0] as Elem
    const agent = (b.process['roles'] as Elem[])[1] as Elem
    expect(dropField(pkg, agent)).toBeNull()
    expect(dropField(pkg, b.process)).toBe('ownedElements')
    void isKindOf
    void createDiagram
  })
})
