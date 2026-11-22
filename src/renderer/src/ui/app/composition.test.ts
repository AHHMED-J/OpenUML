// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { shieldTextComposition } from './lifecycle'

describe('typing with an input method', () => {
  it('Enter that picks a candidate reaches no app handler; a plain Enter does', () => {
    const stop = shieldTextComposition()
    const input = document.createElement('input')
    document.body.append(input)
    const handler = vi.fn()
    document.addEventListener('keydown', handler)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', handler)
    input.remove()
    stop()
  })
})
