// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isKindOf, type Elem } from '../../model'
import { projectStore } from '../../store'
import { addDiagram } from '../modelActions'
import { StatusBar } from '../StatusBar'
import { uiStore } from '../uiStore'
import { DiagramArea } from './DiagramArea'
import { showsTabRow } from './WorkingDiagrams'

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
  act(() => root?.render(createElement('div', null, createElement(DiagramArea), createElement(StatusBar))))
  return host
}

/** A new project with exactly one diagram open; returns it and a second, closed one. */
function twoDiagrams(): { first: Elem; second: Elem } {
  const ps = projectStore.getState()
  ps.newProject()
  const s = projectStore.getState()
  for (const id of s.openDiagramIds) s.closeDiagram(id)
  const model = s.project['ownedElements'] as Elem[]
  const parent = model.find((e) => isKindOf(e, 'Model')) as Elem
  const first = addDiagram(s.engine, parent, 'ClassDiagram')
  const second = addDiagram(s.engine, parent, 'UseCaseDiagram')
  for (const id of projectStore.getState().openDiagramIds) projectStore.getState().closeDiagram(id)
  projectStore.getState().openDiagram(first._id)
  return { first, second }
}

const tabRow = (el: HTMLElement): Element | null => el.querySelector('[role="tablist"]')
const crumbs = (el: HTMLElement): string => el.querySelector('.breadcrumb')?.textContent ?? ''

beforeEach(() => act(() => uiStore.getState().setPrefs({ toolbarMode: 'compact' })))
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  uiStore.getState().setPrefs({ toolbarMode: 'normal' })
})

describe('diagram tab row', () => {
  it('shows in Normal mode with any open diagram, and in Compact mode only with two or more', () => {
    expect(showsTabRow('normal', 0)).toBe(false)
    expect(showsTabRow('normal', 1)).toBe(true)
    expect(showsTabRow('compact', 1)).toBe(false)
    expect(showsTabRow('compact', 2)).toBe(true)
  })

  it('compact: hides with one diagram, comes back with a second, hides again when one is closed', () => {
    const { first, second } = twoDiagrams()
    const el = mount()
    expect(tabRow(el)).toBeNull()
    // The diagram's name stays visible in the status bar path.
    expect(crumbs(el)).toContain(first['name'] as string)
    act(() => projectStore.getState().openDiagram(second._id))
    expect(tabRow(el)?.querySelectorAll('[role="tab"]').length).toBe(2)
    expect(crumbs(el)).not.toContain(second['name'] as string)
    act(() => projectStore.getState().closeDiagram(first._id))
    expect(tabRow(el)).toBeNull()
    expect(crumbs(el)).toContain(second['name'] as string)
  })

  it('normal: always shows the tab row with an open diagram, and the path stays the selection only', () => {
    act(() => uiStore.getState().setPrefs({ toolbarMode: 'normal' }))
    const { first } = twoDiagrams()
    const el = mount()
    expect(tabRow(el)?.querySelectorAll('[role="tab"]').length).toBe(1)
    expect(crumbs(el)).not.toContain(first['name'] as string)
  })
})
