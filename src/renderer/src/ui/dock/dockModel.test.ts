import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCK_LAYOUT,
  DOCK_PANEL_IDS,
  areaOf,
  describePosition,
  isAreaEmpty,
  movePanel,
  movePanelBy,
  movePanelToArea,
  resetLayout,
  sanitizeDockLayout,
  setPanelCollapsed,
  setPanelSizes,
  setPanelVisible,
  visiblePanels,
  type DockLayout
} from './dockModel'

const base = (): DockLayout => resetLayout()

function allPanels(layout: DockLayout): string[] {
  return [...layout.areas.left, ...layout.areas.right].sort()
}

describe('dock model: moving panels', () => {
  it('moves the toolbox to the left sidebar above Working Diagrams', () => {
    const next = movePanel(base(), 'toolbox', 'left', 'workingDiagrams')
    expect(next.areas.left).toEqual(['explorer', 'toolbox', 'workingDiagrams'])
    expect(next.areas.right).toEqual(['styles', 'properties', 'documentation', 'advancedArrows'])
    expect(areaOf(next, 'toolbox')).toBe('left')
  })

  it('appends at the end when beforeId is null or unknown in the area', () => {
    expect(movePanel(base(), 'toolbox', 'left', null).areas.left).toEqual(['explorer', 'workingDiagrams', 'toolbox'])
    expect(movePanel(base(), 'toolbox', 'left', 'styles').areas.left).toEqual(['explorer', 'workingDiagrams', 'toolbox'])
  })

  it('reorders within an area', () => {
    const next = movePanel(base(), 'documentation', 'right', 'toolbox')
    expect(next.areas.right).toEqual(['documentation', 'toolbox', 'styles', 'properties', 'advancedArrows'])
  })

  it('returns the same layout for a no-op move', () => {
    const layout = base()
    expect(movePanel(layout, 'styles', 'right', 'properties')).toBe(layout)
    expect(movePanel(layout, 'documentation', 'right', 'advancedArrows')).toBe(layout)
    expect(movePanel(layout, 'styles', 'right', 'styles')).not.toBe(undefined)
  })

  it('never duplicates or loses a panel', () => {
    let layout = base()
    const moves: Array<[(typeof DOCK_PANEL_IDS)[number], 'left' | 'right', (typeof DOCK_PANEL_IDS)[number] | null]> = [
      ['toolbox', 'left', 'explorer'],
      ['explorer', 'right', null],
      ['properties', 'left', 'toolbox'],
      ['toolbox', 'right', 'explorer'],
      ['workingDiagrams', 'left', null]
    ]
    for (const [id, area, before] of moves) {
      layout = movePanel(layout, id, area, before)
      expect(allPanels(layout)).toEqual([...DOCK_PANEL_IDS].sort())
    }
  })

  it('makes a hidden panel visible when it is moved', () => {
    const hidden = setPanelVisible(base(), 'toolbox', false)
    const next = movePanel(hidden, 'toolbox', 'left', null)
    expect(next.panels.toolbox.visible).toBe(true)
  })

  it('moves up and down among visible panels, skipping hidden ones', () => {
    let layout = setPanelVisible(base(), 'styles', false)
    layout = movePanelBy(layout, 'properties', -1)
    // Visible order was toolbox, properties, documentation → properties first.
    expect(visiblePanels(layout, 'right')).toEqual(['properties', 'toolbox', 'documentation'])
    layout = movePanelBy(layout, 'properties', 1)
    expect(visiblePanels(layout, 'right')).toEqual(['toolbox', 'properties', 'documentation'])
    expect(movePanelBy(layout, 'toolbox', -1)).toBe(layout)
    expect(movePanelBy(layout, 'documentation', 1)).toBe(layout)
  })

  it('moves to another area (end) and is a no-op for its own area', () => {
    const layout = base()
    expect(movePanelToArea(layout, 'explorer', 'left')).toBe(layout)
    expect(movePanelToArea(layout, 'explorer', 'right').areas.right.at(-1)).toBe('explorer')
  })

  it('describes the new position for announcements', () => {
    const next = movePanel(base(), 'toolbox', 'left', 'workingDiagrams')
    expect(describePosition(next, 'toolbox')).toBe('Toolbox moved to the left sidebar, position 2 of 3')
  })
})

describe('dock model: empty areas', () => {
  it('reports an area as empty when all its panels moved away or are hidden', () => {
    let layout = movePanel(base(), 'explorer', 'right', null)
    expect(isAreaEmpty(layout, 'left')).toBe(false)
    layout = movePanel(layout, 'workingDiagrams', 'right', null)
    expect(layout.areas.left).toEqual([])
    expect(isAreaEmpty(layout, 'left')).toBe(true)
    // Dropping into the empty area works.
    layout = movePanel(layout, 'toolbox', 'left', null)
    expect(layout.areas.left).toEqual(['toolbox'])
    expect(isAreaEmpty(setPanelVisible(layout, 'toolbox', false), 'left')).toBe(true)
  })
})

describe('dock model: sizes, collapse, visibility, reset', () => {
  it('clamps sizes and ignores unknown ids', () => {
    const next = setPanelSizes(base(), { toolbox: 3, styles: 99999, properties: Number.NaN, bogus: 10 } as never)
    expect(next.panels.toolbox.size).toBe(40)
    expect(next.panels.styles.size).toBe(5000)
    expect(next.panels.properties.size).toBe(40)
  })

  it('toggles collapsed and visible flags immutably', () => {
    const layout = base()
    const collapsed = setPanelCollapsed(layout, 'styles', true)
    expect(collapsed.panels.styles.collapsed).toBe(true)
    expect(layout.panels.styles.collapsed).toBe(false)
    expect(setPanelCollapsed(collapsed, 'styles', true)).toBe(collapsed)
    expect(setPanelVisible(layout, 'toolbox', true)).toBe(layout)
  })

  it('reset returns the default layout', () => {
    expect(resetLayout()).toEqual(DEFAULT_DOCK_LAYOUT)
    expect(resetLayout()).not.toBe(DEFAULT_DOCK_LAYOUT)
  })
})

describe('dock model: sanitizing persisted layouts', () => {
  it('falls back to the default for missing, corrupt or wrong-version data', () => {
    for (const value of [undefined, null, 42, 'x', [], {}, { version: 99, areas: { left: ['toolbox'] } }]) {
      expect(sanitizeDockLayout(value)).toEqual(DEFAULT_DOCK_LAYOUT)
    }
  })

  it('round-trips a valid layout', () => {
    const layout = setPanelCollapsed(movePanel(base(), 'toolbox', 'left', 'workingDiagrams'), 'styles', true)
    expect(sanitizeDockLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout)
  })

  it('drops unknown and duplicate ids and re-homes missing panels', () => {
    const layout = sanitizeDockLayout({
      version: 1,
      areas: { left: ['toolbox', 'bogus', 'toolbox', 'workingDiagrams'], right: ['documentation', 42] },
      panels: {}
    })
    expect(layout.areas.left).toEqual(['explorer', 'toolbox', 'workingDiagrams'])
    // styles/properties come back after their default predecessors (toolbox is elsewhere); a
    // layout saved before Advanced Arrows existed gets it after Documentation.
    expect(layout.areas.right).toEqual(['styles', 'properties', 'documentation', 'advancedArrows'])
    expect(layout.panels.advancedArrows.visible).toBe(false)
    expect(allPanels(layout)).toEqual([...DOCK_PANEL_IDS].sort())
  })

  it('repairs bad per-panel values', () => {
    const layout = sanitizeDockLayout({
      version: 1,
      areas: DEFAULT_DOCK_LAYOUT.areas,
      panels: {
        toolbox: { size: 'big', collapsed: 'yes', visible: false },
        styles: { size: -50, collapsed: true },
        properties: null
      }
    })
    expect(layout.panels.toolbox).toEqual({ size: 260, collapsed: false, visible: false })
    expect(layout.panels.styles).toEqual({ size: 40, collapsed: true, visible: true })
    expect(layout.panels.properties).toEqual(DEFAULT_DOCK_LAYOUT.panels.properties)
  })

  it('treats non-array areas as empty', () => {
    const layout = sanitizeDockLayout({ version: 1, areas: { left: 'explorer', right: { a: 1 } }, panels: {} })
    expect(layout).toEqual(DEFAULT_DOCK_LAYOUT)
  })
})
