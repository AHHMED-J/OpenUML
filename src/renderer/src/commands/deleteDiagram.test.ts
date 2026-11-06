import { describe, expect, it } from 'vitest'
import { createDefaultProject, createElement, Repository, type Diagram, type Elem } from '../model'
import { deleteFromModel } from './delete'
import { createDiagram, createNode } from './edits'
import { ModelEngine } from './engine'

function setup() {
  const project = createDefaultProject()
  const engine = new ModelEngine(new Repository(project))
  const add = (): Diagram => createDiagram(engine, 'SequenceDiagram', project).diagram as Diagram
  const lifeline = (diagram: Diagram): void => {
    createNode(engine, { kind: 'Lifeline', diagram, left: 100, top: 40, width: 100, height: 200 })
  }
  return { project, engine, add, lifeline, owned: () => project['ownedElements'] as Elem[] }
}

describe('deleting a diagram', () => {
  it('takes along the interaction and collaboration that held only it, in one undo step', () => {
    const t = setup()
    const diagram = t.add()
    const collaboration = diagram._parent?._parent as Elem
    deleteFromModel(t.engine, [diagram])
    expect(t.owned()).not.toContain(collaboration)
    t.engine.undo()
    const restored = t.engine.repository.get(diagram._id)
    expect(restored?._parent?._parent?._id).toBe(collaboration._id)
    expect(t.owned().map((e) => e._id)).toContain(collaboration._id)
  })

  it('keeps them when the diagram left lifelines behind', () => {
    const t = setup()
    const diagram = t.add()
    const collaboration = diagram._parent?._parent as Elem
    t.lifeline(diagram)
    deleteFromModel(t.engine, [diagram])
    expect(t.owned()).toContain(collaboration)
    expect((collaboration['ownedElements'] as Elem[]).length).toBe(1)
  })

  it('keeps the interaction while another diagram draws it', () => {
    const t = setup()
    const diagram = t.add()
    const interaction = diagram._parent as Elem
    const other = createDiagram(t.engine, 'CommunicationDiagram', interaction).diagram
    deleteFromModel(t.engine, [diagram])
    expect((interaction['ownedElements'] as Elem[])).toEqual([other])
  })

  it('keeps the collaboration when it has more in it', () => {
    const t = setup()
    const diagram = t.add()
    const interaction = diagram._parent as Elem
    const collaboration = interaction._parent as Elem
    const sibling = createElement('UMLClass', { name: 'Part' })
    t.engine.transact('add', (b) => b.insert(collaboration, 'ownedElements', sibling))
    deleteFromModel(t.engine, [diagram])
    expect(collaboration['ownedElements']).toEqual([sibling])
  })

  it('keeps what the user documented or what something else refers to', () => {
    const t = setup()
    const documented = t.add()
    const collaboration = documented._parent?._parent as Elem
    t.engine.transact('doc', (b) => b.set(collaboration, 'documentation', 'Por qué existe'))
    deleteFromModel(t.engine, [documented])
    expect(t.owned()).toContain(collaboration)
    expect(collaboration['ownedElements']).toEqual([])

    const referred = t.add()
    const interaction = referred._parent as Elem
    const use = createElement('UMLInteractionUse', { name: 'ref', refersTo: interaction })
    t.engine.transact('use', (b) => b.insert(t.project, 'ownedElements', use))
    deleteFromModel(t.engine, [referred])
    expect(use['refersTo']).toBe(interaction)
  })

  it('leaves other diagrams alone', () => {
    const t = setup()
    const model = t.owned()[0] as Elem
    const count = t.owned().length
    const plain = (model['ownedElements'] as Elem[]).find((e) => e._type === 'UMLClassDiagram') as Elem
    deleteFromModel(t.engine, [plain])
    expect(t.owned()).toHaveLength(count)
  })
})
