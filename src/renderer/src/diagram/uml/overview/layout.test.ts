import { describe, expect, it } from 'vitest'
import { createDiagram, createNode, ModelEngine } from '../../../commands'
import { createDefaultProject, createElement, isKindOf, Repository, type Diagram, type Elem, type NodeView, type View } from '../../../model'
import { nodeNotationFor } from '../../render/registry'
import { structureTest } from '../object/testEnv'
import { interactionUseText, overviewNavigationTarget, referencedDiagram, referencedInteraction } from './analysis'
import { previewScale, type OverviewInlineData, type OverviewUseData } from './layout'

function chain(el: Elem | null): string[] {
  const types: string[] = []
  for (let p = el; p && p._type !== 'Project'; p = p._parent) types.push(p._type)
  return types
}

describe('add diagram parent chain', () => {
  it('wraps a package in Collaboration → Interaction → Activity with a sd frame', () => {
    const t = structureTest('InteractionOverviewDiagram')
    expect(chain(t.diagram)).toEqual(['UMLInteractionOverviewDiagram', 'UMLActivity', 'UMLInteraction', 'UMLCollaboration', 'UMLModel'])
    expect(t.diagram.name).toBe('InteractionOverviewDiagram1')
    expect((t.diagram._parent as Elem)['name']).toBe('Activity1')
    const frame = t.diagram.ownedViews[0] as NodeView
    expect(frame).toMatchObject({ _type: 'UMLFrameView', left: 8, top: 8, width: 700, height: 600 })
    expect(frame.model).toBe(t.diagram)
  })

  it('uses an activity directly, adds an activity to an interaction, and an interaction for a classifier', () => {
    const repo = new Repository(createDefaultProject())
    const engine = new ModelEngine(repo)
    const model = (repo.root?.['ownedElements'] as Elem[])[0] as Elem
    const first = createDiagram(engine, 'InteractionOverviewDiagram', model).diagram
    const activity = first._parent as Elem
    const direct = createDiagram(engine, 'InteractionOverviewDiagram', activity).diagram
    expect(direct._parent).toBe(activity)
    const interaction = activity._parent as Elem
    const inInteraction = createDiagram(engine, 'InteractionOverviewDiagram', interaction).diagram
    expect(chain(inInteraction).slice(0, 3)).toEqual(['UMLInteractionOverviewDiagram', 'UMLActivity', 'UMLInteraction'])
    expect(inInteraction._parent?._parent).toBe(interaction)
    const cls = createNode(engine, { kind: 'Class', diagram: repo.defaultDiagram() as Diagram, left: 0, top: 0 }).model as Elem
    const forClass = createDiagram(engine, 'InteractionOverviewDiagram', cls).diagram
    expect(chain(forClass).slice(0, 4)).toEqual(['UMLInteractionOverviewDiagram', 'UMLActivity', 'UMLInteraction', 'UMLClass'])
  })

  it('names the frame with the owning activity', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const frame = t.diagram.ownedViews[0] as View
    const l = t.nodeLayout<{ label: { keyword: { text: string }; name: { text: string } | null } }>(frame)
    expect(l.data.label.keyword.text).toBe('sd')
    expect(l.data.label.name?.text).toBe('Activity1')
  })
})

describe('interaction use node', () => {
  it('creates a callBehavior action, an interaction use and a new interaction', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionUseInOverview', 40, 60)
    const action = view.model as Elem
    const activity = t.diagram._parent as Elem
    const owning = activity._parent as Elem
    expect(view._type).toBe('UMLInteractionUseView')
    expect(action).toMatchObject({ _type: 'UMLAction', kind: 'callBehavior', name: 'Action1' })
    expect(activity['nodes']).toContain(action)
    const use = action['target'] as Elem
    expect(use._type).toBe('UMLInteractionUse')
    expect(use._parent).toBe(owning)
    expect(owning['fragments']).toContain(use)
    const created = use['refersTo'] as Elem
    expect(created._type).toBe('UMLInteraction')
    // Next to the interaction that owns the activity.
    expect(created._parent).toBe(owning._parent)
    expect(created).not.toBe(owning)
    expect(referencedInteraction(action)).toBe(created)
    expect(overviewNavigationTarget(view)).toBe(created)
  })

  it('refers to the interaction directly when no interaction owns the activity', () => {
    const repo = new Repository(createDefaultProject())
    const engine = new ModelEngine(repo)
    const model = (repo.root?.['ownedElements'] as Elem[])[0] as Elem
    const activity = createElement('UMLActivity', { name: 'Act' })
    engine.transact('add', (b) => b.insert(model, 'ownedElements', activity))
    const diagram = createDiagram(engine, 'InteractionOverviewDiagram', activity).diagram
    const view = createNode(engine, { kind: 'InteractionUseInOverview', diagram, left: 10, top: 10 }).view as View
    const action = view.model as Elem
    const interaction = action['target'] as Elem
    expect(interaction._type).toBe('UMLInteraction')
    expect(interaction._parent).toBe(model)
    expect(referencedInteraction(action)).toBe(interaction)
  })

  it('draws the ref tab pentagon and the use text right of it (80 × 30 minimum)', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionUseInOverview', 40, 60, { width: 10, height: 10 })
    const action = view.model as Elem
    const use = action['target'] as Elem
    Object.assign(use, { arguments: 'a', returnValue: 'r' })
    const l = t.nodeLayout<OverviewUseData>(view)
    expect(l.box.width).toBeGreaterThanOrEqual(80)
    expect(l.box.height).toBeGreaterThanOrEqual(30)
    expect(l.zIndex).toBe(1)
    // Pentagon: (left,top), (left,y), (x - h/2,y), (x,top + h/2), (x,top).
    const poly = l.data.label.polygon
    expect(poly).toHaveLength(5)
    const h = poly[1]!.y - l.box.top
    expect(poly[0]).toEqual({ x: l.box.left, y: l.box.top })
    expect(poly[1]).toEqual({ x: l.box.left, y: l.box.top + h })
    expect(poly[2]!.y).toBe(l.box.top + h)
    expect(poly[3]!.y).toBe(l.box.top + h / 2)
    expect(poly[4]!.y).toBe(l.box.top)
    expect(poly[3]!.x).toBe(poly[4]!.x)
    expect(poly[3]!.x - poly[2]!.x).toBe(h / 2)
    expect(l.data.label.keyword.text).toBe('ref')
    // Name text starts 10 right of the tab.
    expect(l.data.nameLine.box.left).toBe(poly[4]!.x + 10)
    expect(l.data.nameLine.text).toBe('Interaction2(a): r')
  })

  it('formats [recipient = ]Name[(arguments)][: returnValue]', () => {
    const interaction = { _type: 'UMLInteraction', _id: 'i', _parent: null, name: 'Pay' } as Elem
    const recipient = { _type: 'UMLAttribute', _id: 'r', _parent: null, name: 'result' } as Elem
    const use = { _type: 'UMLInteractionUse', _id: 'u', _parent: null, name: 'use', refersTo: interaction, arguments: 'x, y', returnValue: 'ok', returnValueRecipient: recipient } as Elem
    const action = { _type: 'UMLAction', _id: 'a', _parent: null, name: 'Action1', target: use } as Elem
    expect(interactionUseText(action)).toBe('result = Pay(x, y): ok')
    expect(interactionUseText({ ...action, target: interaction } as Elem)).toBe('Pay')
    expect(interactionUseText({ _type: 'UMLAction', _id: 'b', _parent: null, name: 'Lonely' } as Elem)).toBe('Lonely')
  })

  it('renames the referenced interaction from the node text', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionUseInOverview', 40, 60)
    const l = t.nodeLayout(view)
    const target = referencedInteraction(view.model as Elem) as Elem
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: target._id })
  })
})

describe('inline node', () => {
  it('creates an interaction with an empty sequence diagram and a callBehavior action targeting the diagram', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionInOverview', 40, 60)
    const action = view.model as Elem
    expect(view._type).toBe('UMLInteractionInlineView')
    expect(isKindOf(view, 'UMLFrameView')).toBe(true)
    const sd = referencedDiagram(action) as Elem
    expect(sd._type).toBe('UMLSequenceDiagram')
    const interaction = sd._parent as Elem
    expect(interaction._type).toBe('UMLInteraction')
    expect(interaction._parent).toBe(((t.diagram._parent as Elem)._parent as Elem)._parent)
    expect(overviewNavigationTarget(view)).toBe(sd)
    expect(nodeNotationFor(view).openTarget?.(view)).toBe(sd)
  })

  it('shows sd + the interaction name, and a placeholder while the diagram is empty', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionInOverview', 40, 60)
    const l = t.nodeLayout<OverviewInlineData>(view)
    expect(l.data.label.keyword.text).toBe('sd')
    expect(l.data.label.name?.text).toBe('Interaction2')
    expect(l.data.preview).toBeNull()
    expect(l.data.placeholder?.text).toBe('(empty)')
  })

  it('previews the referenced sequence diagram scaled into the frame at offset (10, 30)', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const view = t.node('InteractionInOverview', 40, 60, { width: 220, height: 150 })
    const sd = referencedDiagram(view.model as Elem) as Diagram
    createNode(t.engine, { kind: 'Lifeline', diagram: sd, left: 40, top: 40, width: 100, height: 200 })
    const b = createNode(t.engine, { kind: 'Lifeline', diagram: sd, left: 340, top: 40, width: 100, height: 200 }).view as View
    expect(b).toBeTruthy()
    const l = t.nodeLayout<OverviewInlineData>(view)
    const p = l.data.preview
    expect(p).not.toBeNull()
    expect(p!.offset).toEqual({ x: l.box.left + 10, y: l.box.top + 30 })
    expect(p!.scale).toBeLessThan(1)
    expect(p!.scale).toBeGreaterThan(0)
    expect(p!.nodes.length).toBeGreaterThanOrEqual(2)
    // The preview reacts to changes of the previewed diagram.
    const before = JSON.stringify(l.data)
    createNode(t.engine, { kind: 'Lifeline', diagram: sd, left: 600, top: 40, width: 100, height: 200 })
    expect(JSON.stringify(t.nodeLayout<OverviewInlineData>(view).data)).not.toBe(before)
  })

  it('scale = min((w − 20) / W, (h − 40) / H, 1)', () => {
    const box = { left: 0, top: 0, width: 220, height: 150 }
    expect(previewScale(box, { width: 400, height: 100 })).toBeCloseTo(0.5)
    expect(previewScale(box, { width: 100, height: 400 })).toBeCloseTo(110 / 400)
    expect(previewScale(box, { width: 50, height: 50 })).toBe(1)
  })
})

describe('control nodes and flows', () => {
  it('uses the activity control nodes and flows between them and the overview nodes', () => {
    const t = structureTest('InteractionOverviewDiagram')
    const initial = t.node('InitialNode', 40, 40)
    const use = t.node('InteractionUseInOverview', 20, 120)
    const decision = t.node('DecisionNode', 60, 240)
    const flow = t.edge('ControlFlow', initial, use)
    t.edge('ControlFlow', use, decision)
    expect(flow._type).toBe('UMLControlFlowView')
    expect(((flow.model as Elem)['source'])).toBe(initial.model)
    expect((flow.model as Elem)._parent).toBe(t.diagram._parent)
    const l = t.edgeLayout(flow)
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.dash).toBe('solid')
  })
})
