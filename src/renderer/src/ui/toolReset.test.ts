import { afterEach, describe, expect, it } from 'vitest'
import { createDiagram } from '../commands'
import type { Elem } from '../model'
import { activeDiagram, projectStore } from '../store'
import { openClassDiagramProject } from '../store/testProject'
import { resetToolOnDiagramTypeChange } from './app/lifecycle'
import { uiStore } from './uiStore'

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
})

describe('the active tool and the diagram type', () => {
  it('drops the tool when a diagram of another type opens, even with the Toolbox hidden', () => {
    openClassDiagramProject()
    stop = resetToolOnDiagramTypeChange()
    const store = projectStore.getState()
    const main = activeDiagram(store) as Elem
    uiStore.getState().setTool({ kind: 'Class' })
    const sequence = createDiagram(store.engine, 'SequenceDiagram', main._parent as Elem).diagram
    projectStore.getState().openDiagram(sequence._id)
    expect(uiStore.getState().tool).toBeNull()
  })

  it('keeps the tool when another diagram of the same type opens', () => {
    openClassDiagramProject()
    stop = resetToolOnDiagramTypeChange()
    const store = projectStore.getState()
    const main = activeDiagram(store) as Elem
    const other = createDiagram(store.engine, 'ClassDiagram', main._parent as Elem).diagram
    uiStore.getState().setTool({ kind: 'Class' })
    projectStore.getState().openDiagram(other._id)
    expect(uiStore.getState().tool).not.toBeNull()
  })
})
