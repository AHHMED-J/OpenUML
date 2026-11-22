// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { applyKeybindings, initCommands } from './app/commands'
import { Cmd } from './menus/commandIds'
import { Toolbar } from './Toolbar'
import { uiStore } from './uiStore'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

afterEach(() => act(() => uiStore.getState().setKeybindings({})))

describe('toolbar tooltips', () => {
  it('show a shortcut changed in Keyboard Shortcuts right away', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    initCommands()
    // As the app does at startup: the keymap follows the stored shortcuts.
    const stop = uiStore.subscribe((s, prev) => {
      if (s.keybindings !== prev.keybindings) applyKeybindings(s.keybindings)
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(createElement(Toolbar)))
    const saveTip = (): string => host.querySelector('[aria-label="Save"]')?.getAttribute('data-tip') ?? ''
    expect(saveTip()).toMatch(/S\)$/)
    act(() => uiStore.getState().setKeybindings({ [Cmd.fileSave]: ['f6'] }))
    expect(saveTip()).toBe('Save (F6)')
    act(() => root.unmount())
    host.remove()
    stop()
  })
})
