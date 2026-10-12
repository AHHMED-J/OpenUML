import { describe, expect, it } from 'vitest'
import { computeDropTarget, isNoopTarget, sameTarget, type StackGeometry } from './dropTarget'

// Left stack: explorer 40–440, working diagrams 440–600. Right stack: toolbox 40–300, styles 300–420,
// properties 420–600.
const left: StackGeometry = {
  area: 'left',
  rect: { left: 0, top: 40, right: 260, bottom: 600 },
  panels: [
    { id: 'explorer', top: 40, bottom: 440 },
    { id: 'workingDiagrams', top: 440, bottom: 600 }
  ]
}
const right: StackGeometry = {
  area: 'right',
  rect: { left: 900, top: 40, right: 1200, bottom: 600 },
  panels: [
    { id: 'toolbox', top: 40, bottom: 300 },
    { id: 'styles', top: 300, bottom: 420 },
    { id: 'properties', top: 420, bottom: 600 }
  ]
}
const stacks = [left, right]

describe('computeDropTarget', () => {
  it('targets above Working Diagrams when hovering the lower half of the explorer', () => {
    expect(computeDropTarget({ pointer: { x: 100, y: 400 }, stacks, dragged: 'toolbox' })).toEqual({
      area: 'left',
      beforeId: 'workingDiagrams',
      index: 1
    })
  })

  it('uses the vertical midpoint to choose before/after', () => {
    expect(computeDropTarget({ pointer: { x: 100, y: 200 }, stacks, dragged: 'toolbox' })?.beforeId).toBe('explorer')
    expect(computeDropTarget({ pointer: { x: 100, y: 500 }, stacks, dragged: 'toolbox' })?.beforeId).toBe('workingDiagrams')
    expect(computeDropTarget({ pointer: { x: 100, y: 590 }, stacks, dragged: 'toolbox' })).toEqual({ area: 'left', beforeId: null, index: 2 })
  })

  it('ignores the dragged panel itself', () => {
    // Over the toolbox's own lower half: the next non-dragged panel is styles.
    expect(computeDropTarget({ pointer: { x: 1000, y: 250 }, stacks, dragged: 'toolbox' })).toEqual({
      area: 'right',
      beforeId: 'styles',
      index: 0
    })
  })

  it('returns null outside every stack (center diagram area)', () => {
    expect(computeDropTarget({ pointer: { x: 600, y: 300 }, stacks, dragged: 'toolbox' })).toBeNull()
    expect(computeDropTarget({ pointer: { x: 100, y: 10 }, stacks, dragged: 'toolbox' })).toBeNull()
  })

  it('honors horizontal tolerance', () => {
    expect(computeDropTarget({ pointer: { x: 270, y: 100 }, stacks, dragged: 'toolbox' })).toBeNull()
    expect(computeDropTarget({ pointer: { x: 270, y: 100 }, stacks, dragged: 'toolbox', tolerance: 12 })?.area).toBe('left')
  })

  it('targets an empty area through its edge zone', () => {
    const emptyLeft: StackGeometry = { area: 'left', rect: { left: 0, top: 40, right: 0, bottom: 600 }, panels: [] }
    const edges = [{ area: 'left' as const, rect: { left: 0, top: 40, right: 24, bottom: 600 } }]
    expect(computeDropTarget({ pointer: { x: 10, y: 300 }, stacks: [emptyLeft, right], edges, dragged: 'toolbox' })).toEqual({
      area: 'left',
      beforeId: null,
      index: 0
    })
  })

  it('keeps the current target while the pointer is inside the open gap', () => {
    const current = { area: 'left' as const, beforeId: 'workingDiagrams' as const, index: 1 }
    const withGap: StackGeometry = {
      ...left,
      panels: [
        { id: 'explorer', top: 40, bottom: 300 },
        { id: 'workingDiagrams', top: 560, bottom: 600 }
      ],
      gap: { top: 300, bottom: 560 }
    }
    expect(computeDropTarget({ pointer: { x: 100, y: 320 }, stacks: [withGap], dragged: 'toolbox', current })).toBe(current)
    // Without a current target in that area the midpoint rule applies.
    expect(computeDropTarget({ pointer: { x: 100, y: 320 }, stacks: [withGap], dragged: 'toolbox' })?.beforeId).toBe('workingDiagrams')
  })
})

describe('target helpers', () => {
  it('compares targets by area and anchor', () => {
    expect(sameTarget({ area: 'left', beforeId: null, index: 2 }, { area: 'left', beforeId: null, index: 3 })).toBe(true)
    expect(sameTarget({ area: 'left', beforeId: null, index: 0 }, { area: 'right', beforeId: null, index: 0 })).toBe(false)
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget(null, { area: 'left', beforeId: null, index: 0 })).toBe(false)
  })

  it('detects drops that would not change the layout', () => {
    const order = ['toolbox', 'styles', 'properties'] as const
    expect(isNoopTarget({ area: 'right', beforeId: 'styles', index: 0 }, 'right', order, 'toolbox')).toBe(true)
    expect(isNoopTarget({ area: 'right', beforeId: 'properties', index: 1 }, 'right', order, 'toolbox')).toBe(false)
    expect(isNoopTarget({ area: 'right', beforeId: null, index: 2 }, 'right', order, 'properties')).toBe(true)
    expect(isNoopTarget({ area: 'left', beforeId: null, index: 0 }, 'right', order, 'toolbox')).toBe(false)
  })
})
