import { afterEach, describe, expect, it, vi } from 'vitest'
import { HIGHLIGHT_MS, highlightedViewIds, highlightViews, subscribeHighlight } from './highlight'

describe('view highlight', () => {
  afterEach(() => {
    vi.useRealTimers()
    highlightViews([])
  })

  it('highlights views and clears itself after two seconds', () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const unsubscribe = subscribeHighlight(() => calls.push(highlightedViewIds().length))
    highlightViews(['v1', 'v2'])
    expect(highlightedViewIds()).toEqual(['v1', 'v2'])
    vi.advanceTimersByTime(HIGHLIGHT_MS - 1)
    expect(highlightedViewIds()).toEqual(['v1', 'v2'])
    vi.advanceTimersByTime(1)
    expect(highlightedViewIds()).toEqual([])
    expect(calls).toEqual([2, 0])
    unsubscribe()
  })

  it('restarts the two seconds when a new highlight is requested', () => {
    vi.useFakeTimers()
    highlightViews(['a'])
    vi.advanceTimersByTime(1500)
    highlightViews(['b'])
    vi.advanceTimersByTime(1500)
    expect(highlightedViewIds()).toEqual(['b'])
    vi.advanceTimersByTime(500)
    expect(highlightedViewIds()).toEqual([])
  })
})
