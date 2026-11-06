import { describe, expect, it, vi } from 'vitest'
import { createDiagram } from '../../commands'
import type { Elem } from '../../model'
import { projectStore } from '../../store'
import { saveJson } from '../persist'
import { loadRecoveredProject, nameProjectAfterFile } from './fileOps'

describe('nameProjectAfterFile', () => {
  it('names a project that still has the default name after the saved file', () => {
    projectStore.getState().newProject()
    expect(projectStore.getState().project.name).toBe('Untitled')
    expect(nameProjectAfterFile('/some/folder/Order System.mdj')).toBe(true)
    expect(projectStore.getState().project.name).toBe('Order System')
    projectStore.getState().undo()
    expect(projectStore.getState().project.name).toBe('Untitled')
  })

  it('keeps a name the user chose', () => {
    projectStore.getState().newProject()
    const { engine, project } = projectStore.getState()
    engine.transact('Rename', (b) => b.set(project, 'name', 'Mi Proyecto'))
    expect(nameProjectAfterFile('/some/folder/otro-nombre.mdj')).toBe(false)
    expect(projectStore.getState().project.name).toBe('Mi Proyecto')
  })
})

describe('opening a project', () => {
  function threeDiagrams(): { text: string; ids: string[] } {
    projectStore.getState().newProject()
    const { engine, project } = projectStore.getState()
    const model = project.ownedElements[0] as Elem
    createDiagram(engine, 'SequenceDiagram', model)
    createDiagram(engine, 'StatechartDiagram', model)
    return { text: projectStore.getState().serializeProject(), ids: projectStore.getState().repository.diagrams().map((d) => d._id) }
  }

  it('lists every diagram in Working Diagrams, not only the default one', () => {
    const { text, ids } = threeDiagrams()
    loadRecoveredProject(text, null)
    const s = projectStore.getState()
    expect([...s.openDiagramIds].sort()).toEqual([...ids].sort())
    expect(s.activeDiagramId).toBe(s.repository.defaultDiagram()?._id)
  })

  it('comes back to the diagram last on screen, even with a list remembered by an older version', () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value)
    })
    const { text, ids } = threeDiagrams()
    const path = '/some/folder/three.mdj'
    saveJson('workingDiagrams', { [path]: { open: [ids[0]], active: ids[2] } })
    loadRecoveredProject(text, path)
    expect(projectStore.getState().openDiagramIds).toHaveLength(3)
    expect(projectStore.getState().activeDiagramId).toBe(ids[2])
    vi.unstubAllGlobals()
  })
})
