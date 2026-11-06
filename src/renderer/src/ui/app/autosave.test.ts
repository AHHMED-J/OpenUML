import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectStore } from '../../store'
import { uiStore } from '../uiStore'
import { startAutosave } from './autosave'
import { isMac } from './bridge'
import { handleCloseRequest } from './fileOps'

const fake = vi.hoisted(() => ({
  answer: null as ((choice: number) => void) | null,
  writes: 0
}))

vi.mock('./bridge', async (original) => ({
  ...(await original<typeof import('./bridge')>()),
  bridge: {
    showMessageBox: () => new Promise<number>((resolve) => (fake.answer = resolve)),
    writeTextFile: async () => void fake.writes++,
    addRecentDocument: () => undefined,
    saveRecovery: async () => undefined,
    clearRecovery: async () => undefined,
    confirmClose: () => undefined
  }
}))

describe('auto-save while asking about unsaved changes', () => {
  let stop = (): void => undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { activeElement: null })
    vi.stubGlobal('HTMLElement', class {})
    fake.writes = 0
    projectStore.getState().newProject()
    projectStore.getState().markSaved('/some/folder/model.mdj')
    uiStore.getState().setPrefs({ autoSaveSeconds: 60 })
    stop = startAutosave()
    const { engine, project } = projectStore.getState()
    engine.transact('Rename', (b) => b.set(project, 'name', 'Changed'))
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not write the file behind "Don\'t Save", and goes on if the user cancels', async () => {
    const asked = handleCloseRequest()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fake.answer).not.toBeNull()
    expect(fake.writes).toBe(0)

    fake.answer?.(isMac ? 1 : 2) // Cancel
    await asked
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fake.writes).toBe(1)
  })
})
