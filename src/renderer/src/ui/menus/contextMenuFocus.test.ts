// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { initCommands } from '../app/commands'
import { uiStore } from '../uiStore'
import { ContextMenuHost } from './ContextMenu'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('context menu focus', () => {
  it('gives the focus back to where it was (a tree row) when the menu closes', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    initCommands()
    const row = document.createElement('div')
    row.tabIndex = 0
    const host = document.createElement('div')
    document.body.append(row, host)
    const root = createRoot(host)
    act(() => root.render(createElement(ContextMenuHost)))
    row.focus()
    act(() => uiStore.getState().openContextMenu({ x: 10, y: 10, menu: 'zoom' }))
    expect(host.querySelector('.menu')).not.toBeNull()
    expect(document.activeElement).not.toBe(row)
    act(() => void (host.querySelector('.menu') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('.menu')).toBeNull()
    expect(document.activeElement).toBe(row)
    act(() => root.unmount())
    host.remove()
    row.remove()
  })
})
