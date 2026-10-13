import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUiStore } from '../uiStore'

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

describe('explorer arrow folders state', () => {
  it('groups arrows by default and remembers the choice per viewer', () => {
    stubStorage()
    const store = createUiStore()
    expect(store.getState().groupArrows).toBe(true)
    store.getState().setGroupArrows(false)
    expect(createUiStore().getState().groupArrows).toBe(false)
  })

  it('keeps folders open by default and persists the collapsed ones', () => {
    const data = stubStorage()
    const store = createUiStore()
    expect(store.getState().collapsedFolders).toEqual({})
    store.getState().setFoldersCollapsed(['box1/input', 'box1/output'], true)
    store.getState().setFoldersCollapsed(['box1/input'], false)
    expect(store.getState().collapsedFolders).toEqual({ 'box1/output': true })
    expect(JSON.parse(data.get('openuml.explorerCollapsedFolders') ?? '[]')).toEqual(['box1/output'])
    expect(createUiStore().getState().collapsedFolders).toEqual({ 'box1/output': true })
  })

  it('ignores a corrupt saved folder list', () => {
    stubStorage({ 'openuml.explorerCollapsedFolders': '{"a": 1}' })
    expect(createUiStore().getState().collapsedFolders).toEqual({})
    stubStorage({ 'openuml.explorerCollapsedFolders': '["ok", 3]' })
    expect(createUiStore().getState().collapsedFolders).toEqual({ ok: true })
  })
})
