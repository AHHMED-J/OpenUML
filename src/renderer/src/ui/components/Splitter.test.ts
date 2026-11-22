// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { Splitter } from './Splitter'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('Splitter', () => {
  it('a resize the system cancels ends, and the resize cursor goes away', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(createElement(Splitter, { orientation: 'vertical', size: 200, label: 'Resize', onResize: () => undefined })))
    const bar = host.querySelector('.splitter') as HTMLElement
    act(() => void bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 10 })))
    expect(document.body.classList.contains('resizing-x')).toBe(true)
    act(() => void bar.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })))
    expect(document.body.classList.contains('resizing-x')).toBe(false)
    act(() => root.unmount())
    host.remove()
  })
})
