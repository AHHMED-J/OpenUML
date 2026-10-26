import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUiStore } from './uiStore'

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

describe('preferences', () => {
  it('keeps grid sizes from 2 to 64 and replaces others with the default', () => {
    stubStorage({ 'openuml.preferences': JSON.stringify({ gridSize: 64, defaultFontSize: 16 }) })
    const store = createUiStore()
    expect(store.getState().prefs.gridSize).toBe(64)
    expect(store.getState().prefs.defaultFontSize).toBe(16)
    store.getState().setPrefs({ gridSize: 65 })
    expect(store.getState().prefs.gridSize).toBe(8)
    store.getState().setPrefs({ gridSize: 1 })
    expect(store.getState().prefs.gridSize).toBe(8)
    store.getState().setPrefs({ gridSize: 24 })
    expect(store.getState().prefs.gridSize).toBe(24)
  })

  it('persists the grid and font sizes for the next launch', () => {
    const data = stubStorage()
    createUiStore().getState().setPrefs({ gridSize: 16, defaultFontSize: 20 })
    expect(JSON.parse(data.get('openuml.preferences') ?? '{}')).toMatchObject({ gridSize: 16, defaultFontSize: 20 })
    expect(createUiStore().getState().prefs).toMatchObject({ gridSize: 16, defaultFontSize: 20 })
  })

  it('keeps an offered auto-save interval and the update check flag', () => {
    stubStorage({ 'openuml.preferences': JSON.stringify({ autoSaveSeconds: 300, checkForUpdates: false }) })
    expect(createUiStore().getState().prefs).toMatchObject({ autoSaveSeconds: 300, checkForUpdates: false })
    stubStorage({ 'openuml.preferences': JSON.stringify({ autoSaveSeconds: 7, checkForUpdates: 'no' }) })
    expect(createUiStore().getState().prefs).toMatchObject({ autoSaveSeconds: 60, checkForUpdates: true })
  })

  it('keeps the What\'s New opt-out and last seen version, and replaces unusable values', () => {
    stubStorage({ 'openuml.preferences': JSON.stringify({ showWhatsNew: false, lastSeenVersion: '0.1.6' }) })
    expect(createUiStore().getState().prefs).toMatchObject({ showWhatsNew: false, lastSeenVersion: '0.1.6' })
    stubStorage({ 'openuml.preferences': JSON.stringify({ showWhatsNew: 'no', lastSeenVersion: 'latest' }) })
    expect(createUiStore().getState().prefs).toMatchObject({ showWhatsNew: true, lastSeenVersion: null })
  })

  it('persists the last seen version, and a reset keeps it', () => {
    const data = stubStorage()
    const store = createUiStore()
    store.getState().setPrefs({ lastSeenVersion: '0.1.6', showWhatsNew: false })
    expect(JSON.parse(data.get('openuml.preferences') ?? '{}')).toMatchObject({ lastSeenVersion: '0.1.6', showWhatsNew: false })
    store.getState().resetPrefs()
    expect(store.getState().prefs).toMatchObject({ lastSeenVersion: '0.1.6', showWhatsNew: true })
    expect(createUiStore().getState().prefs.lastSeenVersion).toBe('0.1.6')
  })
})
