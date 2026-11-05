import { describe, expect, it } from 'vitest'
import { createDiagram, createNode, ModelEngine } from '../../../commands'
import { readMdj, writeMdj } from '../../../format'
import { createDefaultProject, createElement, Repository, type Diagram, type Elem, type View } from '../../../model'
import { propertyRows } from '../../../ui/properties/propertyRows'
import { FixedWidthTextMeasurer } from '../../core'
import { applyQuickEdit } from '../../editor/quickEditApply'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { NodeLayout } from '../../layout/types'
import { ensureNotations } from '../../notations'
import type { LifelineData } from './layout'
import { isActorLifeline, setLifelineActor } from './lifelineActor'
import { lifelineHeaderText } from './strings'

function setup() {
  ensureNotations()
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  const model = (repository.root?.['ownedElements'] as Elem[])[0] as Elem
  const diagram = createDiagram(engine, 'SequenceDiagram', model).diagram as Diagram
  const lifeline = (name: string): { view: View; model: Elem } => {
    const view = createNode(engine, { kind: 'Lifeline', diagram, left: 100, top: 40, width: 100, height: 200 }).view as View
    const element = view.model as Elem
    engine.transact('name', (b) => b.set(element, 'name', name))
    return { view, model: element }
  }
  const form = (view: View): string =>
    (computeDiagramLayout(diagram, repository, new FixedWidthTextMeasurer()).nodes.get(view._id) as NodeLayout<LifelineData>).data.form
  const actors = (): Elem[] => [...repository.elements()].filter((e) => e._type === 'UMLActor')
  return { repository, engine, model, diagram, lifeline, form, actors }
}

describe('lifeline as an actor', () => {
  it('draws the stick figure by typing the role with a new actor named after the lifeline', () => {
    const t = setup()
    const { view, model: lifeline } = t.lifeline('Cliente')
    expect(t.form(view)).toBe('box')
    setLifelineActor(t.engine, [lifeline], true)
    expect(t.form(view)).toBe('actor')
    const [actor] = t.actors()
    expect(actor?.['name']).toBe('Cliente')
    expect(actor?._parent).toBe(t.model)
    expect((lifeline['represent'] as Elem)['type']).toBe(actor)
    expect(lifelineHeaderText(lifeline)).toBe(': Cliente')
  })

  it('reuses the actor the model already has and undoes in one step', () => {
    const t = setup()
    const existing = createElement('UMLActor', { name: 'Cliente' })
    t.engine.transact('add', (b) => b.insert(t.model, 'ownedElements', existing))
    const { model: lifeline } = t.lifeline('Cliente')
    setLifelineActor(t.engine, [lifeline], true)
    expect(t.actors()).toEqual([existing])
    t.engine.undo()
    expect(isActorLifeline(lifeline)).toBe(false)
    expect(lifeline['name']).toBe('Cliente')
  })

  it('shares one new actor between lifelines marked together', () => {
    const t = setup()
    const a = t.lifeline('Cliente').model
    const b = t.lifeline('Cliente').model
    setLifelineActor(t.engine, [a, b], true)
    expect(t.actors()).toHaveLength(1)
    expect(isActorLifeline(a) && isActorLifeline(b)).toBe(true)
  })

  it('keeps an instance name beside a typed role, and goes back to the class it had', () => {
    const t = setup()
    const cls = createElement('UMLClass', { name: 'Estudiante' })
    t.engine.transact('add', (b) => b.insert(t.model, 'ownedElements', cls))
    const { view, model: lifeline } = t.lifeline('juan')
    t.engine.transact('type', (b) => b.set(lifeline['represent'] as Elem, 'type', cls))
    setLifelineActor(t.engine, [lifeline], true)
    expect(lifelineHeaderText(lifeline)).toBe('juan: Estudiante')
    expect(t.form(view)).toBe('actor')
    setLifelineActor(t.engine, [lifeline], false)
    expect((lifeline['represent'] as Elem)['type']).toBe(cls)
    expect(t.form(view)).toBe('box')
  })

  it('turns back into a box with its name, keeping the actor in the model', () => {
    const t = setup()
    const { view, model: lifeline } = t.lifeline('Cliente')
    setLifelineActor(t.engine, [lifeline], true)
    setLifelineActor(t.engine, [lifeline], false)
    expect(t.form(view)).toBe('box')
    expect(lifeline['name']).toBe('Cliente')
    expect(t.actors()).toHaveLength(1)
    setLifelineActor(t.engine, [lifeline], true)
    expect(t.actors()).toHaveLength(1)
  })

  it('stays an actor when its name is edited on the diagram', () => {
    const t = setup()
    const { view, model: lifeline } = t.lifeline('Lifeline1')
    setLifelineActor(t.engine, [lifeline], true)
    applyQuickEdit(t.engine, { kind: 'custom', elementId: lifeline._id, syntax: 'lifeline' }, 'Estudiante')
    expect(t.form(view)).toBe('actor')
    expect(lifelineHeaderText(lifeline)).toBe(': Estudiante')
    applyQuickEdit(t.engine, { kind: 'custom', elementId: lifeline._id, syntax: 'lifeline' }, 'ana: Profesor')
    expect(t.form(view)).toBe('actor')
    expect(lifelineHeaderText(lifeline)).toBe('ana: Profesor')
  })

  it('is written as a role typed by an actor, the only thing the file format has for it', () => {
    const t = setup()
    const { model: lifeline } = t.lifeline('Cliente')
    setLifelineActor(t.engine, [lifeline], true)
    const text = writeMdj(t.repository.root as Elem)
    expect(text).not.toContain('isActor')
    const json = JSON.parse(text) as Elem
    const found: Elem[] = []
    const visit = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(visit)
      else if (o && typeof o === 'object') {
        if ((o as Elem)._id) found.push(o as Elem)
        Object.values(o).forEach(visit)
      }
    }
    visit(json)
    const byId = new Map(found.map((e) => [e._id, e]))
    const saved = found.find((e) => e._id === lifeline._id) as Elem
    const role = byId.get((saved['represent'] as { $ref: string }).$ref) as Elem
    expect(role._type).toBe('UMLAttribute')
    expect(byId.get((role['type'] as { $ref: string }).$ref)?._type).toBe('UMLActor')
    const view = found.find((e) => e._type === 'UMLSeqLifelineView') as Elem
    expect(view['stereotypeDisplay']).toBe('icon')

    const reopened = readMdj(text).repository.get(lifeline._id) as Elem
    expect(isActorLifeline(reopened)).toBe(true)
  })

  it('keeps the view on the icon display that other tools need, both ways', () => {
    const t = setup()
    const { view, model: lifeline } = t.lifeline('Cliente')
    expect(view['stereotypeDisplay']).toBe('label')
    setLifelineActor(t.engine, [lifeline], true)
    expect(view['stereotypeDisplay']).toBe('icon')
    setLifelineActor(t.engine, [lifeline], false)
    expect(view['stereotypeDisplay']).toBe('label')
    t.engine.undo()
    expect(view['stereotypeDisplay']).toBe('icon')
  })

  it('moves the display along when the type is typed on the diagram', () => {
    const t = setup()
    const actor = createElement('UMLActor', { name: 'Cliente' })
    t.engine.transact('add', (b) => b.insert(t.model, 'ownedElements', actor))
    const { view, model: lifeline } = t.lifeline('x')
    applyQuickEdit(t.engine, { kind: 'custom', elementId: lifeline._id, syntax: 'lifeline' }, 'x: Cliente')
    expect(view['stereotypeDisplay']).toBe('icon')
    applyQuickEdit(t.engine, { kind: 'custom', elementId: lifeline._id, syntax: 'lifeline' }, 'x: Otro')
    expect(isActorLifeline(lifeline)).toBe(true)
    expect(view['stereotypeDisplay']).toBe('icon')
  })

  it('fixes files that typed the role by an actor but left the view on the label display', () => {
    const t = setup()
    const { view, model: lifeline } = t.lifeline('Cliente')
    setLifelineActor(t.engine, [lifeline], true)
    t.lifeline('Caja')
    const stale = writeMdj(t.repository.root as Elem).replace('"stereotypeDisplay": "icon"', '"stereotypeDisplay": "label"')
    expect(stale).not.toContain('"icon"')
    const { repository } = readMdj(stale)
    expect(repository.get(view._id)?.['stereotypeDisplay']).toBe('icon')
    const box = [...repository.elements()].find((e) => e._type === 'UMLSeqLifelineView' && e._id !== view._id)
    expect(box?.['stereotypeDisplay']).toBe('label')
  })

  it('offers the box right after the name, only on sequence diagrams', () => {
    const t = setup()
    const { model: lifeline } = t.lifeline('Cliente')
    const rows = propertyRows([lifeline])
    expect(rows.map((r) => r.key).slice(0, 2)).toEqual(['name', 'isActor'])
    expect(rows[1]).toMatchObject({ widget: 'checkbox', label: 'Is Actor', value: false, mixed: false })
    setLifelineActor(t.engine, [lifeline], true)
    expect(propertyRows([lifeline])[1]?.value).toBe(true)
    const other = t.lifeline('Otro').model
    expect(propertyRows([lifeline, other]).find((r) => r.key === 'isActor')?.mixed).toBe(true)
    const free = createElement('UMLLifeline', { name: 'x' })
    expect(propertyRows([free]).some((r) => r.key === 'isActor')).toBe(false)
  })
})
