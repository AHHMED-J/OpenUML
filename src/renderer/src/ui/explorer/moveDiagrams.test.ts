import { describe, expect, it } from 'vitest'
import { createNode, moveElement, ModelEngine, reorderElement } from '../../commands'
import { createDefaultProject, createElement, Repository, type Diagram, type Elem } from '../../model'
import { ADD_DIAGRAM_ITEMS, addDiagram, addDiagramItemsFor, diagramPlacement } from '../modelActions'
import { dropField, dropPlaceAt, explorerChildren, flattenTree, movedElement, moveStep, pathToRow, siblingDrop } from './tree'

const sequence = ADD_DIAGRAM_ITEMS.find((i) => i.kind === 'SequenceDiagram')!
const classDiagram = ADD_DIAGRAM_ITEMS.find((i) => i.kind === 'ClassDiagram')!

function setup() {
  const project = createDefaultProject()
  const repository = new Repository(project)
  const engine = new ModelEngine(repository)
  const model = (project['ownedElements'] as Elem[])[0] as Elem
  /** A sequence diagram with its collaboration and interaction, under `owner`. */
  const seq = (owner: Elem = project): Diagram => addDiagram(engine, owner, 'SequenceDiagram') as Diagram
  return { project, repository, engine, model, seq }
}

const collaborationOf = (d: Elem): Elem => d._parent?._parent as Elem
const owned = (el: Elem): Elem[] => el['ownedElements'] as Elem[]

describe('Add Diagram placement', () => {
  it('puts the new diagram beside the selected one, not inside it and not last', () => {
    const { project, engine, seq } = setup()
    const first = seq()
    const last = seq()
    const place = diagramPlacement(sequence, first, null)
    expect(place).toEqual({ parent: project, after: collaborationOf(first) })
    const added = addDiagram(engine, place!.parent, 'SequenceDiagram', 3, place!.after)
    const order = owned(project).slice(-3)
    expect(order).toEqual([collaborationOf(first), collaborationOf(added), collaborationOf(last)])
  })

  it('works from an element drawn on the diagram, from the interaction and from the active diagram', () => {
    const { project, engine, model, seq } = setup()
    const first = seq(model)
    const lifeline = createNode(engine, { kind: 'Lifeline', diagram: first, left: 100, top: 40, width: 100, height: 200 }).view?.model as Elem
    const beside = { parent: model, after: collaborationOf(first) }
    expect(diagramPlacement(sequence, lifeline, first)).toEqual(beside)
    expect(diagramPlacement(sequence, first._parent as Elem, first)).toEqual(beside)
    expect(diagramPlacement(sequence, first, first)).toEqual(beside)
    expect(addDiagramItemsFor(first).map((i) => i.kind)).toContain('SequenceDiagram')
    expect(addDiagramItemsFor(lifeline).map((i) => i.kind)).toContain('ClassDiagram')
    // The project stays an explicit choice; the diagram follows the active one only side by side.
    expect(diagramPlacement(sequence, project, first)).toEqual({ parent: project, after: null })
  })

  it('still nests under an element chosen on purpose', () => {
    const { model, seq } = setup()
    const collaboration = collaborationOf(seq(model))
    expect(diagramPlacement(sequence, collaboration, null)).toEqual({ parent: collaboration, after: null })
    expect(diagramPlacement(classDiagram, model, null)).toEqual({ parent: model, after: null })
  })

  it('offers nothing on elements that have nothing to do with a diagram', () => {
    const cls = createElement('UMLClass', { name: 'C' })
    const attribute = createElement('UMLAttribute', { name: 'a', _parent: cls })
    expect(addDiagramItemsFor(attribute)).toEqual([])
  })
})

describe('moving diagrams in the explorer', () => {
  it('moves a sequence diagram with the interaction and collaboration it cannot work without', () => {
    const { engine, model, project, seq } = setup()
    const diagram = seq()
    const collaboration = collaborationOf(diagram)
    expect(movedElement(diagram)).toBe(collaboration)
    moveElement(engine, movedElement(diagram), model, dropField(model, movedElement(diagram)) ?? undefined)
    expect(collaboration._parent).toBe(model)
    expect(diagram._parent?._type).toBe('UMLInteraction')
    expect(owned(project)).not.toContain(collaboration)
  })

  it('stops at what the diagram shares', () => {
    const { engine, model, seq } = setup()
    const diagram = seq(model)
    const collaboration = collaborationOf(diagram)
    const second = addDiagram(engine, collaboration, 'SequenceDiagram')
    expect(movedElement(diagram)).toBe(diagram._parent)
    expect(movedElement(second)).toBe(second._parent)
    const plain = owned(model).find((c) => c._type === 'UMLClassDiagram') as Elem
    expect(movedElement(plain)).toBe(plain)
    addDiagram(engine, diagram._parent as Elem, 'CommunicationDiagram')
    expect(movedElement(diagram)).toBe(diagram)
  })

  it('reorders two diagrams dragged by their own rows, both ways', () => {
    const { engine, project, seq } = setup()
    const [a, b, c] = [seq(), seq(), seq()]
    const [ca, cb, cc] = [a, b, c].map(collaborationOf)
    const apply = (drop: ReturnType<typeof siblingDrop>): void => moveElement(engine, drop!.element, drop!.owner, drop!.field, drop!.index)
    apply(siblingDrop(a, c, 'before'))
    expect(owned(project).slice(-3)).toEqual([cc, ca, cb])
    apply(siblingDrop(b, cc as Elem, 'after'))
    expect(owned(project).slice(-3)).toEqual([ca, cb, cc])
    apply(siblingDrop(ca as Elem, b, 'after'))
    expect(owned(project).slice(-3)).toEqual([ca, cb, cc])
  })

  it('moves next to a row under another owner', () => {
    const { engine, model, project, seq } = setup()
    const outside = seq()
    const inside = seq(model)
    const drop = siblingDrop(inside, outside, 'before')
    expect(drop).toMatchObject({ element: collaborationOf(outside), owner: model, field: 'ownedElements' })
    moveElement(engine, drop!.element, drop!.owner, drop!.field, drop!.index)
    expect(owned(project)).not.toContain(collaborationOf(outside))
    const rows = explorerChildren(model).filter((c) => c._type === 'UMLCollaboration')
    expect(rows).toEqual([collaborationOf(outside), collaborationOf(inside)])
  })

  it('refuses positions the tree cannot show', () => {
    const { model, project, seq } = setup()
    const diagram = seq()
    expect(siblingDrop(model, diagram, 'before')).toBeNull()
    expect(siblingDrop(diagram, diagram, 'after')).toBeNull()
    expect(siblingDrop(seq(), diagram, 'after', 'name')).toBeNull()
    expect(siblingDrop(project, model, 'before')).toBeNull()
    expect(siblingDrop(diagram, collaborationOf(diagram), 'after')).toBeNull()
  })

  it('reads the row: the edges are between rows, the middle is inside', () => {
    const both = { before: true, after: true }
    const none = { before: false, after: false }
    expect([0.1, 0.5, 0.9].map((y) => dropPlaceAt(y, both, true))).toEqual(['before', 'into', 'after'])
    expect([0.1, 0.9].map((y) => dropPlaceAt(y, both, false))).toEqual(['before', 'after'])
    expect(dropPlaceAt(0.1, none, true)).toBe('into')
    expect(dropPlaceAt(0.5, none, false)).toBeNull()
  })

  it('Move Up and Down move the visible row of a diagram, skipping other groups', () => {
    const { engine, project, seq } = setup()
    const a = seq()
    const b = seq()
    const actor = createElement('UMLActor', { name: 'X' })
    engine.transact('add', (t) => t.insert(project, 'ownedElements', actor, owned(project).indexOf(collaborationOf(b))))
    const up = moveStep(b, -1)
    expect(up?.element).toBe(collaborationOf(b))
    reorderElement(engine, up!.element, up!.index)
    expect(explorerChildren(project).filter((c) => c._type === 'UMLCollaboration')).toEqual([collaborationOf(b), collaborationOf(a)])
    expect(moveStep(b, -1)).toBeNull()
  })
})

describe('what a row is inside of', () => {
  const key = (el: Elem): string => el._id
  function tree() {
    const t = setup()
    const diagram = t.seq()
    const interaction = diagram._parent as Elem
    const collaboration = interaction._parent as Elem
    const lifelines = [1, 2].map((left) => createNode(t.engine, { kind: 'Lifeline', diagram, left: left * 150, top: 40, width: 100, height: 200 }).view?.model as Elem)
    const expanded = Object.fromEntries([t.project, collaboration, interaction].map((e) => [e._id, true as const]))
    const rows = flattenTree(t.project, { expanded, collapsedFolders: {} })
    return { ...t, diagram, interaction, collaboration, lifelines, rows }
  }

  it('lists the containers of the row, up to the project', () => {
    const t = tree()
    const lifeline = t.lifelines[1] as Elem
    expect([...pathToRow(t.rows, key(lifeline)).containers]).toEqual([key(t.interaction), key(t.collaboration), key(t.project)])
  })

  it('draws the line from each container to the next, on the rows between them', () => {
    const t = tree()
    const [first, second] = t.lifelines as [Elem, Elem]
    const path = pathToRow(t.rows, key(second))
    // The line turns into the row at its parent's level, and into the parent at the level above.
    expect(path.turns.get(key(second))).toBe(2)
    expect(path.turns.get(key(t.interaction))).toBe(1)
    expect(path.turns.get(key(t.collaboration))).toBe(0)
    // A sibling above is only crossed by the line, at that same level.
    expect([...(path.passes.get(key(first)) ?? [])]).toEqual([2])
    expect([...(path.passes.get(key(t.diagram)) ?? [])]).toEqual([2])
  })

  it('shows nothing for the root, an unknown row or no row', () => {
    const t = tree()
    expect(pathToRow(t.rows, key(t.project)).containers.size).toBe(0)
    expect(pathToRow(t.rows, 'missing').containers.size).toBe(0)
    expect(pathToRow(t.rows, null).containers.size).toBe(0)
  })
})
