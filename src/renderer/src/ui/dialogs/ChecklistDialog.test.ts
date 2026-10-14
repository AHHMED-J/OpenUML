// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChecklistDialog } from './ChecklistDialog'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const rows = [
  { id: 'a', label: 'A1  First', detail: '2 arrows attached' },
  { id: 'b', label: 'A2  Second', detail: '1 arrow attached, has a child diagram that is removed too' },
  { id: 'c', label: 'A3  Third', detail: '0 arrows attached' }
]

describe('ChecklistDialog', () => {
  it('enables OK only while exactly the required number of rows is ticked and returns them in row order', () => {
    const resolve = vi.fn()
    act(() => root.render(createElement(ChecklistDialog, { title: 'Remove boxes', message: 'Tick 2.', rows, required: 2, resolve })))
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    const ok = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK') as HTMLButtonElement
    expect(boxes.every((b) => !b.checked)).toBe(true)
    expect(ok.disabled).toBe(true)
    expect(document.body.textContent).toContain('has a child diagram that is removed too')
    act(() => boxes[2]?.click())
    expect(ok.disabled).toBe(true)
    act(() => boxes[0]?.click())
    expect(ok.disabled).toBe(false)
    expect(document.body.textContent).toContain('2 of 2 selected')
    act(() => boxes[1]?.click())
    expect(ok.disabled).toBe(true)
    act(() => boxes[1]?.click())
    act(() => ok.click())
    expect(resolve).toHaveBeenCalledWith(['a', 'c'])
  })

  it('cancels with null', () => {
    const resolve = vi.fn()
    act(() => root.render(createElement(ChecklistDialog, { title: 'Remove boxes', message: '', rows, required: 1, resolve })))
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cancel') as HTMLButtonElement
    act(() => cancel.click())
    expect(resolve).toHaveBeenCalledWith(null)
  })
})
