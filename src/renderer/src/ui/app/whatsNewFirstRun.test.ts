// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('./bridge', () => ({
  bridge: { getAppInfo: async () => ({ version: '0.1.9' }) },
  isMac: true,
  isWeb: false,
  platform: 'darwin'
}))

describe("What's New on a fresh install", () => {
  it('stays closed when the first launch opens a file (which stores a recent file first)', async () => {
    localStorage.clear()
    vi.resetModules()
    const { uiStore } = await import('../uiStore')
    const { showWhatsNewAfterUpdate } = await import('./whatsNew')
    // Opening the file the app was launched with writes the recent files before the check.
    uiStore.getState().addRecent('/Users/someone/Model.mdj')
    await showWhatsNewAfterUpdate()
    expect(uiStore.getState().modal).toBeNull()
    expect(uiStore.getState().prefs.lastSeenVersion).toBe('0.1.9')
  })
})
