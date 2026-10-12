import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUiStore } from '../uiStore'
import { DEFAULT_DOCK_LAYOUT } from './dockModel'

/** In-memory localStorage so the store's persistence can be observed. */
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k)
  })
  return data
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui store docking', () => {
  it('starts from the default layout and persists moves', () => {
    const data = stubStorage()
    const store = createUiStore()
    expect(store.getState().dock).toEqual(DEFAULT_DOCK_LAYOUT)
    store.getState().moveDockPanel('toolbox', 'left', 'workingDiagrams')
    expect(store.getState().dock.areas.left).toEqual(['explorer', 'toolbox', 'workingDiagrams'])
    expect(store.getState().dockAnnouncement.text).toBe('Toolbox moved to the left sidebar, position 2 of 3')
    const saved = JSON.parse(data.get('openuml.layout') ?? '{}')
    expect(saved.dock.areas.left).toEqual(['explorer', 'toolbox', 'workingDiagrams'])
    // A new store (relaunch) restores it.
    expect(createUiStore().getState().dock.areas.left).toEqual(['explorer', 'toolbox', 'workingDiagrams'])
  })

  it('falls back to the default for a corrupt persisted layout', () => {
    stubStorage({ 'openuml.layout': '{"dock": {"version": 1, "areas": "nope"}}' })
    expect(createUiStore().getState().dock).toEqual(DEFAULT_DOCK_LAYOUT)
    stubStorage({ 'openuml.layout': 'not json' })
    expect(createUiStore().getState().dock).toEqual(DEFAULT_DOCK_LAYOUT)
  })

  it('migrates the pre-docking layout keys', () => {
    stubStorage({
      'openuml.layout': JSON.stringify({
        panels: { toolbox: { visible: false, size: 300 }, editors: { visible: true, size: 380 }, workingDiagrams: { visible: true, size: 200 } },
        sections: { styles: false, properties: true }
      })
    })
    const dock = createUiStore().getState().dock
    expect(dock.panels.toolbox).toEqual({ size: 300, collapsed: false, visible: false })
    expect(dock.panels.workingDiagrams.size).toBe(200)
    expect(dock.panels.styles.collapsed).toBe(true)
    expect(dock.panels.properties.collapsed).toBe(false)
  })

  it('toggles panels wherever they are docked; Editors toggles all three editors', () => {
    stubStorage()
    const store = createUiStore()
    const s = (): ReturnType<typeof store.getState> => store.getState()
    s().moveDockPanel('toolbox', 'left', null)
    s().togglePanel('toolbox')
    expect(s().isPanelVisible('toolbox')).toBe(false)
    expect(s().dock.areas.left).toContain('toolbox')
    s().togglePanel('toolbox')
    expect(s().isPanelVisible('toolbox')).toBe(true)
    s().togglePanel('editors')
    expect(['styles', 'properties', 'documentation'].map((id) => s().dock.panels[id as 'styles'].visible)).toEqual([false, false, false])
    expect(s().isPanelVisible('editors')).toBe(false)
    s().togglePanel('editors')
    expect(s().isPanelVisible('editors')).toBe(true)
    s().togglePanel('sidebar')
    expect(s().isPanelVisible('sidebar')).toBe(false)
  })

  it('shows a hidden area when a panel is docked into it, and resets everything', () => {
    stubStorage()
    const store = createUiStore()
    const s = (): ReturnType<typeof store.getState> => store.getState()
    s().togglePanel('sidebar')
    s().moveDockPanel('toolbox', 'left', null)
    expect(s().panels.sidebar.visible).toBe(true)
    s().toggleDockCollapsed('styles')
    s().setDockPanelSizes({ explorer: 100 })
    s().resetLayout()
    expect(s().dock).toEqual(DEFAULT_DOCK_LAYOUT)
    expect(s().dockAnnouncement.text).toBe('Layout reset to default')
  })

  it('sets a size hint only when the move changes the layout', () => {
    stubStorage()
    const store = createUiStore()
    store.getState().moveDockPanel('styles', 'right', 'properties', 999)
    expect(store.getState().dock.panels.styles.size).toBe(DEFAULT_DOCK_LAYOUT.panels.styles.size)
    store.getState().moveDockPanel('styles', 'left', null, 210.4)
    expect(store.getState().dock.panels.styles.size).toBe(210)
  })
})
