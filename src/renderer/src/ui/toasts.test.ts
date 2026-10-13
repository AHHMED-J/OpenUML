import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUiStore } from './uiStore'

afterEach(() => {
  vi.useRealTimers()
})

describe('toasts', () => {
  it('shows a repeated message once and keeps it up for the full time', () => {
    vi.useFakeTimers()
    const store = createUiStore()
    store.getState().toast("A Generalization can't connect an Actor to a Package")
    vi.advanceTimersByTime(3000)
    store.getState().toast("A Generalization can't connect an Actor to a Package")
    store.getState().toast('Something else')
    expect(store.getState().toasts.map((t) => t.text)).toEqual(["A Generalization can't connect an Actor to a Package", 'Something else'])
    // The first timer fires but no longer finds its toast; the replacement stays.
    vi.advanceTimersByTime(1000)
    expect(store.getState().toasts).toHaveLength(2)
    vi.advanceTimersByTime(3000)
    expect(store.getState().toasts).toHaveLength(0)
  })

  it('keeps an error and an info toast with the same text apart', () => {
    const store = createUiStore()
    store.getState().toast('Saved')
    store.getState().toast('Saved', 'error')
    expect(store.getState().toasts.map((t) => t.kind)).toEqual(['info', 'error'])
  })
})
