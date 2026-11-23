// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNode } from '../../commands'
import type { Diagram, Elem, NodeView } from '../../model'
import { projectStore } from '../../store'
import { addDiagram } from '../modelActions'
import { StyleEditor } from './StyleEditor'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root | null = null
let host: HTMLElement | null = null

function mount(): HTMLElement {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(StyleEditor)))
  return host
}

const model = (): Elem => projectStore.getState().project.ownedElements[0] as Elem

function open(type: 'RADDiagram' | 'ClassDiagram'): Elem {
  const d = addDiagram(projectStore.getState().engine, model(), type)
  act(() => projectStore.getState().openDiagram(d._id))
  return d
}

beforeEach(() => projectStore.getState().newProject())

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

describe('Diagram style in Styles', () => {
  it('offers Classic and Colorful for the open RAD diagram, with nothing selected', () => {
    open('RADDiagram')
    const el = mount()
    const select = el.querySelector('#style-diagram-style') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(el.querySelector('label[for="style-diagram-style"]')?.textContent).toBe('Diagram style')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Classic', 'Colorful'])
    expect(select.value).toBe('classic')
    expect(el.textContent).toContain('Select views on the diagram to format them.')
  })

  it('changes the diagram in one undoable step', () => {
    const d = open('RADDiagram')
    const el = mount()
    const select = el.querySelector('#style-diagram-style') as HTMLSelectElement
    act(() => {
      select.value = 'colorful'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(d['diagramStyle']).toBe('colorful')
    expect((el.querySelector('#style-diagram-style') as HTMLSelectElement).value).toBe('colorful')
    expect(projectStore.getState().undoName).toBe('Change Diagram Style')
    act(() => projectStore.getState().undo())
    expect(d['diagramStyle']).toBe('classic')
    expect((el.querySelector('#style-diagram-style') as HTMLSelectElement).value).toBe('classic')
  })

  it('is not shown for other diagrams', () => {
    open('ClassDiagram')
    expect(mount().querySelector('#style-diagram-style')).toBeNull()
  })

  it('offers Compact Layout next to it, as one undoable step', () => {
    const diagram = open('RADDiagram') as Diagram
    const engine = projectStore.getState().engine
    const role = createNode(engine, { kind: 'RADRole', diagram, left: 40, top: 40, width: 400, height: 900 }).view as NodeView
    createNode(engine, { kind: 'RADActivity', diagram, left: 100, top: 100, container: role, name: 'First' })
    createNode(engine, { kind: 'RADActivity', diagram, left: 100, top: 500, container: role, name: 'Second' })
    const el = mount()
    const button = [...el.querySelectorAll('button')].find((x) => x.textContent === 'Compact Layout') as HTMLButtonElement
    expect(button).toBeDefined()
    act(() => button.click())
    expect(role.height).toBeLessThan(900)
    expect(projectStore.getState().undoName).toBe('Compact Layout')
    act(() => projectStore.getState().undo())
    expect(role.height).toBe(900)
  })
})
