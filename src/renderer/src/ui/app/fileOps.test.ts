import { describe, expect, it } from 'vitest'
import { projectStore } from '../../store'
import { nameProjectAfterFile } from './fileOps'

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
