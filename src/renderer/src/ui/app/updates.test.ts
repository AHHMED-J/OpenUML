import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uiStore } from '../uiStore'

const bridge = vi.hoisted(() => ({ checkForUpdates: vi.fn(), showMessageBox: vi.fn(), openExternal: vi.fn() }))
vi.mock('./bridge', () => ({ bridge, isMac: true, platform: 'darwin' }))

const { checkForUpdates, checkForUpdatesAtStartup } = await import('./updates')
const { windowTitle } = await import('./fileOps')

const newer = (latest: string) => ({ current: '0.1.8', latest, url: `https://example.test/${latest}`, available: true })
const offers = () => bridge.showMessageBox.mock.calls.length

beforeEach(() => {
  vi.clearAllMocks()
  uiStore.getState().setUpdate(null)
  uiStore.getState().setPrefs({ checkForUpdates: true })
  bridge.showMessageBox.mockResolvedValue(1) // Later
})

describe('update notices', () => {
  it('offers a newer version on every start, and keeps it known after Later', async () => {
    bridge.checkForUpdates.mockResolvedValue(newer('0.2.0'))
    await checkForUpdatesAtStartup()
    expect(offers()).toBe(1)
    expect(bridge.showMessageBox.mock.calls[0]?.[0]).toMatchObject({ message: 'OpenUML 0.2.0 is available' })
    expect(uiStore.getState().update?.version).toBe('0.2.0')
    await checkForUpdatesAtStartup()
    expect(offers()).toBe(2)
    expect(bridge.openExternal).not.toHaveBeenCalled()
  })

  it('opens the release page on Download', async () => {
    bridge.checkForUpdates.mockResolvedValue(newer('0.2.0'))
    bridge.showMessageBox.mockResolvedValue(0)
    await checkForUpdatesAtStartup()
    expect(bridge.openExternal).toHaveBeenCalledWith('https://example.test/0.2.0')
  })

  it('only interrupts a running app for a release it has not offered', async () => {
    bridge.checkForUpdates.mockResolvedValue(newer('0.2.0'))
    await checkForUpdates('daily')
    expect(offers()).toBe(1)
    await checkForUpdates('daily')
    expect(offers()).toBe(1)
    bridge.checkForUpdates.mockResolvedValue(newer('0.3.0'))
    await checkForUpdates('daily')
    expect(offers()).toBe(2)
  })

  it('says nothing when up to date, or when the check fails, unless asked', async () => {
    bridge.checkForUpdates.mockResolvedValue({ current: '0.1.8', latest: '0.1.8', url: 'x', available: false })
    await checkForUpdatesAtStartup()
    bridge.checkForUpdates.mockRejectedValue(new Error('offline'))
    await checkForUpdatesAtStartup()
    expect(offers()).toBe(0)
    await checkForUpdates('manual')
    expect(offers()).toBe(1)
  })

  it('stays quiet at startup when Preferences turned the check off', async () => {
    uiStore.getState().setPrefs({ checkForUpdates: false })
    await checkForUpdatesAtStartup()
    expect(bridge.checkForUpdates).not.toHaveBeenCalled()
  })

  it('forgets the notice once the app is up to date', async () => {
    bridge.checkForUpdates.mockResolvedValue(newer('0.2.0'))
    await checkForUpdatesAtStartup()
    bridge.checkForUpdates.mockResolvedValue({ current: '0.2.0', latest: '0.2.0', url: 'x', available: false })
    await checkForUpdatesAtStartup()
    expect(uiStore.getState().update).toBeNull()
  })
})

describe('window title', () => {
  it('shows the newer version next to the document name', () => {
    expect(windowTitle('/a/plan.mdj', 'x', true, '0.1.8', '0.2.0')).toBe('OpenUML 0.1.8 — plan.mdj • — New version 0.2.0 available')
    expect(windowTitle('/a/plan.mdj', 'x', false, '0.1.8')).toBe('OpenUML 0.1.8 — plan.mdj')
  })
})
