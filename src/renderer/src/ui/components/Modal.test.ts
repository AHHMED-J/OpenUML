// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('Modal', () => {
  it('can take the focus itself, so Esc still closes it after a click on its text', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onClose = vi.fn()
    act(() => root.render(createElement(Modal, { title: 'About', onClose, children: createElement('p', null, 'Some text') })))
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement
    // A click on plain text focuses the nearest focusable ancestor: the dialog must be one.
    expect(dialog.getAttribute('tabindex')).toBe('-1')
    dialog.focus()
    expect(document.activeElement).toBe(dialog)
    act(() => void dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalled()
    act(() => root.unmount())
    host.remove()
  })
})
