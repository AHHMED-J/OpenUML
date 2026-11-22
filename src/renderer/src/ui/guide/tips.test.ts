import { describe, expect, it } from 'vitest'
import { FIRST_STEPS } from './firstSteps'
import { doneTips, pickTip, placeTip, type GuideContext, type Tip } from './tips'

const ctx = (c: Partial<GuideContext> = {}): GuideContext => ({ diagramCount: 0, activeDiagramId: null, activeViewCount: 0, selectionCount: 0, ...c })
const onScreen = (): boolean => true
const ids = (tip: Tip | null): string | null => tip?.id ?? null

describe('first-step tips', () => {
  it('lead from an empty project to the first diagram, its first element and its properties', () => {
    const seen = new Set<string>()
    expect(ids(pickTip(FIRST_STEPS, ctx(), seen, onScreen))).toBe('first-steps.add-diagram')
    // A diagram is added: that step is done, the Toolbox comes next.
    const withDiagram = ctx({ diagramCount: 1, activeDiagramId: 'd1' })
    expect(doneTips(FIRST_STEPS, withDiagram, seen)).toEqual(['first-steps.add-diagram'])
    seen.add('first-steps.add-diagram')
    expect(ids(pickTip(FIRST_STEPS, withDiagram, seen, onScreen))).toBe('first-steps.toolbox')
    // An element is placed and selected: the Properties tip.
    const placed = ctx({ diagramCount: 1, activeDiagramId: 'd1', activeViewCount: 1, selectionCount: 1 })
    expect(doneTips(FIRST_STEPS, placed, seen)).toEqual(['first-steps.toolbox'])
    seen.add('first-steps.toolbox')
    expect(ids(pickTip(FIRST_STEPS, placed, seen, onScreen))).toBe('first-steps.properties')
    seen.add('first-steps.properties')
    expect(pickTip(FIRST_STEPS, placed, seen, onScreen)).toBeNull()
  })

  it('skip a tip whose target is not on screen and never show a done step', () => {
    const seen = new Set<string>()
    const noButton = (selector: string): boolean => !selector.includes('add-diagram')
    expect(pickTip(FIRST_STEPS, ctx(), seen, noButton)).toBeNull()
    // Opening a project with diagrams: the add-diagram step is done without being shown.
    const opened = ctx({ diagramCount: 3, activeDiagramId: 'd1', activeViewCount: 5 })
    expect(doneTips(FIRST_STEPS, opened, seen)).toEqual(['first-steps.add-diagram', 'first-steps.toolbox'])
    expect(pickTip(FIRST_STEPS, opened, seen, onScreen)).toBeNull()
  })

  it('wait for the step they belong to', () => {
    const seen = new Set(['first-steps.add-diagram'])
    // The Toolbox tip needs an empty diagram on screen; the Properties tip a selection.
    expect(pickTip(FIRST_STEPS, ctx({ diagramCount: 2 }), seen, onScreen)).toBeNull()
  })
})

describe('placeTip', () => {
  const view = { width: 1000, height: 700 }
  const box = { width: 200, height: 60 }

  it('puts the box on the preferred side with the arrow at the target middle', () => {
    const p = placeTip({ left: 400, top: 300, width: 120, height: 30 }, box, 'bottom', view)
    expect(p).toEqual({ side: 'bottom', left: 360, top: 340, arrow: 100 })
  })

  it('flips to the opposite side when the preferred one has no room', () => {
    const p = placeTip({ left: 400, top: 660, width: 120, height: 30 }, box, 'bottom', view)
    expect(p.side).toBe('top')
    expect(p.top).toBe(660 - 10 - 60)
  })

  it('slides along the edge to stay in the window, keeping the arrow on the target', () => {
    // A panel at the right edge: the box goes to its left, its arrow at the panel middle.
    const p = placeTip({ left: 760, top: 80, width: 240, height: 600 }, box, 'left', view)
    expect(p).toMatchObject({ side: 'left', left: 760 - 10 - 200, arrow: 30 })
    expect(p.top).toBe(380 - 30)
    // A target near the left edge: the box starts at the margin, the arrow moves along.
    const q = placeTip({ left: 0, top: 100, width: 40, height: 20 }, box, 'bottom', view)
    expect(q.left).toBe(8)
    expect(q.arrow).toBe(14)
  })
})
