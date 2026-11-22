// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  localStorage.clear()
})

describe('first-run layout', () => {
  it('the browser version starts in the compact layout', async () => {
    vi.stubGlobal('openuml', { web: true, platform: 'darwin' })
    const { uiStore } = await import('./uiStore')
    expect(uiStore.getState().prefs.toolbarMode).toBe('compact')
  })

  it('the desktop app starts in the normal layout', async () => {
    const { uiStore } = await import('./uiStore')
    expect(uiStore.getState().prefs.toolbarMode).toBe('normal')
  })
})
