// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { initCommands } from './app/commands'
import { MenuBar } from './MenuBar'
import { buildAppMenu } from './menus/appMenu'
import { Cmd } from './menus/commandIds'
import type { MenuNode } from './menus/menuModel'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

/** Every node of a menu tree (function submenus left out: they build from the current model). */
function flatten(nodes: readonly MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => [n, ...(Array.isArray(n.submenu) ? flatten(n.submenu as MenuNode[]) : [])])
}

describe('web application menu', () => {
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    it(`leaves out what a browser tab cannot do (${platform})`, () => {
      const menu = buildAppMenu(platform, true)
      expect(menu.map((m) => m.label)).toEqual(['File', 'Edit', 'Format', 'Model', 'View', 'Window', 'Help'])
      const nodes = flatten(menu)
      expect(nodes.filter((n) => n.role).map((n) => n.role)).toEqual(['togglefullscreen'])
      for (const command of [Cmd.fileShowInFolder, Cmd.fileClose, Cmd.helpCheckForUpdates]) {
        expect(nodes.some((n) => n.command === command)).toBe(false)
      }
      // The macOS app menu's items are in File and Help.
      for (const command of [Cmd.appPreferences, Cmd.appKeyboardShortcuts, Cmd.helpAbout]) {
        expect(nodes.some((n) => n.command === command)).toBe(true)
      }
    })
  }

  it('keeps the desktop menu as it was', () => {
    const mac = buildAppMenu('darwin', false)
    expect(mac[0]?.label).toBe('OpenUML')
    expect(flatten(mac).some((n) => n.command === Cmd.fileShowInFolder)).toBe(true)
  })
})

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function mount(): HTMLElement {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  initCommands()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(MenuBar)))
  return host
}

const item = (el: HTMLElement, label: string): HTMLElement =>
  [...el.querySelectorAll<HTMLElement>('.menubar-item')].find((b) => b.textContent === label) as HTMLElement
const openLabel = (el: HTMLElement): string | null => el.querySelector('.menubar-item.open')?.textContent ?? null
const key = (target: Element, k: string): void =>
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

describe('menu bar', () => {
  it('opens a menu on press, moves between menus with the arrows, and Esc closes it', () => {
    const el = mount()
    act(() => void item(el, 'Edit').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(openLabel(el)).toBe('Edit')
    expect(el.querySelector('.menu')).not.toBeNull()
    key(el.querySelector('.menu') as Element, 'ArrowRight')
    expect(openLabel(el)).toBe('Format')
    key(el.querySelector('.menu') as Element, 'ArrowLeft')
    key(el.querySelector('.menu') as Element, 'ArrowLeft')
    expect(openLabel(el)).not.toBe('Format')
    key(el.querySelector('.menu') as Element, 'Escape')
    expect(el.querySelector('.menu')).toBeNull()
    expect(openLabel(el)).toBeNull()
  })

  it('opens on a click without a pointer press (screen readers)', () => {
    const el = mount()
    act(() => void item(el, 'Help').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })))
    expect(openLabel(el)).toBe('Help')
  })

  it('pressing the open menu again closes it, and F10 focuses the bar', () => {
    const el = mount()
    const file = el.querySelector<HTMLElement>('.menubar-item') as HTMLElement
    act(() => void file.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    act(() => void file.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(el.querySelector('.menu')).toBeNull()
    key(document.body, 'F10')
    expect(document.activeElement).toBe(file)
    key(file, 'ArrowDown')
    expect(el.querySelector('.menu')).not.toBeNull()
  })
})
