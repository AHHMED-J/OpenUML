import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
import { buildAppMenu } from './menus/appMenu'
import { idef0FormatMenu, idef0Menu } from './menus/idef0Menu'
import { resolveMenu } from './menus/menuModel'
import { idef0Context, idef0WarningCount } from './app/idef0'
import { registerAppCommands } from './app/appCommands'
import { Cmd } from './menus/commandIds'
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

describe('Add Diagram > IDEF0 Diagram on a function (Model Explorer)', () => {
  const setup = (): { registry: CommandRegistry; fnId: string } => {
    const ex = buildOrderExample()
    projectStore.getState().openProject(writeMdj(ex.project), null)
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    const a2 = projectStore.getState().repository.get(ex.a2._id) as Elem
    projectStore.getState().select({ elements: [a2._id] })
    return { registry, fnId: a2._id }
  }
  const boxesOf = (fnId: string): number => {
    const child = (projectStore.getState().repository.get(fnId) as Elem)['childDiagram'] as Elem | null
    return child ? (child['ownedViews'] as Elem[]).filter((v) => v._type === 'IDEF0FunctionView').length : -1
  }
  const answer = (text: string | null): void => {
    const modal = uiStore.getState().modal
    expect(modal?.kind).toBe('prompt')
    if (modal?.kind === 'prompt') {
      uiStore.getState().openModal(null)
      modal.resolve(text)
    }
  }

  it('asks for the number of child boxes and builds that many', async () => {
    const { registry, fnId } = setup()
    const done = registry.execute(Cmd.modelAddDiagram, { kind: 'IDEF0Diagram' })
    await Promise.resolve()
    answer('5')
    await done
    expect(boxesOf(fnId)).toBe(5)
  })

  it('re-asks on an invalid answer and changes nothing when cancelled', async () => {
    const { registry, fnId } = setup()
    const depth = projectStore.getState().engine.undoDepth
    const done = registry.execute(Cmd.modelAddDiagram, { kind: 'IDEF0Diagram' })
    await Promise.resolve()
    answer('9')
    await new Promise((r) => setTimeout(r, 0))
    answer(null)
    await done
    expect(boxesOf(fnId)).toBe(-1)
    expect(projectStore.getState().engine.undoDepth).toBe(depth)
  })

  it('still creates a new IDEF0 model on a project without asking', async () => {
    const { registry } = setup()
    projectStore.getState().select({ elements: [] })
    await registry.execute(Cmd.modelAddDiagram, { kind: 'IDEF0Diagram' })
    expect(uiStore.getState().modal).toBeNull()
  })
})

describe('File > Open Example', () => {
  it('lists the bundled examples and opens one as an untitled, warning-free project', async () => {
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    const file = resolveMenu(buildAppMenu('darwin'), { commands: registry, platform: 'darwin' }).find((m) => m.kind === 'submenu' && m.label === 'File')
    const entries = file?.kind === 'submenu' ? file.items.find((i) => i.kind === 'submenu' && i.label === 'Open Example') : undefined
    expect(entries?.kind === 'submenu' ? entries.items.map((i) => (i.kind === 'item' ? i.label : '')) : []).toEqual(['Software Release (IDEF0)'])
    vi.stubGlobal('document', { activeElement: null })
    vi.stubGlobal('HTMLElement', class {})
    projectStore.getState().newProject()
    await registry.execute(Cmd.fileOpenExample, 'software-release-idef0')
    const s = projectStore.getState()
    expect(s.filePath).toBeNull()
    expect(s.loadWarnings).toEqual([])
    const model = (s.project.ownedElements as Elem[]).find((e) => e._type === 'IDEF0Model') as Elem
    expect(((model['topFunction'] as Elem)['functions'] as Elem[]).length).toBe(6)
    await registry.execute(Cmd.fileOpenExample, 'unknown')
    vi.unstubAllGlobals()
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
    registerIdef0Commands(registry, { promptBoxCount: async () => 3, chooseBoxesToRemove: async () => null, openDiagram: () => undefined, showList: () => undefined, toast: () => undefined })
    const ctx = { commands: registry, platform: 'darwin' as const }
    projectStore.getState().openDiagram(ex.childDiagram._id)
    const model = resolveMenu([idef0Menu()], ctx)
    expect(model).toHaveLength(1)
    const sub = model[0]
    const labels = sub?.kind === 'submenu' ? sub.items.flatMap((i) => (i.kind === 'separator' ? [] : [i.label])) : []
    expect(labels).toEqual([
      'Decompose...',
      'Set Number of Child Boxes...',
      'Go to Parent Diagram',
      'Go to Child Diagram',
      'Renumber Boxes',
      'Synchronize Boundary Arrows',
      'Apply Title Block to Child Diagrams',
      'Add Boundary Arrow',
      'Tunnel Source End',
      'Tunnel Target End',
      'Reset Arrow Route',
      'Validate IDEF0 Model',
      'Show Node Index'
    ])
    const format = resolveMenu([idef0FormatMenu()], ctx)[0]
    expect(format?.kind === 'submenu' ? format.items.map((i) => (i.kind === 'item' ? [i.label, i.checked] : i.kind === 'submenu' ? [i.label] : [])) : []).toEqual([
      ['Status: Working', true],
      ['Status: Draft', false],
      ['Status: Recommended', false],
      ['Status: Publication', false],
      [],
      ['Sheet Size'],
      [],
      ['Color Arrows by Role', false]
    ])
    const sheet = format?.kind === 'submenu' ? format.items.find((i) => i.kind === 'submenu') : undefined
    expect(sheet?.kind === 'submenu' ? sheet.items.map((i) => (i.kind === 'item' ? [i.label, i.checked] : [])) : []).toEqual([
      ['Default (1008 × 752)', true],
      ['Letter Landscape', false],
      ['Letter Portrait', false],
      ['Legal Landscape', false],
      ['Legal Portrait', false],
      ['Tabloid/Ledger Landscape', false],
      ['Tabloid/Ledger Portrait', false],
      ['A4 Landscape', false],
      ['A4 Portrait', false],
      ['A3 Landscape', false],
      ['A3 Portrait', false],
      [],
      ['Fit to Content', undefined]
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
