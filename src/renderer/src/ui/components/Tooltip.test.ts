import { describe, expect, it } from 'vitest'
import { tooltipPosition } from './Tooltip'

const VIEW = { width: 1000, height: 700 }
const SIZE = { width: 120, height: 22 }

describe('tooltip placement', () => {
  it('centers the bubble below its button', () => {
    expect(tooltipPosition({ left: 100, top: 10, width: 28, height: 28 }, SIZE, VIEW)).toEqual({ left: 54, top: 44 })
  })

  it('goes above when it would leave the window at the bottom', () => {
    expect(tooltipPosition({ left: 100, top: 670, width: 28, height: 24 }, SIZE, VIEW).top).toBe(670 - 6 - 22)
  })

  it('stays inside the window at the left and right edges', () => {
    expect(tooltipPosition({ left: 0, top: 10, width: 28, height: 28 }, SIZE, VIEW).left).toBe(4)
    expect(tooltipPosition({ left: 980, top: 10, width: 20, height: 28 }, SIZE, VIEW).left).toBe(1000 - 4 - 120)
  })

  it('goes to the left of a button on the right edge, centered on it, and right when there is no room', () => {
    expect(tooltipPosition({ left: 970, top: 100, width: 26, height: 26 }, SIZE, VIEW, 'left')).toEqual({ left: 970 - 6 - 120, top: 102 })
    expect(tooltipPosition({ left: 50, top: 100, width: 26, height: 26 }, SIZE, VIEW, 'left').left).toBe(50 + 26 + 6)
  })
})
