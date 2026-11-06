import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectStore } from '../store'
import { cancelDialogsOnProjectChange } from './app/lifecycle'
import { cancelPendingDialog, pickElement, promptText, uiStore } from './uiStore'

const ui = () => uiStore.getState()

describe('a dialog left waiting', () => {
  afterEach(() => ui().openModal(null))

  it('answers "cancelled" when another dialog replaces it', async () => {
    const first = promptText('Rename', 'a')
    ui().openModal({ kind: 'preferences' })
    await expect(first).resolves.toBeNull()
    expect(ui().modal?.kind).toBe('preferences')
  })

  it('answers "cancelled" when another promise-based dialog replaces it', async () => {
    const first = promptText('Rename', 'a')
    const second = pickElement('Pick', ['UMLClass'])
    await expect(first).resolves.toBeNull()
    expect(ui().modal?.kind).toBe('picker')
    cancelPendingDialog()
    await expect(second).resolves.toBeNull()
    expect(ui().modal).toBeNull()
  })

  it('keeps the answer a dialog gives when it closes itself', async () => {
    const asked = promptText('Rename', 'a')
    const modal = ui().modal as { resolve: (v: string | null) => void }
    ui().openModal(null)
    modal.resolve('b')
    await expect(asked).resolves.toBe('b')
  })

  it('leaves dialogs that wait for nothing open', () => {
    ui().openModal({ kind: 'preferences' })
    cancelPendingDialog()
    expect(ui().modal?.kind).toBe('preferences')
  })

  it('answers "cancelled" when another project replaces the one it was asked about', async () => {
    const stop = cancelDialogsOnProjectChange()
    try {
      const asked = promptText('Rename', 'a')
      const notified = vi.fn()
      void asked.then(notified)
      projectStore.getState().newProject()
      await expect(asked).resolves.toBeNull()
      expect(ui().modal).toBeNull()
      expect(notified).toHaveBeenCalledWith(null)
    } finally {
      stop()
    }
  })

  it('stays open while the project only changes', async () => {
    const stop = cancelDialogsOnProjectChange()
    try {
      const asked = promptText('Rename', 'a')
      projectStore.getState().undo()
      expect(ui().modal?.kind).toBe('prompt')
      cancelPendingDialog()
      await asked
    } finally {
      stop()
    }
  })
})
