import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { projectStore } from '../../store'
import { explorerLabel } from '../explorer/tree'
import { nameProjectAfterFile, openExample } from './fileOps'

const example = readFileSync(new URL('../../../../../examples/software-release-idef0.mdj', import.meta.url), 'utf8')

describe('opening a project', () => {
  it('lists every diagram in Working Diagrams in Model Explorer order, the default diagram active', async () => {
    vi.stubGlobal('document', { activeElement: null })
    vi.stubGlobal('HTMLElement', class {})
    projectStore.getState().newProject()
    await openExample(example)
    vi.unstubAllGlobals()
    const s = projectStore.getState()
    const label = (id: string): string => explorerLabel(s.repository.get(id)!).split(':')[0]!
    expect(s.openDiagramIds.map(label)).toEqual(['A-0 Context diagram', 'A0 Diagram', 'A3 Diagram'])
    expect(s.activeDiagramId).toBe(s.repository.defaultDiagram()?._id)
  })
})

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
