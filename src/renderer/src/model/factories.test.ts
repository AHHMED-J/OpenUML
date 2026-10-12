import { describe, expect, it } from 'vitest'
import { readMdj, validateModel, writeMdj } from '../format'
import {
  createDefaultProject,
  fieldsOf,
  isElem,
  isKindOf,
  NODE_KINDS,
  planDiagram,
  planEdge,
  planFeature,
  planItemViews,
  planNode,
  type CreationPlan,
  type Diagram,
  type Elem,
  type EdgeKind,
  type NodeKind,
  type NodeView,
  type UMLClassifierView,
  type UMLNameCompartmentView,
  type UMLSeqLifelineView,
  type UMLSeqMessageView,
  type View
} from '.'

/** Applies a plan to the detached tree (what the command layer does, minus history). */
function apply<T extends CreationPlan>(plan: T): T {
  for (const ins of plan.insertions) {
    ins.element._parent = ins.owner
    const value = ins.owner[ins.field]
    if (Array.isArray(value)) value.splice(ins.index ?? value.length, 0, ins.element)
    else ins.owner[ins.field] = ins.element
  }
  for (const add of plan.refAdditions) (add.owner[add.field] as Elem[]).push(add.target)
  return plan
}

/** Every named embedded sub-view ref of `view` (recursively) resolves into its `subViews`. */
function expectEmbeddedConsistent(view: View): void {
  for (const field of fieldsOf(view)) {
    if (!field.embedded) continue
    const sub = view[field.name]
    expect(isElem(sub), `${view._type}.${field.name}`).toBe(true)
    expect(view.subViews).toContain(sub)
  }
  for (const sub of view.subViews) {
    expect(sub._parent).toBe(view)
    expectEmbeddedConsistent(sub)
  }
}

function setup() {
  const project = createDefaultProject()
  const model = project.ownedElements[0] as Elem
  const classDiagram = (model['ownedElements'] as Elem[])[0] as Diagram
  const useCase = apply(planDiagram('UseCaseDiagram', model)).diagram
  const sequence = apply(planDiagram('SequenceDiagram', model)).diagram
  const activity = apply(planDiagram('ActivityDiagram', model)).diagram
  return { project, model, classDiagram, useCase, sequence, activity }
}

const DIAGRAM_OF: Record<NodeKind, 'classDiagram' | 'useCase' | 'sequence' | 'activity'> = {
  Class: 'classDiagram',
  Interface: 'classDiagram',
  Enumeration: 'classDiagram',
  DataType: 'classDiagram',
  PrimitiveType: 'classDiagram',
  Signal: 'classDiagram',
  Package: 'classDiagram',
  Model: 'classDiagram',
  Note: 'classDiagram',
  Text: 'classDiagram',
  Actor: 'useCase',
  UseCase: 'useCase',
  Subject: 'useCase',
  Lifeline: 'sequence',
  CombinedFragment: 'sequence',
  Action: 'activity',
  SendSignal: 'activity',
  AcceptSignal: 'activity',
  AcceptTimeEvent: 'activity',
  ObjectNode: 'activity',
  InitialNode: 'activity',
  ActivityFinalNode: 'activity',
  FlowFinalNode: 'activity',
  ForkNode: 'activity',
  JoinNode: 'activity',
  DecisionNode: 'activity',
  MergeNode: 'activity',
  Partition: 'activity',
  HorizontalPartition: 'activity',
  InputPin: 'activity',
  OutputPin: 'activity'
}

describe('diagram factories', () => {
  it('creates the default project', () => {
    const { project, model, classDiagram } = setup()
    expect(project.name).toBe('Untitled')
    expect(project.documentVersion).toBe(1)
    expect(model._type).toBe('UMLModel')
    expect(model['name']).toBe('Model')
    expect(classDiagram).toMatchObject({ _type: 'UMLClassDiagram', name: 'Main', defaultDiagram: true })
  })

  it('wraps sequence diagrams in collaboration → interaction and adds a frame', () => {
    const { model, sequence } = setup()
    const interaction = sequence._parent as Elem
    const collaboration = interaction._parent as Elem
    expect(interaction._type).toBe('UMLInteraction')
    expect(collaboration._type).toBe('UMLCollaboration')
    expect(collaboration._parent).toBe(model)
    const frame = sequence.ownedViews[0] as NodeView
    expect(frame).toMatchObject({ _type: 'UMLFrameView', left: 8, top: 8, width: 700, height: 600 })
    expect(frame.model).toBe(sequence)
    expectEmbeddedConsistent(frame)
  })

  it('wraps activity diagrams in an activity, and class diagrams on the project in a model', () => {
    const { model, activity, project } = setup()
    expect(activity._parent?._type).toBe('UMLActivity')
    expect(activity._parent?._parent).toBe(model)
    const plan = apply(planDiagram('ClassDiagram', project))
    expect(plan.model?._type).toBe('UMLModel')
    expect(plan.diagram._parent).toBe(plan.model)
    expect(plan.diagram.name).toBe('ClassDiagram1')
  })
})

describe('node factories', () => {
  it.each(Object.keys(NODE_KINDS) as NodeKind[])('%s', (kind) => {
    const ctx = setup()
    const diagram = ctx[DIAGRAM_OF[kind]]
    let container: View | undefined
    if (kind === 'InputPin' || kind === 'OutputPin') {
      container = apply(planNode({ kind: 'Action', diagram, left: 100, top: 100 })).view as View
    }
    const plan = apply(planNode({ kind, diagram, left: 50, top: 60, container }))
    const spec = NODE_KINDS[kind]
    const view = plan.view as NodeView

    expect(view._type).toBe(spec.viewType)
    expect(view._parent).toBe(diagram)
    expect(diagram.ownedViews).toContain(view)
    expect(view.width).toBeGreaterThan(0)
    expectEmbeddedConsistent(view)

    if (!spec.modelType) {
      expect(plan.model).toBeNull()
      expect(view.model).toBeNull()
      return
    }
    expect(plan.model?._type).toBe(spec.modelType)
    expect(view.model).toBe(plan.model)
    expect(plan.model?.['name']).toMatch(/^[A-Za-z]+1$/)
    const owner = plan.model?._parent as Elem
    expect(owner[plan.insertions[0]?.field ?? '']).toContain(plan.model)
    if (spec.field && kind !== 'InputPin' && kind !== 'OutputPin') {
      expect(plan.insertions[0]?.field).toBe(spec.field)
      expect(owner).toBe(diagram._parent)
    }
  })

  it('classifier views carry name + list compartments with four name labels', () => {
    const { classDiagram } = setup()
    const cls = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 0, top: 0 })).view as UMLClassifierView
    expect(cls.subViews.map((v) => v._type)).toEqual([
      'UMLNameCompartmentView',
      'UMLAttributeCompartmentView',
      'UMLOperationCompartmentView',
      'UMLReceptionCompartmentView',
      'UMLTemplateParameterCompartmentView'
    ])
    const nc = cls.nameCompartment as UMLNameCompartmentView
    expect(nc.subViews).toHaveLength(4)
    expect(nc.nameLabel?.font.style).toBe(1)
    expect(nc.namespaceLabel?.font.size).toBe(11.7)
    expect(nc.propertyLabel?.horizontalAlignment).toBe(1)
    expect(nc.subViews.every((l) => l.parentStyle)).toBe(true)

    const en = apply(planNode({ kind: 'Enumeration', diagram: classDiagram, left: 0, top: 0 })).view as UMLClassifierView
    expect(en['enumerationLiteralCompartment']).toBeTruthy()
    expect(en.suppressAttributes).toBe(true)
    const itf = apply(planNode({ kind: 'Interface', diagram: classDiagram, left: 0, top: 0 })).view as UMLClassifierView
    expect(itf.stereotypeDisplay).toBe('icon')
  })

  it('names new elements with the smallest unused number', () => {
    const { classDiagram } = setup()
    const a = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 0, top: 0 })).model as Elem
    const b = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 0, top: 0 })).model as Elem
    a['name'] = 'Renamed'
    const c = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 0, top: 0 })).model as Elem
    expect([b['name'], c['name']]).toEqual(['Class2', 'Class1'])
  })

  it('lifelines get a role attribute in the collaboration and a line part', () => {
    const { sequence } = setup()
    const plan = apply(planNode({ kind: 'Lifeline', diagram: sequence, left: 100, top: 999 }))
    const view = plan.view as UMLSeqLifelineView
    const lifeline = plan.model as Elem
    const collaboration = sequence._parent?._parent as Elem
    const role = lifeline['represent'] as Elem
    expect(role._type).toBe('UMLAttribute')
    expect(role['name']).toBe('Role1')
    expect(collaboration['attributes']).toContain(role)
    expect(view.top).toBe(40)
    expect(view.height).toBeGreaterThanOrEqual(200)
    expect(view.linePart?._type).toBe('UMLLinePartView')
    expect(view.linePart?.model).toBe(lifeline)
  })

  it('combined fragments start with one operand and its operand view', () => {
    const { sequence } = setup()
    const plan = apply(planNode({ kind: 'CombinedFragment', diagram: sequence, left: 0, top: 0 }))
    const fragment = plan.model as Elem
    expect(fragment['interactionOperator']).toBe('seq')
    const operands = fragment['operands'] as Elem[]
    expect(operands.map((o) => o['name'])).toEqual(['Operand1'])
    const compartment = (plan.view as Elem)['operandCompartment'] as NodeView
    expect(compartment.subViews[0]?.model).toBe(operands[0])
  })

  it('subjects and partitions are inserted behind other views; contained views are linked', () => {
    const { useCase } = setup()
    apply(planNode({ kind: 'Actor', diagram: useCase, left: 0, top: 0 }))
    const subject = apply(planNode({ kind: 'Subject', diagram: useCase, left: 0, top: 0 })).view as View
    expect(useCase.ownedViews[0]).toBe(subject)
    const uc = apply(planNode({ kind: 'UseCase', diagram: useCase, left: 10, top: 10, container: subject })).view as View
    expect(uc.containerView).toBe(subject)
    expect(subject.containedViews).toEqual([uc])
  })

  it('pins are owned by the action and contained by its view', () => {
    const { activity } = setup()
    const action = apply(planNode({ kind: 'Action', diagram: activity, left: 0, top: 0 }))
    const pin = apply(planNode({ kind: 'InputPin', diagram: activity, left: 0, top: 0, container: action.view as View }))
    expect(pin.model?._parent).toBe(action.model)
    expect((action.model as Elem)['inputs']).toEqual([pin.model])
    expect((pin.view as View).containerView).toBe(action.view)
    expect((pin.view as Elem)['nameLabel']).toMatchObject({ _type: 'NodeLabelView', hostNode: pin.view })
  })
})

describe('edge factories', () => {
  function classes() {
    const ctx = setup()
    const a = apply(planNode({ kind: 'Class', diagram: ctx.classDiagram, left: 0, top: 0 }))
    const b = apply(planNode({ kind: 'Class', diagram: ctx.classDiagram, left: 300, top: 0 }))
    const i = apply(planNode({ kind: 'Interface', diagram: ctx.classDiagram, left: 300, top: 200 }))
    return { ...ctx, a: a.view as View, b: b.view as View, i: i.view as View }
  }

  it.each<[EdgeKind, string, string]>([
    ['Generalization', 'UMLGeneralization', 'UMLGeneralizationView'],
    ['Dependency', 'UMLDependency', 'UMLDependencyView'],
    ['Realization', 'UMLRealization', 'UMLRealizationView']
  ])('%s: directed relationship owned by the source', (kind, modelType, viewType) => {
    const { classDiagram, a, b } = classes()
    const plan = apply(planEdge({ kind, diagram: classDiagram, tail: a, head: b }))
    const rel = plan.model as Elem
    const view = plan.view as View
    expect(rel._type).toBe(modelType)
    expect(rel._parent).toBe(a.model)
    expect(rel['source']).toBe(a.model)
    expect(rel['target']).toBe(b.model)
    expect(view._type).toBe(viewType)
    expect(view['tail']).toBe(a)
    expect(view['head']).toBe(b)
    expect(view['lineStyle']).toBe(1)
    expect(view.subViews).toHaveLength(3)
    expect(view.subViews.every((l) => l._type === 'EdgeLabelView' && l['hostEdge'] === view)).toBe(true)
    expectEmbeddedConsistent(view)
  })

  it.each<[EdgeKind, Record<string, unknown>, Record<string, unknown>]>([
    ['Association', {}, {}],
    ['DirectedAssociation', { navigable: 'unspecified' }, { navigable: 'navigable' }],
    ['Aggregation', {}, { aggregation: 'shared' }],
    ['Composition', {}, { aggregation: 'composite' }]
  ])('%s: association with ends, nine labels and two qualifier compartments', (kind, end1, end2) => {
    const { classDiagram, a, b } = classes()
    const plan = apply(planEdge({ kind, diagram: classDiagram, tail: a, head: b }))
    const assoc = plan.model as Elem
    const view = plan.view as View
    expect(assoc._parent).toBe(a.model)
    expect(assoc['end1']).toMatchObject({ _type: 'UMLAssociationEnd', reference: a.model, _parent: assoc, ...end1 })
    expect(assoc['end2']).toMatchObject({ _type: 'UMLAssociationEnd', reference: b.model, _parent: assoc, ...end2 })
    expect(view._type).toBe('UMLAssociationView')
    expect(view.subViews.filter((v) => v._type === 'EdgeLabelView')).toHaveLength(9)
    expect(view.subViews.filter((v) => v._type === 'UMLQualifierCompartmentView')).toHaveLength(2)
    expect((view['tailRoleNameLabel'] as View).model).toBe(assoc['end1'])
    expect((view['headMultiplicityLabel'] as Elem)['edgePosition']).toBe(0)
    expect((view['tailMultiplicityLabel'] as Elem)['alpha']).toBeCloseTo(-Math.PI / 6)
    expectEmbeddedConsistent(view)
  })

  it('InterfaceRealization connects a class to an interface only', () => {
    const { classDiagram, a, b, i } = classes()
    const plan = apply(planEdge({ kind: 'InterfaceRealization', diagram: classDiagram, tail: a, head: i }))
    expect(plan.model?._type).toBe('UMLInterfaceRealization')
    expect(() => planEdge({ kind: 'InterfaceRealization', diagram: classDiagram, tail: a, head: b })).toThrow()
  })

  it('Include / Extend between use cases; associations from actors', () => {
    const { useCase } = setup()
    const actor = apply(planNode({ kind: 'Actor', diagram: useCase, left: 0, top: 0 })).view as View
    const u1 = apply(planNode({ kind: 'UseCase', diagram: useCase, left: 0, top: 0 })).view as View
    const u2 = apply(planNode({ kind: 'UseCase', diagram: useCase, left: 0, top: 0 })).view as View
    expect(apply(planEdge({ kind: 'Include', diagram: useCase, tail: u1, head: u2 })).view?._type).toBe('UMLIncludeView')
    expect(apply(planEdge({ kind: 'Extend', diagram: useCase, tail: u2, head: u1 })).model?._type).toBe('UMLExtend')
    expect(apply(planEdge({ kind: 'Association', diagram: useCase, tail: actor, head: u1 })).model?._parent).toBe(
      actor.model
    )
    expect(() => planEdge({ kind: 'Include', diagram: useCase, tail: actor, head: u1 })).toThrow()
  })

  it('messages live in the interaction and attach to lifeline line parts', () => {
    const { sequence } = setup()
    const l1 = apply(planNode({ kind: 'Lifeline', diagram: sequence, left: 50, top: 0 })).view as UMLSeqLifelineView
    const l2 = apply(planNode({ kind: 'Lifeline', diagram: sequence, left: 250, top: 0 })).view as UMLSeqLifelineView
    const plan = apply(planEdge({ kind: 'Message', diagram: sequence, tail: l1, head: l2, y: 120 }))
    const message = plan.model as Elem
    const view = plan.view as UMLSeqMessageView
    expect(message._parent).toBe(sequence._parent)
    expect((sequence._parent as Elem)['messages']).toEqual([message])
    expect(message).toMatchObject({ name: 'Message1', messageSort: 'synchCall', source: l1.model, target: l2.model })
    expect(view.tail).toBe(l1.linePart)
    expect(view.head).toBe(l2.linePart)
    expect(view.points.every((p) => p.y === 120)).toBe(true)
    expect(view.activation?._type).toBe('UMLActivationView')
    expectEmbeddedConsistent(view)

    const reply = apply(planEdge({ kind: 'Message', diagram: sequence, tail: l2, head: l1, messageSort: 'reply' }))
    expect(reply.model?.['name']).toBe('')
    const self = apply(planEdge({ kind: 'Message', diagram: sequence, tail: l1, head: l1, y: 200 }))
    expect((self.view as UMLSeqMessageView).points).toHaveLength(4)
    expect(self.model?.['source']).toBe(self.model?.['target'])
  })

  it('flows live in the activity; note links have no model', () => {
    const { activity, classDiagram } = setup()
    const init = apply(planNode({ kind: 'InitialNode', diagram: activity, left: 0, top: 0 })).view as View
    const act = apply(planNode({ kind: 'Action', diagram: activity, left: 0, top: 100 })).view as View
    const flow = apply(planEdge({ kind: 'ControlFlow', diagram: activity, tail: init, head: act }))
    expect(flow.model?._parent).toBe(activity._parent)
    expect((activity._parent as Elem)['edges']).toEqual([flow.model])
    expect(flow.view?._type).toBe('UMLControlFlowView')

    const note = apply(planNode({ kind: 'Note', diagram: classDiagram, left: 0, top: 0 })).view as View
    const cls = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 200, top: 0 })).view as View
    const link = apply(planEdge({ kind: 'NoteLink', diagram: classDiagram, tail: note, head: cls }))
    expect(link.model).toBeNull()
    expect(link.view?._type).toBe('UMLNoteLinkView')
  })
})

describe('features', () => {
  it('plans features and one item view per owner view', () => {
    const { classDiagram } = setup()
    const plan = apply(planNode({ kind: 'Class', diagram: classDiagram, left: 0, top: 0 }))
    const cls = plan.model as Elem
    const ins = planFeature(cls, 'Attribute')
    expect(ins).toMatchObject({ owner: cls, field: 'attributes' })
    expect(ins.element).toMatchObject({ _type: 'UMLAttribute', name: 'Attribute1' })
    const items = planItemViews(ins.element, 'attributes', [plan.view as View])
    expect(items).toHaveLength(1)
    expect(items[0]?.owner).toBe((plan.view as UMLClassifierView).attributeCompartment)
    expect(items[0]?.element).toMatchObject({ _type: 'UMLAttributeView', model: ins.element, horizontalAlignment: 0 })
    expect(() => planFeature(cls, 'EnumerationLiteral')).toThrow()
  })
})

describe('everything together', () => {
  it('a project with every kind validates and survives a save/load round-trip', () => {
    const ctx = setup()
    for (const kind of Object.keys(NODE_KINDS) as NodeKind[]) {
      const diagram = ctx[DIAGRAM_OF[kind]]
      const container =
        kind === 'InputPin' || kind === 'OutputPin'
          ? (apply(planNode({ kind: 'Action', diagram, left: 0, top: 0 })).view as View)
          : undefined
      apply(planNode({ kind, diagram, left: 10, top: 10, container }))
    }
    const views = (d: Diagram, type: string) => d.ownedViews.filter((v) => isKindOf(v, type))
    apply(planNode({ kind: 'Class', diagram: ctx.classDiagram, left: 300, top: 10 }))
    const [c1, c2] = views(ctx.classDiagram, 'UMLClassView') as [View, View]
    apply(planEdge({ kind: 'Composition', diagram: ctx.classDiagram, tail: c1, head: c2 }))
    const [l1] = views(ctx.sequence, 'UMLSeqLifelineView') as [View]
    const l2 = apply(planNode({ kind: 'Lifeline', diagram: ctx.sequence, left: 300, top: 0 })).view as View
    apply(planEdge({ kind: 'Message', diagram: ctx.sequence, tail: l1, head: l2 }))

    expect(validateModel(ctx.project)).toEqual([])
    const text = writeMdj(ctx.project)
    const reread = readMdj(text)
    expect(reread.warnings).toEqual([])
    expect(writeMdj(reread.project)).toBe(text)
  })
})
