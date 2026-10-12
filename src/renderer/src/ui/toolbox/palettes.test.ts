import { describe, expect, it } from 'vitest'
import { EDGE_KINDS, NODE_KINDS } from '../../model'
import { createUiStore } from '../uiStore'
import { PALETTES, palettesFor } from './palettes'

describe('palettes', () => {
  it('only uses node/edge kinds known to the model', () => {
    for (const group of PALETTES) {
      for (const item of group.items) {
        const known = item.gesture === 'line' ? item.kind in EDGE_KINDS : item.kind in NODE_KINDS || item.kind in EDGE_KINDS
        expect(known, `${group.id}/${item.id}`).toBe(true)
      }
    }
  })

  it('has unique item ids', () => {
    const ids = PALETTES.flatMap((g) => g.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('shows diagram-specific groups plus annotations', () => {
    const titles = (type: string | null) => palettesFor(type).map((g) => g.id)
    expect(titles('UMLClassDiagram')).toEqual(['classes-basic', 'classes-advanced', 'packages', 'instances', 'composite-structure', 'annotations'])
    expect(titles('UMLUseCaseDiagram')).toEqual(['use-cases', 'annotations'])
    expect(titles('UMLSequenceDiagram')).toEqual(['interactions-basic', 'interactions-advanced', 'annotations'])
    expect(titles('UMLActivityDiagram')).toEqual(['activities-basic', 'activities-advanced', 'annotations'])
    expect(titles('UMLStatechartDiagram')).toEqual(['statechart-basic', 'statechart-advanced', 'annotations'])
    expect(titles('UMLTimingDiagram')).toEqual(['timing', 'annotations'])
    expect(titles(null)).toEqual([])
  })

  it('distinguishes message sorts', () => {
    const seq = PALETTES.find((g) => g.id === 'interactions-basic')!
    const sorts = seq.items.filter((i) => i.kind === 'Message').map((i) => i.messageSort)
    expect(new Set(sorts)).toEqual(new Set(['synchCall', 'asynchCall', 'reply', 'createMessage', 'deleteMessage', 'asynchSignal']))
  })
})

describe('tool selection', () => {
  it('selects, locks on second click, releases on third; reverts after use unless locked', () => {
    const store = createUiStore()
    const cls = { kind: 'Class' }
    store.getState().clickTool(cls)
    expect(store.getState()).toMatchObject({ tool: cls, toolLocked: false })
    store.getState().toolUsed()
    expect(store.getState().tool).toBeNull()

    store.getState().clickTool(cls)
    store.getState().clickTool(cls)
    expect(store.getState().toolLocked).toBe(true)
    store.getState().toolUsed()
    expect(store.getState().tool).toEqual(cls)
    store.getState().clickTool(cls)
    expect(store.getState()).toMatchObject({ tool: null, toolLocked: false })

    store.getState().lockTool({ kind: 'Message', messageSort: 'reply' })
    store.getState().clickTool({ kind: 'Message', messageSort: 'asynchCall' })
    expect(store.getState()).toMatchObject({ tool: { kind: 'Message', messageSort: 'asynchCall' }, toolLocked: false })
  })

  it('clamps zoom per diagram', () => {
    const store = createUiStore()
    store.getState().setZoom('d1', 5)
    store.getState().setZoom('d2', 0.01)
    expect(store.getState().zoomOf('d1')).toBe(3)
    expect(store.getState().zoomOf('d2')).toBe(0.1)
    expect(store.getState().zoomOf('d3')).toBe(1)
  })
})
