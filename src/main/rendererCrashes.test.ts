import { describe, expect, it } from 'vitest'
import { RendererCrashes } from './rendererCrashes'

describe('RendererCrashes', () => {
  it('reloads up to three crashes a minute, then gives up', () => {
    const crashes = new RendererCrashes()
    expect([0, 1, 2].map((t) => crashes.record(t * 1000))).toEqual([true, true, true])
    expect(crashes.gaveUp).toBe(false)
    expect(crashes.record(3000)).toBe(false)
    expect(crashes.gaveUp).toBe(true)
  })

  it('forgets crashes older than a minute', () => {
    const crashes = new RendererCrashes()
    for (const t of [0, 1, 2]) crashes.record(t * 1000)
    expect(crashes.record(70_000)).toBe(true)
    expect(crashes.gaveUp).toBe(false)
  })

  it('stays given up: nothing is left to answer the close prompt', () => {
    const crashes = new RendererCrashes()
    for (const t of [0, 1, 2, 3]) crashes.record(t * 1000)
    expect(crashes.record(120_000)).toBe(false)
    expect(crashes.gaveUp).toBe(true)
  })
})
