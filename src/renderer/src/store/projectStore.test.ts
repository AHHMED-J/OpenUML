import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CommandIds, CommandRegistry, createDiagram, createNode, setFields } from '../commands'
import { FormatError } from '../format'
import type { Diagram, Elem, View } from '../model'
import { activeDiagram, createProjectStore, registerCoreCommands, selectedModels } from '.'

const exampleText = readFileSync(new URL('../format/fixtures/example.mdj', import.meta.url), 'utf8')

describe('project store', () => {
  it('starts with a default project: Model + class diagram "Main" open and active', () => {
    const store = createProjectStore()
    const s = store.getState()
    expect(s.project.name).toBe('Untitled')
    const diagram = activeDiagram(s) as Diagram
    expect(diagram).toMatchObject({ _type: 'UMLClassDiagram', name: 'Main' })
    expect(s.openDiagramIds).toEqual([diagram._id])
    expect(s.dirty).toBe(false)
    expect(s.filePath).toBeNull()
  })

  it('bumps version and tracks dirty/undo state on model changes', () => {
    const store = createProjectStore()
    const { engine, version } = store.getState()
    const diagram = activeDiagram(store.getState()) as Diagram
    createNode(engine, { kind: 'Class', diagram, left: 0, top: 0 })
    let s = store.getState()
    expect(s.version).toBe(version + 1)
    expect(s.dirty).toBe(true)
    expect(s.canUndo).toBe(true)
    expect(s.undoName).toBe('Create Class')

    s.markSaved('/tmp/file.mdj')
    s = store.getState()
    expect(s.dirty).toBe(false)
    expect(s.filePath).toBe('/tmp/file.mdj')

    s.undo()
    s = store.getState()
    expect(s.dirty).toBe(true)
    expect(s.canRedo).toBe(true)
    s.redo()
    expect(store.getState().dirty).toBe(false)
  })

  it('opens and serializes .mdj text; a failed open keeps the current project', () => {
    const store = createProjectStore()
    store.getState().openProject(exampleText, 'example.mdj')
    const s = store.getState()
    expect(s.project.name).toBe('Example')
    expect(s.activeDiagramId).toBe('ex-diagram')
    expect(s.dirty).toBe(false)
    expect(s.loadWarnings).toEqual([])
    expect(JSON.parse(s.serializeProject())).toEqual(JSON.parse(exampleText))

    expect(() => s.openProject('nope', 'bad.mdj')).toThrow(FormatError)
    expect(store.getState().project.name).toBe('Example')
  })

  it('manages diagram tabs and prunes deleted ids from tabs and selection', () => {
    const store = createProjectStore()
    const { engine, project } = store.getState()
    const main = activeDiagram(store.getState()) as Diagram
    const seq = createDiagram(engine, 'SequenceDiagram', project.ownedElements[0] as Elem).diagram
    store.getState().openDiagram(seq._id)
    expect(store.getState().openDiagramIds).toEqual([main._id, seq._id])
    expect(store.getState().activeDiagramId).toBe(seq._id)

    const lifeline = createNode(engine, { kind: 'Lifeline', diagram: seq, left: 50, top: 0 })
    store.getState().select({ views: [(lifeline.view as View)._id] })
    expect(selectedModels(store.getState())).toEqual([lifeline.model])

    engine.undo() // removes the lifeline → selection pruned
    expect(store.getState().selectedViewIds).toEqual([])
    engine.undo() // removes the sequence diagram → tab closed, previous tab active
    expect(store.getState().openDiagramIds).toEqual([main._id])
    expect(store.getState().activeDiagramId).toBe(main._id)

    store.getState().closeDiagram(main._id)
    expect(store.getState().activeDiagramId).toBeNull()
  })

  it('newProject replaces the project and resets history', () => {
    const store = createProjectStore()
    setFields(store.getState().engine, store.getState().project, { name: 'Changed' })
    store.getState().newProject()
    const s = store.getState()
    expect(s.project.name).toBe('Untitled')
    expect(s.dirty).toBe(false)
    expect(s.canUndo).toBe(false)
  })

  it('wires core commands into a registry', () => {
    const store = createProjectStore()
    const registry = new CommandRegistry()
    registerCoreCommands(registry, store)
    const diagram = activeDiagram(store.getState()) as Diagram
    expect(registry.isEnabled(CommandIds.editUndo)).toBe(false)
    const { view } = createNode(store.getState().engine, { kind: 'Class', diagram, left: 0, top: 0 })
    expect(registry.isEnabled(CommandIds.editUndo)).toBe(true)
    store.getState().select({ views: [(view as View)._id] })
    registry.execute(CommandIds.editDeleteFromModel)
    expect(diagram.ownedViews).toHaveLength(0)
    registry.execute(CommandIds.editUndo)
    expect(diagram.ownedViews).toHaveLength(1)
  })
})
