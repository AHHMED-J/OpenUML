// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Elem } from '../../model'
import { projectStore } from '../../store'
import { NoDiagram } from '../diagramArea/DiagramArea'
import { addDiagramChoices } from '../menus/appMenu'
import { addDiagram } from '../modelActions'
import { uiStore } from '../uiStore'
import { createGuideStore, guideStore } from './guideStore'
import { TipLayer } from './TipLayer'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root | null = null
let host: HTMLElement | null = null

/** happy-dom lays nothing out: every element gets the same small box, so targets count as on screen. */
function fakeLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 300,
    top: 200,
    width: 120,
    height: 30,
    right: 420,
    bottom: 230,
    x: 300,
    y: 200,
    toJSON: () => ({})
  } as DOMRect)
}

function mount(...extra: React.ReactNode[]): HTMLElement {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement('div', null, createElement(NoDiagram), ...extra, createElement(TipLayer))))
  return host
}

const tipBox = (): HTMLElement | null => document.querySelector<HTMLElement>('.guide-tip')
const addButton = (): HTMLButtonElement => document.querySelector('[data-guide="add-diagram"]') as HTMLButtonElement
const model = (): Elem => projectStore.getState().project.ownedElements[0] as Elem

beforeEach(() => {
  fakeLayout()
  projectStore.getState().newProject()
  guideStore.getState().resetTips()
  uiStore.getState().resetPrefs()
  uiStore.getState().openModal(null)
  uiStore.getState().openContextMenu(null)
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
})

describe('a new project', () => {
  it('shows an empty canvas that offers Add Diagram, with the diagram types for the model', () => {
    mount()
    expect(document.body.textContent).toContain('Add a diagram to get started')
    act(() => addButton().click())
    expect(uiStore.getState().contextMenu).toMatchObject({ menu: 'add-diagram' })
    const labels = addDiagramChoices().map((n) => ('label' in n ? n.label : ''))
    expect(labels).toEqual(expect.arrayContaining(['Class Diagram', 'Use Case Diagram', 'Sequence Diagram', 'IDEF0 Diagram']))
  })

  it('keeps the old message when the project has diagrams but none is open', () => {
    const d = addDiagram(projectStore.getState().engine, model(), 'ClassDiagram')
    projectStore.getState().closeDiagram(d._id)
    mount()
    expect(document.body.textContent).toContain('No diagram is open.')
    expect(addButton()).toBeNull()
  })
})

describe('first-step tips', () => {
  it('point at Add Diagram, describe it and are announced', () => {
    mount()
    const box = tipBox()
    expect(box?.getAttribute('role')).toBe('dialog')
    expect(box?.textContent).toContain('Click here to add your first diagram.')
    expect(box?.className).toContain('guide-tip-bottom')
    const textId = box?.querySelector('.guide-tip-text')?.id as string
    expect(addButton().getAttribute('aria-describedby')).toBe(textId)
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Tip: Click here to add your first diagram.')
  })

  it('close for good with the ✕ button, and Esc returns to the target', () => {
    mount()
    act(() => (tipBox()?.querySelector('[aria-label="Close tip"]') as HTMLButtonElement).click())
    expect(tipBox()).toBeNull()
    expect(guideStore.getState().seen.has('first-steps.add-diagram')).toBe(true)
    expect(addButton().hasAttribute('aria-describedby')).toBe(false)

    act(() => guideStore.getState().resetTips())
    const close = tipBox()?.querySelector('[aria-label="Close tip"]') as HTMLButtonElement
    close.focus()
    act(() => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(tipBox()).toBeNull()
    expect(document.activeElement).toBe(addButton())
  })

  it('close when the user does what they say', () => {
    mount()
    act(() => addButton().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(guideStore.getState().seen.has('first-steps.add-diagram')).toBe(true)
    expect(tipBox()).toBeNull()
  })

  it('move on to the Toolbox once a diagram is added, then stop when it gets an element', () => {
    const toolbox = createElement('section', { 'data-dock-panel': 'toolbox', 'aria-label': 'Toolbox' })
    mount(toolbox)
    const d = addDiagram(projectStore.getState().engine, model(), 'ClassDiagram')
    act(() => projectStore.getState().openDiagram(d._id))
    expect(guideStore.getState().seen.has('first-steps.add-diagram')).toBe(true)
    expect(tipBox()?.textContent).toContain('Pick an element in the Toolbox')
    expect(document.querySelector('[data-dock-panel="toolbox"]')?.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('stay hidden behind dialogs and menus', () => {
    mount()
    act(() => uiStore.getState().openModal({ kind: 'preferences' }))
    expect(tipBox()).toBeNull()
    act(() => uiStore.getState().openModal(null))
    expect(tipBox()).not.toBeNull()
  })

  it('all stop with "Don\'t show tips again", and Preferences can bring them back', () => {
    mount()
    const off = [...(tipBox()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === "Don't show tips again") as HTMLButtonElement
    act(() => off.click())
    expect(uiStore.getState().prefs.showTips).toBe(false)
    expect(tipBox()).toBeNull()
    act(() => uiStore.getState().setPrefs({ showTips: true }))
    expect(tipBox()).not.toBeNull()
  })

  it('remember what was seen across restarts, ignoring a damaged record', () => {
    guideStore.getState().markSeen('first-steps.add-diagram', 'first-steps.toolbox')
    expect([...createGuideStore().getState().seen]).toEqual(['first-steps.add-diagram', 'first-steps.toolbox'])
    localStorage.setItem('openuml.tips', JSON.stringify({ seen: ['ok', 3, null] }))
    expect([...createGuideStore().getState().seen]).toEqual(['ok'])
    localStorage.setItem('openuml.tips', '{broken')
    expect(createGuideStore().getState().seen.size).toBe(0)
  })
})
