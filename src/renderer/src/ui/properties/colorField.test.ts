// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ColorField } from './StyleEditor'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('color in Styles', () => {
  it("with views of different colors, picking the first one's color still applies it to all", () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onCommit = vi.fn()
    act(() => root.render(createElement(ColorField, { id: 'fill', label: 'Fill', value: '#ff0000', mixed: true, onCommit })))
    const picker = host.querySelector('input[type="color"]') as HTMLInputElement
    picker.value = '#ff0000'
    act(() => void picker.dispatchEvent(new Event('change')))
    expect(onCommit).toHaveBeenCalledWith('#ff0000')
    act(() => root.unmount())
    host.remove()
  })
})
