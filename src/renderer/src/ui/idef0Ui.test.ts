import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModelEngine } from '../commands'
import { writeMdj } from '../format'
import { buildOrderExample } from '../model/idef0-example'
import { EDGE_KINDS, NODE_KINDS, Repository, createDefaultProject, isKindOf, type Elem } from '../model'
import { projectStore } from '../store'
import { addDiagram, addDiagramItemsFor } from './modelActions'
import { explorerChildren, explorerLabel, typeOrder } from './explorer/tree'
import { RoleIcon, TypeIcon, ToolIcon } from './icons'
import { CommandRegistry } from '../commands'
import { registerIdef0Commands } from '../diagram'
import { idef0FormatMenu, idef0Menu } from './menus/idef0Menu'
import { resolveMenu } from './menus/menuModel'
import { idef0Context, idef0WarningCount } from './app/idef0'
import { palettesFor } from './toolbox/palettes'
import { uiStore } from './uiStore'

describe('IDEF0 toolbox palette', () => {
  it('shows one IDEF0 group, auto-expanded, plus the annotations', () => {
    const groups = palettesFor('IDEF0Diagram')
    expect(groups.map((g) => g.id)).toEqual(['idef0', 'annotations'])
    expect(groups[0]?.autoExpand).toEqual(['IDEF0Diagram'])
    expect(groups[0]?.items.map((i) => [i.label, i.gesture, i.kind])).toEqual([
      ['Function', 'rect', 'IDEF0Function'],
      ['Arrow', 'line', 'IDEF0Arrow'],
      ['Call Arrow', 'line', 'IDEF0Call'],
      ['Model Note', 'point', 'IDEF0ModelNote']
    ])
    for (const item of groups[0]?.items ?? []) expect(item.kind in NODE_KINDS || item.kind in EDGE_KINDS).toBe(true)
    expect(palettesFor('UMLClassDiagram').some((g) => g.id === 'idef0')).toBe(false)
  })
})

describe('Add Diagram entry', () => {
  it('offers IDEF0 Diagram on projects and packages, on undecomposed functions, never on a model', () => {
    const ex = buildOrderExample()
    const offered = (el: Elem): boolean => addDiagramItemsFor(el).some((i) => i.kind === 'IDEF0Diagram')
    expect(offered(ex.project)).toBe(true)
    expect(offered(ex.a2)).toBe(true)
    expect(offered(ex.top)).toBe(false)
    expect(offered(ex.model)).toBe(false)
    expect(offered(ex.contextDiagram)).toBe(false)
  })

  it('adds a model with its A-0 diagram on a project and a decomposition on a function', () => {
    const repository = new Repository(createDefaultProject())
    const engine = new ModelEngine(repository)
    const a0 = addDiagram(engine, repository.project as Elem, 'IDEF0Diagram')
    expect(a0['diagramKind']).toBe('context')
    const model = a0._parent as Elem
    expect(isKindOf(model, 'IDEF0Model')).toBe(true)
    const child = addDiagram(engine, model['topFunction'] as Elem, 'IDEF0Diagram')
    expect(child._parent).toBe(model['topFunction'])
    expect((model['topFunction'] as Elem)['childDiagram']).toBe(child)
    expect((child['ownedViews'] as Elem[]).filter((v) => v._type === 'IDEF0FunctionView')).toHaveLength(3)
    expect(() => addDiagram(engine, model['topFunction'] as Elem, 'IDEF0Diagram')).toThrow()
  })
})

describe('Model Explorer', () => {
  it('shows the decomposition tree, hides boundary ports and lists arrows under their boxes instead of their owner', () => {
    const ex = buildOrderExample()
    const kids = explorerChildren(ex.top)
    expect(kids.some((k) => k._type === 'IDEF0Port')).toBe(false)
    expect(kids.filter((k) => k._type === 'IDEF0Function').map((k) => k['name'])).toEqual(['Receive Order', 'Check Credit and Stock', 'Ship and Invoice'])
    expect(kids.filter((k) => k._type === 'IDEF0Arrow')).toHaveLength(0)
    expect(kids[0]?._type).toBe('IDEF0Diagram')
    expect(explorerChildren(ex.model).map((k) => k._type)).toEqual(['IDEF0Diagram', 'IDEF0Function'])
    expect(typeOrder(ex.model)).toBe(1004)
    expect(typeOrder(ex.top)).toBe(1211)
  })

  it('labels arrows with their name and ends', () => {
    const ex = buildOrderExample()
    const arrow = (ex.top['arrows'] as Elem[]).find((a) => a['name'] === 'Validated Order') as Elem
    expect(explorerLabel(arrow)).toBe('Validated Order (Receive Order→Check Credit and Stock)')
  })
})

describe('icons', () => {
  it('draws dedicated glyphs for IDEF0 types and tools', () => {
    const fallback = renderToStaticMarkup(createElement(TypeIcon, { type: 'NoSuchThing' }))
    for (const type of ['IDEF0Diagram', 'IDEF0Model', 'IDEF0Function', 'IDEF0Port', 'IDEF0Arrow', 'IDEF0ModelNote']) {
      expect(renderToStaticMarkup(createElement(TypeIcon, { type }))).not.toBe(fallback)
    }
    for (const kind of ['IDEF0Function', 'IDEF0Arrow', 'IDEF0Call', 'IDEF0ModelNote']) {
      expect(renderToStaticMarkup(createElement(ToolIcon, { kind }))).toContain('<svg')
    }
    expect(renderToStaticMarkup(createElement(ToolIcon, { kind: 'IDEF0Call' }))).not.toBe(renderToStaticMarkup(createElement(ToolIcon, { kind: 'IDEF0Arrow' })))
  })

  it('draws a distinct role icon and folder per ICOM role, tagged with its role color class', () => {
    const roles = ['input', 'control', 'output', 'mechanism', 'call']
    const icons = roles.map((role) => renderToStaticMarkup(createElement(RoleIcon, { role })))
    const folders = roles.map((role) => renderToStaticMarkup(createElement(RoleIcon, { role, folder: true })))
    expect(new Set(icons).size).toBe(5)
    expect(new Set(folders).size).toBe(5)
    roles.forEach((role, i) => expect(icons[i]).toContain(`role-${role}`))
  })
})

describe('IDEF0 menus', () => {
  it('shows Model > IDEF0 and Format > IDEF0 only while an IDEF0 diagram is active', () => {
    const ex = buildOrderExample()
    projectStore.getState().openProject(writeMdj(ex.project), null)
    const registry = new CommandRegistry()
    registerIdef0Commands(registry, { promptBoxCount: async () => 3, openDiagram: () => undefined, showList: () => undefined, toast: () => undefined })
    const ctx = { commands: registry, platform: 'darwin' as const }
    projectStore.getState().openDiagram(ex.childDiagram._id)
    const model = resolveMenu([idef0Menu()], ctx)
    expect(model).toHaveLength(1)
    const sub = model[0]
    const labels = sub?.kind === 'submenu' ? sub.items.flatMap((i) => (i.kind === 'separator' ? [] : [i.label])) : []
    expect(labels).toEqual([
      'Decompose...',
      'Go to Parent Diagram',
      'Go to Child Diagram',
      'Renumber Boxes',
      'Synchronize Boundary Arrows',
      'Add Boundary Arrow',
      'Tunnel Source End',
      'Tunnel Target End',
      'Validate IDEF0 Model',
      'Show Node Index'
    ])
    const format = resolveMenu([idef0FormatMenu()], ctx)[0]
    expect(format?.kind === 'submenu' ? format.items.map((i) => (i.kind === 'item' ? [i.label, i.checked] : [])) : []).toEqual([
      ['Status: Working', true],
      ['Status: Draft', false],
      ['Status: Recommended', false],
      ['Status: Publication', false]
    ])
    projectStore.getState().newProject()
    expect(resolveMenu([idef0Menu(), idef0FormatMenu()], ctx)).toEqual([])
  })
})

describe('IDEF0 shell services', () => {
  it('counts the warnings of the active diagram for the status bar', () => {
    const ex = buildOrderExample()
    projectStore.getState().openProject(writeMdj(ex.project), null)
    projectStore.getState().openDiagram(ex.childDiagram._id)
    expect(idef0WarningCount()).toBe(0)
    ;(projectStore.getState().repository.get(ex.a1._id) as Elem)['name'] = ''
    expect(idef0WarningCount()).toBe(1)
    projectStore.getState().newProject()
    expect(idef0WarningCount()).toBe(0)
  })

  it('shows result lists as a modal whose rows open and select', () => {
    const ex = buildOrderExample()
    projectStore.getState().openProject(writeMdj(ex.project), null)
    idef0Context.showList('Node Index', [{ text: 'A0  Process Customer Order', indent: 1, diagramId: ex.childDiagram._id }, { text: 'A1  Receive Order', indent: 2, elementId: ex.a1._id, diagramId: ex.childDiagram._id }])
    const modal = uiStore.getState().modal
    expect(modal?.kind).toBe('list')
    if (modal?.kind !== 'list') return
    expect(modal.items.map((i) => i.indent)).toEqual([1, 2])
    modal.items[1]?.onSelect?.()
    const state = projectStore.getState()
    expect(state.activeDiagramId).toBe(ex.childDiagram._id)
    expect(state.selectedViewIds).toHaveLength(1)
    expect(state.repository.get(state.selectedViewIds[0] as string)).toMatchObject({ _type: 'IDEF0FunctionView' })
    uiStore.getState().openModal(null)
  })
})
