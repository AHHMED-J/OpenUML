import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isKindOf, type Elem } from '../../model'
import { projectStore } from '../../store'
import { revealInDiagram } from './appCommands'

const example = readFileSync(new URL('../../../../../examples/software-release-idef0.mdj', import.meta.url), 'utf8')

function functionNamed(name: string): Elem {
  const repo = projectStore.getState().repository
  const found = repo.findByType('IDEF0Function').find((f) => f['name'] === name)
  if (!found) throw new Error(`no function ${name}`)
  return found
}

describe('revealInDiagram', () => {
  it('opens the diagram that draws a box and selects the box there', () => {
    projectStore.getState().openProject(example, null)
    const s = projectStore.getState()
    expect(s.repository.get(s.activeDiagramId ?? '')?.['diagramKind']).toBe('context')

    const a6 = functionNamed('Monitor and Review Release')
    expect(revealInDiagram(a6)).toBe(true)
    const after = projectStore.getState()
    const active = after.repository.get(after.activeDiagramId ?? '') as Elem
    expect(isKindOf(active, 'IDEF0Diagram')).toBe(true)
    expect(active['diagramKind']).not.toBe('context')
    expect(after.selectedElementIds).toEqual([a6._id])
    const view = after.repository.get(after.selectedViewIds[0] ?? '') as Elem
    expect(view['model']).toBe(a6)
  })

  it('returns false for an element that no diagram draws', () => {
    projectStore.getState().openProject(example, null)
    expect(revealInDiagram(projectStore.getState().project as unknown as Elem)).toBe(false)
  })
})
