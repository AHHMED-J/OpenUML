/** `.mdj` round trip, palettes, Add Diagram and Add menus of the object / composite / communication / overview / information flow families. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { addFeature, createDiagram, createEdge, createNode, ModelEngine, setFields } from '../../../commands'
import { readMdj, validateModel, writeMdj } from '../../../format'
import { createDefaultProject, isKindOf, Repository, walk, type Diagram, type Elem, type NodeView, type View } from '../../../model'
import { addDiagram, addDiagramItemsFor, addItemsFor, addModelElement } from '../../../ui/modelActions'
import { palettesFor } from '../../../ui/toolbox/palettes'
import { FixedWidthTextMeasurer } from '../../core'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import { DiagramContent } from '../../render/DiagramContent'
import { ensureNotations } from '../../notations'

function build(): { project: Elem; repo: Repository; engine: ModelEngine; model: Elem } {
  ensureNotations()
  const repo = new Repository(createDefaultProject())
  return { project: repo.project as Elem, repo, engine: new ModelEngine(repo), model: (repo.project?.['ownedElements'] as Elem[])[0] as Elem }
}

describe('round trip', () => {
  it('writes and re-reads every new type without loss and lays out each diagram', () => {
    const { project, engine, model } = build()

    // Object diagram: objects with slots, instances, links, link object.
    const object = createDiagram(engine, 'ObjectDiagram', model).diagram
    const o1 = createNode(engine, { kind: 'Object', diagram: object, left: 20, top: 20 }).view as View
    const o2 = createNode(engine, { kind: 'Object', diagram: object, left: 300, top: 20 }).view as View
    addFeature(engine, o1.model as Elem, 'Slot', { name: 'x', type: 'int', value: '1' })
    setFields(engine, o1.model as Elem, { classifier: 'Customer', value: 'v' })
    for (const [i, kind] of (['ArtifactInstance', 'ComponentInstance', 'NodeInstance'] as const).entries()) {
      createNode(engine, { kind, diagram: object, left: 20 + i * 200, top: 300 })
    }
    createEdge(engine, { kind: 'Link', diagram: object, tail: o1, head: o2 })
    createEdge(engine, { kind: 'DirectedLink', diagram: object, tail: o2, head: o1 })
    createEdge(engine, { kind: 'LinkObject', diagram: object, tail: o1, head: o2 })

    // Composite structure: host, ports, parts, connector, collaboration, uses, role binding.
    const composite = createDiagram(engine, 'CompositeStructureDiagram', model).diagram
    const host = createNode(engine, { kind: 'Class', diagram: composite, left: 20, top: 20, width: 400, height: 250 }).view as View
    const p1 = createNode(engine, { kind: 'Part', diagram: composite, left: 60, top: 80, container: host }).view as View
    const p2 = createNode(engine, { kind: 'Part', diagram: composite, left: 220, top: 80, container: host }).view as View
    createNode(engine, { kind: 'Port', diagram: composite, left: 420, top: 100, container: host })
    createEdge(engine, { kind: 'Connector', diagram: composite, tail: p1, head: p2 })
    const collab = createNode(engine, { kind: 'Collaboration', diagram: composite, left: 20, top: 320 }).view as View
    const use = createNode(engine, { kind: 'CollaborationUse', diagram: composite, left: 300, top: 320 }).view as View
    setFields(engine, use.model as Elem, { type: collab.model })
    createEdge(engine, { kind: 'RoleBinding', diagram: composite, tail: use, head: p1 })
    createEdge(engine, { kind: 'Realization', diagram: composite, tail: host, head: collab })

    // Communication.
    const comm = createDiagram(engine, 'CommunicationDiagram', model).diagram
    const l1 = createNode(engine, { kind: 'CommLifeline', diagram: comm, left: 40, top: 80 }).view as View
    const l2 = createNode(engine, { kind: 'CommLifeline', diagram: comm, left: 400, top: 80 }).view as View
    createEdge(engine, { kind: 'CommForwardMessage', diagram: comm, tail: l1, head: l2 })
    createEdge(engine, { kind: 'CommReverseMessage', diagram: comm, tail: l1, head: l2, messageSort: 'reply' })

    // Interaction overview.
    const overview = createDiagram(engine, 'InteractionOverviewDiagram', model).diagram
    const initial = createNode(engine, { kind: 'InitialNode', diagram: overview, left: 60, top: 40 }).view as View
    const ref = createNode(engine, { kind: 'InteractionUseInOverview', diagram: overview, left: 20, top: 120 }).view as View
    const inline = createNode(engine, { kind: 'InteractionInOverview', diagram: overview, left: 20, top: 260 }).view as View
    createEdge(engine, { kind: 'ControlFlow', diagram: overview, tail: initial, head: ref })
    createEdge(engine, { kind: 'ControlFlow', diagram: overview, tail: ref, head: inline })

    // Information flow.
    const info = createDiagram(engine, 'InformationFlowDiagram', model).diagram
    const item = createNode(engine, { kind: 'InformationItem', diagram: info, left: 20, top: 20 }).view as View
    const cls = createNode(engine, { kind: 'Class', diagram: info, left: 300, top: 20 }).view as View
    const flow = createEdge(engine, { kind: 'InformationFlow', diagram: info, tail: item, head: cls }).model as Elem
    setFields(engine, flow, { conveyed: [cls.model] })

    expect(validateModel(project)).toEqual([])
    const text = writeMdj(project)
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(writeMdj(back.project)).toBe(text)

    const used = new Set<string>()
    for (const el of walk(back.project)) used.add(el._type)
    for (const type of [
      'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLCommunicationDiagram', 'UMLInteractionOverviewDiagram', 'UMLInformationFlowDiagram',
      'UMLObject', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance', 'UMLSlot', 'UMLLink', 'UMLLinkEnd', 'UMLLinkObjectLink',
      'UMLPort', 'UMLConnector', 'UMLConnectorEnd', 'UMLCollaborationUse', 'UMLRoleBinding', 'UMLInformationItem', 'UMLInformationFlow',
      'UMLObjectView', 'UMLArtifactInstanceView', 'UMLComponentInstanceView', 'UMLNodeInstanceView', 'UMLSlotCompartmentView', 'UMLSlotView',
      'UMLLinkView', 'UMLLinkObjectLinkView', 'UMLPortView', 'UMLPartView', 'UMLConnectorView', 'UMLCollaborationView', 'UMLCollaborationUseView',
      'UMLRoleBindingView', 'UMLCommLifelineView', 'UMLCommMessageView', 'UMLInteractionUseView', 'UMLInteractionInlineView',
      'UMLInformationItemView', 'UMLInformationFlowView'
    ]) expect(used, type).toContain(type)

    // References survive: slot owner, link ends, connector ends, message connector and view host, conveyed list.
    const elements = [...walk(back.project)]
    const find = (type: string): Elem => elements.find((e) => e._type === type) as Elem
    expect((find('UMLLink')['end1'] as Elem)['reference']).toBe(elements.find((e) => e._type === 'UMLObject' && e['name'] === 'Object1'))
    expect(find('UMLConnectorEnd')['reference']).toBeTruthy()
    expect((find('UMLInformationFlow')['conveyed'] as Elem[])).toHaveLength(1)
    const messageView = elements.find((e) => e._type === 'UMLCommMessageView') as NodeView & { hostEdge: View }
    expect(messageView.hostEdge._type).toBe('UMLConnectorView')
    expect((messageView.model as Elem)['connector']).toBe(messageView.hostEdge.model)
    expect(find('UMLInteractionUse')['refersTo']).toBeTruthy()

    // The re-read project lays out cleanly in every diagram, with every view drawn.
    const measurer = new FixedWidthTextMeasurer()
    for (const el of elements) {
      if (!isKindOf(el, 'Diagram') || el._type === 'UMLClassDiagram' || el._type === 'UMLSequenceDiagram') continue
      const layout = computeDiagramLayout(el as Diagram, back.repository, measurer, { onError: (v, e) => { throw new Error(`${v._type}: ${String(e)}`) } })
      expect(layout.nodes.size, el._type).toBeGreaterThan(0)
      const top = (el as Diagram).ownedViews.filter((v) => isKindOf(v, 'NodeView') || isKindOf(v, 'EdgeView'))
      expect(layout.nodes.size + layout.edges.size, el._type).toBe(top.length)
      // Every notation draws (also the SVG export path) without throwing.
      const markup = renderToStaticMarkup(createElement(DiagramContent, { layout }))
      expect(markup.length, el._type).toBeGreaterThan(100)
      if (el._type === 'UMLObjectDiagram') expect(markup).toContain('text-decoration="underline"')
      if (el._type === 'UMLInteractionOverviewDiagram') expect(markup).toContain('>ref<')
      if (el._type === 'UMLInformationFlowDiagram') expect(markup).toContain('«flow»')
      if (el._type === 'UMLCompositeStructureDiagram') expect(markup).toContain('stroke-dasharray="5 5"')
    }
  })
})

describe('palettes', () => {
  const kinds = (type: string): string[] => palettesFor(type).flatMap((g) => g.items.map((i) => i.kind as string))

  it('shows the right tools per diagram type', () => {
    expect(kinds('UMLObjectDiagram')).toEqual(expect.arrayContaining(['Object', 'ArtifactInstance', 'ComponentInstance', 'NodeInstance', 'Link', 'DirectedLink', 'LinkObject', 'Note']))
    expect(kinds('UMLObjectDiagram')).not.toContain('Class')
    expect(kinds('UMLCompositeStructureDiagram')).toEqual(
      expect.arrayContaining(['Collaboration', 'Port', 'Part', 'Connector', 'CollaborationUse', 'RoleBinding', 'Realization', 'Class', 'Interface', 'Association'])
    )
    expect(kinds('UMLCommunicationDiagram')).toEqual(expect.arrayContaining(['CommLifeline', 'Connector', 'CommForwardMessage', 'CommReverseMessage', 'Note']))
    expect(kinds('UMLInteractionOverviewDiagram')).toEqual(
      expect.arrayContaining(['InteractionUseInOverview', 'InteractionInOverview', 'InitialNode', 'ActivityFinalNode', 'ForkNode', 'JoinNode', 'MergeNode', 'DecisionNode', 'ControlFlow'])
    )
    expect(kinds('UMLInformationFlowDiagram')).toEqual(expect.arrayContaining(['InformationItem', 'InformationFlow', 'UseCase', 'Actor', 'Include', 'Class', 'Interface']))
    expect(kinds('UMLClassDiagram')).toEqual(expect.arrayContaining(['Object', 'Port', 'Part']))
  })

  it('auto-expands the family group, and the Instances group is on class, component and deployment diagrams', () => {
    const open = (type: string): string[] => palettesFor(type).filter((g) => g.autoExpand?.includes(type)).map((g) => g.id)
    expect(open('UMLObjectDiagram')).toEqual(['instances', 'annotations'])
    expect(open('UMLCompositeStructureDiagram')).toEqual(['classes-basic', 'composite-structure', 'annotations'])
    expect(open('UMLCommunicationDiagram')).toEqual(['communication', 'annotations'])
    expect(open('UMLInteractionOverviewDiagram')).toEqual(['interaction-overview', 'annotations'])
    expect(open('UMLInformationFlowDiagram')).toEqual(['information-flows', 'annotations'])
    for (const type of ['UMLClassDiagram', 'UMLComponentDiagram', 'UMLDeploymentDiagram']) expect(palettesFor(type).map((g) => g.id), type).toContain('instances')
  })

  it('offers the point gesture for ports and self connectors', () => {
    const item = (id: string) => palettesFor('UMLCompositeStructureDiagram').concat(palettesFor('UMLCommunicationDiagram')).flatMap((g) => g.items).find((i) => i.id === id)!
    expect(item('port').gesture).toBe('point')
    expect(item('comm-self-connector')).toMatchObject({ gesture: 'point', selfConnection: true, kind: 'Connector' })
    expect(item('part').gesture).toBe('rect')
  })
})

describe('Add menus', () => {
  it('offers the new diagrams on projects and packages', () => {
    const { project, model } = build()
    for (const parent of [project, model]) {
      const kinds = addDiagramItemsFor(parent).map((i) => i.kind)
      for (const k of ['ObjectDiagram', 'CompositeStructureDiagram', 'CommunicationDiagram', 'InteractionOverviewDiagram', 'InformationFlowDiagram']) expect(kinds, k).toContain(k)
    }
  })

  it('adds a composite structure diagram inside a classifier, and in a new collaboration elsewhere', () => {
    const { project, engine, model } = build()
    const cls = addModelElement(engine, model, addItemsFor(model).find((i) => i.id === 'class')!)
    const inClass = addDiagram(engine, cls, 'CompositeStructureDiagram')
    expect(inClass._parent).toBe(cls)
    const inModel = addDiagram(engine, model, 'CompositeStructureDiagram')
    expect(inModel._parent?._type).toBe('UMLCollaboration')
    expect(inModel._parent?._parent).toBe(model)
    expect(project).toBeTruthy()
  })

  it('adds communication diagrams to interactions, collaborations and other owners', () => {
    const { engine, model } = build()
    const seq = createDiagram(engine, 'SequenceDiagram', model).diagram
    const interaction = seq._parent as Elem
    const collaboration = interaction._parent as Elem
    const onInteraction = addDiagram(engine, interaction, 'CommunicationDiagram')
    expect(onInteraction._parent).toBe(interaction)
    const onCollaboration = addDiagram(engine, collaboration, 'CommunicationDiagram')
    expect(onCollaboration._parent?._type).toBe('UMLInteraction')
    expect(onCollaboration._parent?._parent).toBe(collaboration)
    const onModel = addDiagram(engine, model, 'CommunicationDiagram')
    expect(onModel._parent?._parent?._type).toBe('UMLCollaboration')
    const frame = (onModel as Diagram).ownedViews[0] as NodeView
    expect(frame).toMatchObject({ _type: 'UMLFrameView', left: 8, top: 8, width: 700, height: 600 })
  })

  it('adds objects and slots from the Model menu', () => {
    const { engine, model } = build()
    const object = addModelElement(engine, model, addItemsFor(model).find((i) => i.id === 'object')!)
    expect(object._type).toBe('UMLObject')
    expect(object['name']).toBe('Object1')
    const slotItem = addItemsFor(object).find((i) => i.id === 'slot')!
    expect(slotItem).toBeTruthy()
    expect(addModelElement(engine, object, slotItem)['name']).toBe('Slot1')
    expect(addItemsFor(model).map((i) => i.id)).not.toContain('slot')
  })
})
