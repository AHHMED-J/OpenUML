import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry, createDiagram, createNode } from '../commands'
import type { Diagram, Elem, View } from '../model'
import { activeDiagram, projectStore } from '../store'
import { copySelection, pasteClipboard, registerDiagramCommands } from './commands'
import { ensureNotations } from './notations'

function setup(clipboard: { readText(): Promise<string>; writeText?(text: string): Promise<void> }): { diagram: Diagram; view: View } {
  ensureNotations()
  vi.stubGlobal('navigator', { clipboard: { writeText: async () => undefined, ...clipboard } })
  projectStore.getState().newProject()
  const diagram = activeDiagram(projectStore.getState()) as Diagram
  const view = createNode(projectStore.getState().engine, { kind: 'Class', diagram, left: 0, top: 0 }).view as View
  projectStore.getState().select({ views: [view._id] })
  expect(copySelection()).toBe(true)
  return { diagram, view }
}

describe('paste command', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not paste stale views when the system clipboard holds something else', async () => {
    const { diagram } = setup({ readText: async () => 'some text copied in another application' })
    const before = diagram.ownedViews.length
    expect(await pasteClipboard()).toEqual([])
    expect(diagram.ownedViews).toHaveLength(before)
  })

  it('falls back to the copied views when the system clipboard cannot be read', async () => {
    const { diagram } = setup({ readText: async () => Promise.reject(new Error('denied')) })
    const before = diagram.ownedViews.length
    expect(await pasteClipboard()).toHaveLength(1)
    expect(diagram.ownedViews).toHaveLength(before + 1)
  })

  it('tells the user why views were not pasted into another kind of diagram', async () => {
    const notify = vi.fn()
    const dispose = registerDiagramCommands(new CommandRegistry(), { getZoom: () => 1, setZoom: () => undefined, canHostView: () => false, notify })
    try {
      let text = ''
      const { diagram } = setup({ readText: async () => text, writeText: async (t) => void (text = t) })
      const store = projectStore.getState()
      const usecase = createDiagram(store.engine, 'UseCaseDiagram', diagram._parent as Elem).diagram
      store.openDiagram(usecase._id)
      expect(await pasteClipboard()).toEqual([])
      expect(usecase.ownedViews).toHaveLength(0)
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('cannot be pasted into this kind of diagram'))
    } finally {
      dispose()
    }
  })
})
