// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolbarOverflow } from './ToolbarOverflow'
import { Toolbar } from './Toolbar'
import { uiStore } from './uiStore'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let root: Root | null = null
let host: HTMLElement | null = null

function mount(element: React.ReactElement): HTMLElement {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(element))
  return host
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  uiStore.getState().setPrefs({ toolbarMode: 'normal' })
})

const trigger = (el: HTMLElement): HTMLButtonElement => el.querySelector('button[aria-haspopup]') as HTMLButtonElement
const panel = (el: HTMLElement): HTMLElement | null => el.querySelector('.toolbar-overflow')
const click = (b: Element): void => act(() => (b as HTMLButtonElement).click())

describe('compact toolbar drop-down', () => {
  it('closes after one of its buttons is used, which runs once', () => {
    const used: string[] = []
    const el = mount(
      createElement(ToolbarOverflow, null, [
        createElement('button', { key: 'a', onClick: () => used.push('a') }, 'A'),
        createElement('button', { key: 'b', onClick: () => used.push('b') }, 'B')
      ])
    )
    expect(panel(el)).toBeNull()
    click(trigger(el))
    expect(trigger(el).getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.textContent).toBe('A')
    click(panel(el)?.querySelectorAll('button')[1] as Element)
    expect(used).toEqual(['b'])
    expect(panel(el)).toBeNull()
    // The next button needs the drop-down opened again.
    click(trigger(el))
    click(panel(el)?.querySelector('button') as Element)
    expect(used).toEqual(['b', 'a'])
    expect(panel(el)).toBeNull()
  })

  it('closes with Esc, giving the focus back to its button, and with a click outside', () => {
    const el = mount(createElement(ToolbarOverflow, null, createElement('button', null, 'A')))
    click(trigger(el))
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(panel(el)).toBeNull()
    expect(document.activeElement).toBe(trigger(el))
    click(trigger(el))
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(panel(el)).toBeNull()
  })

  it('keeps every toolbar button: compact shows four on the bar and the rest in the drop-down', () => {
    const labels = (el: HTMLElement): string[] =>
      [...el.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label') as string).filter((l) => l !== 'More Tools')
    const normal = labels(mount(createElement(Toolbar)))
    act(() => root?.unmount())
    host?.remove()
    act(() => uiStore.getState().setPrefs({ toolbarMode: 'compact' }))
    const el = mount(createElement(Toolbar))
    const bar = labels(el)
    expect(bar).toEqual(['Save', 'Undo', 'Redo'])
    expect(el.querySelector('.toolbar-zoom')).not.toBeNull()
    click(trigger(el))
    expect([...labels(el)].sort()).toEqual([...normal].sort())
  })
})
