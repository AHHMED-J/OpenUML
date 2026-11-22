// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { hashTarget } from './app'
import { ViewerEngine } from './engine'

describe('viewer camera animation', () => {
  it('an animation cut short by another still settles, so navigation never stays locked', async () => {
    const engine = new ViewerEngine(document.createElement('div'))
    const first = engine.animateTo({ cx: 100, cy: 0, scale: 2 }, 380)
    const second = engine.animateTo({ cx: 0, cy: 0, scale: 1 }, 0)
    const settled = await Promise.race([first.then(() => 'settled'), new Promise((r) => setTimeout(() => r('stuck'), 100))])
    expect(settled).toBe('settled')
    await second
  })
})

describe('viewer address', () => {
  it('reads the diagram id from the address, and ignores a malformed one', () => {
    expect(hashTarget('#Diagram%201')).toBe('Diagram 1')
    expect(hashTarget('#%E0%A4%A')).toBe('')
    expect(hashTarget('')).toBe('')
  })
})
