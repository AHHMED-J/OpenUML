import { describe, expect, it } from 'vitest'
import * as core from './index'
import { COLORS, DASH, LineStyle, MIN_SIZES, SHADOW, SPACING, dashArray, isRectilinearStyle } from './style'

describe('style constants', () => {
  it('matches the spec defaults', () => {
    expect(COLORS.selection).toBe('#4f99ff')
    expect(COLORS.grid).toBe('#e0e0e0')
    expect(SHADOW).toMatchObject({ offsetX: 7, offsetY: 7, alpha: 0.2 })
    expect(DASH.dot).toEqual([3, 3])
    expect(DASH.operandSeparator).toEqual([10, 3])
    expect(SPACING.roundedEdgeRadius).toBe(8)
    expect(MIN_SIZES.useCase).toEqual({ width: 70, height: 32 })
    expect(MIN_SIZES.decision).toEqual({ width: 23, height: 19 })
  })

  it('maps persisted codes', () => {
    expect(isRectilinearStyle(LineStyle.Rectilinear)).toBe(true)
    expect(isRectilinearStyle(LineStyle.RoundedRectilinear)).toBe(true)
    expect(isRectilinearStyle(LineStyle.Oblique)).toBe(false)
    expect(dashArray('solid')).toEqual([])
  })

  it('exposes the public API from the index', () => {
    for (const name of ['parsePoints', 'obliqueJunction', 'routeEdge', 'placeEdgeLabel', 'endShapes', 'relationshipNotation', 'wrapText', 'hitTestEdge', 'snap']) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
