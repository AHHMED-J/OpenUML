/**
 * Factories for MVP elements. They build *plans*: detached model elements and views plus the
 * list of places to insert them. Plans do not touch any repository; `commands/` applies a plan
 * as one undoable operation.
 */
import { fieldOf, isKindOf, isSubtype } from './metamodel'
import { walk } from './repository'
import {
  STATEMACHINE_EDGE_KINDS,
  STATEMACHINE_NODE_KINDS,
  buildStateMachineNodeView,
  canConnectStateMachine,
  isStateMachineNodeKind,
  planStatechartDiagram,
  planTransition,
  stateMachineNodeOwner,
  type StateMachineEdgeKind,
  type StateMachineNodeKind
} from './factories-statemachine'
import {
  TIMING_EDGE_KINDS,
  TIMING_NODE_KINDS,
  buildTimingNodeView,
  canConnectTiming,
  initTimingModel,
  isTimingNodeKind,
  planTimingDiagram,
  planTimingMessage,
  timingNodeOwner,
  type TimingEdgeKind,
  type TimingNodeKind
} from './factories-timing'
import {
  IDEF0_EDGE_KINDS,
  IDEF0_NODE_KINDS,
  canConnectIdef0,
  isIdef0EdgeKind,
  isIdef0NodeKind,
  planIdef0Diagram,
  planIdef0Edge,
  planIdef0Node,
  type Idef0EdgeKind,
  type Idef0NodeKind
} from './factories-idef0'
import {
  RAD_EDGE_KINDS,
  RAD_NODE_KINDS,
  canConnectRad,
  isRadEdgeKind,
  isRadNodeKind,
  planRadDiagram,
  planRadEdge,
  planRadNode,
  type RadEdgeKind,
  type RadNodeKind
} from './factories-rad'
import type {
  Bounds,
  Diagram,
  EdgeView,
  Elem,
  NodeView,
  Point,
  Project,
  UMLSeqLifelineView,
  UMLSeqMessageView,
  View
} from './types'
import {
  addEmbeddedLabel,
  addFloatingLabels,
  addListCompartment,
  addRelationshipLabels,
  addSubView,
  boundsOf,
  buildClassifierView,
  buildGeneralEdgeView,
  buildGeneralNodeView,
  buildUndirectedEdgeView,
  centerOf,
  createElement,
  defaultName,
  nextName
} from './view-builders'
import {
  STRUCTURE_DIAGRAM_TYPES,
  STRUCTURE_EDGE_KINDS,
  STRUCTURE_NODE_KINDS,
  canConnectStructure,
  isStructureDiagramKind,
  isStructureEdgeKind,
  isStructureNodeKind,
  planStructureDiagram,
  planStructureEdge,
  planStructureNode,
  type StructureDiagramKind,
  type StructureEdgeKind,
  type StructureNodeKind
} from './structure-factories'

/** Insert `element` into `owner[field]` (at `index`, default: end; `obj` fields are assigned). */
export interface Insertion {
  readonly owner: Elem
  readonly field: string
  readonly element: Elem
  readonly index?: number
}

/** Append `target` to the reference list `owner[field]` (e.g. a container's `containedViews`). */
export interface RefAddition {
  readonly owner: Elem
  readonly field: string
  readonly target: Elem
}

/** Moves `element` into `owner[field]` (applied after the insertions). */
export interface ModelMove {
  readonly element: Elem
  readonly owner: Elem
  readonly field: string
}

export interface CreationPlan {
  /** The main model element created (null for view-only kinds such as notes). */
  readonly model: Elem | null
  /** The main view created (null when only model elements are created). */
  readonly view: View | null
  readonly insertions: readonly Insertion[]
  readonly refAdditions: readonly RefAddition[]
  /** Model elements relocated into another owner as part of the creation (package containment). */
  readonly moves?: readonly ModelMove[]
  /** Reference/field assignments on existing elements applied after the insertions (e.g. `childDiagram`). */
  readonly sets?: readonly FieldSet[]
  /** Existing elements removed by the creation (containment links made stale by a move). */
  readonly removals?: readonly Elem[]
}

/** Assigns `value` to the non-containment field `owner[field]` as part of a creation. */
export interface FieldSet {
  readonly owner: Elem
  readonly field: string
  readonly value: unknown
}

// =============================================================================================
// Project and diagrams

/** New project: Project "Untitled" → UMLModel "Model" → UMLClassDiagram "Main" (default diagram). */
export function createDefaultProject(): Project {
  const project = createElement<Project>('Project', { name: 'Untitled', documentVersion: 1 })
  const model = createElement('UMLModel', { name: 'Model', _parent: project })
  project.ownedElements.push(model)
  const diagram = createElement<Diagram>('UMLClassDiagram', { name: 'Main', defaultDiagram: true, _parent: model })
  ;(model['ownedElements'] as Elem[]).push(diagram)
  return project
}

export type DiagramKind =
  | 'StatechartDiagram'
  | 'TimingDiagram'
  | 'ClassDiagram'
  | 'UseCaseDiagram'
  | 'SequenceDiagram'
  | 'ActivityDiagram'
  | 'ComponentDiagram'
  | 'DeploymentDiagram'
  | 'PackageDiagram'
  | 'ProfileDiagram'
  | 'RADDiagram'
  | 'IDEF0Diagram'
  | StructureDiagramKind

export const DIAGRAM_TYPES: Record<DiagramKind, string> = {
  StatechartDiagram: 'UMLStatechartDiagram',
  TimingDiagram: 'UMLTimingDiagram',
  ...STRUCTURE_DIAGRAM_TYPES,
  ClassDiagram: 'UMLClassDiagram',
  UseCaseDiagram: 'UMLUseCaseDiagram',
  SequenceDiagram: 'UMLSequenceDiagram',
  ActivityDiagram: 'UMLActivityDiagram',
  ComponentDiagram: 'UMLComponentDiagram',
  DeploymentDiagram: 'UMLDeploymentDiagram',
  PackageDiagram: 'UMLPackageDiagram',
  ProfileDiagram: 'UMLProfileDiagram',
  RADDiagram: 'RADDiagram',
  IDEF0Diagram: 'IDEF0Diagram'
}

/** Diagram kinds that, added to the Project, are wrapped in a new `UMLModel`. */
const WRAPPED_IN_MODEL: ReadonlySet<DiagramKind> = new Set<DiagramKind>(['ComponentDiagram', 'DeploymentDiagram', 'PackageDiagram'])

export interface DiagramPlan extends CreationPlan {
  readonly diagram: Diagram
}

function ownedElementsOf(el: Elem): Elem[] {
  const list = el['ownedElements']
  return Array.isArray(list) ? (list as Elem[]) : []
}

/** Creates `child` (detached) inside `parent.ownedElements`. */
function nest<T extends Elem>(parent: Elem, child: T): T {
  child._parent = parent
  ownedElementsOf(parent).push(child)
  return child
}

/**
 * Plans a new diagram under `owner`, creating the wrapping elements the diagram kind needs:
 * - class / use case diagram on the Project: wrapped in a new `UMLModel`;
 * - sequence diagram: package → Collaboration → Interaction → diagram; classifier → Interaction → diagram;
 *   interaction → diagram. The diagram gets a `UMLFrameView` whose model is the diagram;
 * - activity diagram: package → Activity → diagram; activity → diagram.
 */
export function planDiagram(kind: DiagramKind, owner: Elem, name?: string): DiagramPlan {
  if (kind === 'StatechartDiagram') return planStatechartDiagram(owner, name)
  if (kind === 'TimingDiagram') return planTimingDiagram(owner, name)
  if (kind === 'RADDiagram') return planRadDiagram(owner, name)
  if (kind === 'IDEF0Diagram') return planIdef0Diagram(owner, name)
  if (isStructureDiagramKind(kind)) return planStructureDiagram(kind, owner, name)
  const type = DIAGRAM_TYPES[kind]
  const diagram = createElement<Diagram>(type)
  let top: Elem = diagram
  let parent: Elem = owner

  if ((kind === 'ClassDiagram' || kind === 'UseCaseDiagram') && isKindOf(owner, 'Project')) {
    top = createElement('UMLModel', { name: defaultName('UMLModel', ownedElementsOf(owner)) })
    parent = top
  } else if (kind === 'SequenceDiagram' && !isKindOf(owner, 'UMLInteraction')) {
    const interaction = createElement('UMLInteraction')
    if (isKindOf(owner, 'UMLClassifier')) {
      interaction['name'] = defaultName('UMLInteraction', ownedElementsOf(owner))
      top = interaction
    } else {
      const collaboration = createElement('UMLCollaboration', {
        name: defaultName('UMLCollaboration', ownedElementsOf(owner))
      })
      interaction['name'] = defaultName('UMLInteraction', [])
      nest(collaboration, interaction)
      top = collaboration
    }
    parent = interaction
  } else if (kind === 'ActivityDiagram' && !isKindOf(owner, 'UMLActivity')) {
    top = createElement('UMLActivity', { name: defaultName('UMLActivity', ownedElementsOf(owner)) })
    parent = top
  } else if (WRAPPED_IN_MODEL.has(kind) && isKindOf(owner, 'Project')) {
    top = createElement('UMLModel', { name: defaultName('UMLModel', ownedElementsOf(owner)) })
    parent = top
  } else if (kind === 'ProfileDiagram' && !isKindOf(owner, 'UMLProfile')) {
    top = createElement('UMLProfile', { name: defaultName('UMLProfile', ownedElementsOf(owner)) })
    parent = top
  }

  diagram.name = name ?? defaultName(type, parent === owner ? ownedElementsOf(owner) : [])
  if (top !== diagram) nest(parent, diagram)

  if (kind === 'SequenceDiagram') {
    const frame = createElement<NodeView>('UMLFrameView', { model: diagram, left: 8, top: 8, width: 700, height: 600 })
    addEmbeddedLabel(frame, 'nameLabel', { left: 8, top: 8 })
    addEmbeddedLabel(frame, 'frameTypeLabel', { left: 8, top: 8, font: { face: 'Arial', size: 13, style: 1 } })
    frame._parent = diagram
    diagram.ownedViews.push(frame)
  }

  return {
    diagram,
    model: top,
    view: null,
    insertions: [{ owner, field: 'ownedElements', element: top }],
    refAdditions: []
  }
}

// =============================================================================================
// Nodes

export type NodeKind =
  | StateMachineNodeKind
  | TimingNodeKind
  | RadNodeKind
  | Idef0NodeKind
  // class diagram
  | 'Class'
  | 'Interface'
  | 'Enumeration'
  | 'DataType'
  | 'PrimitiveType'
  | 'Signal'
  | 'Package'
  | 'Model'
  // use case diagram
  | 'Actor'
  | 'UseCase'
  | 'Subject'
  // sequence diagram
  | 'Lifeline'
  | 'CombinedFragment'
  | 'Endpoint'
  | 'Gate'
  | 'StateInvariant'
  | 'Continuation'
  | 'InteractionUse'
  // activity diagram
  | 'Action'
  | 'SendSignal'
  | 'AcceptSignal'
  | 'AcceptTimeEvent'
  | 'ObjectNode'
  | 'InitialNode'
  | 'ActivityFinalNode'
  | 'FlowFinalNode'
  | 'ForkNode'
  | 'JoinNode'
  | 'DecisionNode'
  | 'MergeNode'
  | 'Partition'
  | 'HorizontalPartition'
  | 'InputPin'
  | 'OutputPin'
  // component / deployment / package / profile diagrams
  | 'Component'
  | 'Artifact'
  | 'Subsystem'
  | 'Node'
  | 'Profile'
  | 'MetaClass'
  | 'Stereotype'
  // object / composite structure / communication / interaction overview / information flow diagrams
  | StructureNodeKind
  // annotations (any diagram)
  | 'Note'
  | 'Text'

interface NodeKindSpec {
  /** Model type; omitted for view-only kinds. */
  readonly modelType?: string
  readonly modelInit?: Record<string, unknown>
  readonly viewType: string
  /** Containment field in the owner; default `ownedElements`. */
  readonly field?: string
  readonly size: readonly [number, number]
  /** Insert the view at the start of `ownedViews` so it is drawn behind other views. */
  readonly behind?: boolean
}

const CLASSIFIER_SIZE = [120, 70] as const
const CONTROL_FIELD = 'nodes'

export const NODE_KINDS: Readonly<Record<NodeKind, NodeKindSpec>> = {
  ...STATEMACHINE_NODE_KINDS,
  ...TIMING_NODE_KINDS,
  ...RAD_NODE_KINDS,
  ...IDEF0_NODE_KINDS,
  ...STRUCTURE_NODE_KINDS,
  Class: { modelType: 'UMLClass', viewType: 'UMLClassView', size: CLASSIFIER_SIZE },
  Interface: { modelType: 'UMLInterface', viewType: 'UMLInterfaceView', size: [30, 30] },
  Enumeration: { modelType: 'UMLEnumeration', viewType: 'UMLEnumerationView', size: CLASSIFIER_SIZE },
  DataType: { modelType: 'UMLDataType', viewType: 'UMLDataTypeView', size: CLASSIFIER_SIZE },
  PrimitiveType: { modelType: 'UMLPrimitiveType', viewType: 'UMLPrimitiveTypeView', size: CLASSIFIER_SIZE },
  Signal: { modelType: 'UMLSignal', viewType: 'UMLSignalView', size: CLASSIFIER_SIZE },
  Package: { modelType: 'UMLPackage', viewType: 'UMLPackageView', size: [120, 80] },
  Model: { modelType: 'UMLModel', viewType: 'UMLModelView', size: [120, 80] },
  Actor: { modelType: 'UMLActor', viewType: 'UMLActorView', size: [40, 80] },
  UseCase: { modelType: 'UMLUseCase', viewType: 'UMLUseCaseView', size: [120, 50] },
  Subject: { modelType: 'UMLUseCaseSubject', viewType: 'UMLUseCaseSubjectView', size: [300, 400], behind: true },
  Lifeline: { modelType: 'UMLLifeline', viewType: 'UMLSeqLifelineView', field: 'participants', size: [100, 200] },
  CombinedFragment: {
    modelType: 'UMLCombinedFragment',
    modelInit: { interactionOperator: 'seq' },
    viewType: 'UMLCombinedFragmentView',
    field: 'fragments',
    size: [300, 150]
  },
  Endpoint: { modelType: 'UMLEndpoint', viewType: 'UMLEndpointView', field: 'participants', size: [15, 15] },
  Gate: { modelType: 'UMLGate', viewType: 'UMLGateView', field: 'participants', size: [15, 15] },
  StateInvariant: { modelType: 'UMLStateInvariant', modelInit: { invariant: '' }, viewType: 'UMLStateInvariantView', field: 'fragments', size: [80, 25] },
  Continuation: { modelType: 'UMLContinuation', viewType: 'UMLContinuationView', field: 'fragments', size: [80, 30] },
  InteractionUse: { modelType: 'UMLInteractionUse', viewType: 'UMLInteractionUseView', field: 'fragments', size: [120, 70] },
  Action: { modelType: 'UMLAction', viewType: 'UMLActionView', field: CONTROL_FIELD, size: [100, 50] },
  SendSignal: {
    modelType: 'UMLAction',
    modelInit: { kind: 'sendSignal' },
    viewType: 'UMLActionView',
    field: CONTROL_FIELD,
    size: [100, 50]
  },
  AcceptSignal: {
    modelType: 'UMLAction',
    modelInit: { kind: 'acceptSignal' },
    viewType: 'UMLActionView',
    field: CONTROL_FIELD,
    size: [100, 50]
  },
  AcceptTimeEvent: {
    modelType: 'UMLAction',
    modelInit: { kind: 'timeEvent' },
    viewType: 'UMLActionView',
    field: CONTROL_FIELD,
    size: [40, 50]
  },
  ObjectNode: { modelType: 'UMLObjectNode', viewType: 'UMLObjectNodeView', field: CONTROL_FIELD, size: [100, 40] },
  InitialNode: { modelType: 'UMLInitialNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [20, 20] },
  ActivityFinalNode: {
    modelType: 'UMLActivityFinalNode',
    viewType: 'UMLControlNodeView',
    field: CONTROL_FIELD,
    size: [26, 26]
  },
  FlowFinalNode: { modelType: 'UMLFlowFinalNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [26, 26] },
  ForkNode: { modelType: 'UMLForkNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [70, 6] },
  JoinNode: { modelType: 'UMLJoinNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [70, 6] },
  DecisionNode: { modelType: 'UMLDecisionNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [23, 19] },
  MergeNode: { modelType: 'UMLMergeNode', viewType: 'UMLControlNodeView', field: CONTROL_FIELD, size: [23, 19] },
  Partition: {
    modelType: 'UMLActivityPartition',
    viewType: 'UMLSwimlaneView',
    field: 'groups',
    size: [200, 400],
    behind: true
  },
  HorizontalPartition: {
    modelType: 'UMLActivityPartition',
    viewType: 'UMLSwimlaneView',
    field: 'groups',
    size: [400, 200],
    behind: true
  },
  InputPin: { modelType: 'UMLInputPin', viewType: 'UMLInputPinView', field: 'inputs', size: [18, 18] },
  OutputPin: { modelType: 'UMLOutputPin', viewType: 'UMLOutputPinView', field: 'outputs', size: [18, 18] },
  Component: { modelType: 'UMLComponent', viewType: 'UMLComponentView', size: [120, 70] },
  Artifact: { modelType: 'UMLArtifact', viewType: 'UMLArtifactView', size: [60, 80] },
  Subsystem: { modelType: 'UMLSubsystem', viewType: 'UMLSubsystemView', size: [120, 80] },
  Node: { modelType: 'UMLNode', viewType: 'UMLNodeView', size: [120, 80] },
  Profile: { modelType: 'UMLProfile', viewType: 'UMLProfileView', size: [120, 80] },
  MetaClass: { modelType: 'UMLMetaClass', modelInit: { name: 'UMLClass' }, viewType: 'UMLMetaClassView', size: [120, 50] },
  Stereotype: { modelType: 'UMLStereotype', viewType: 'UMLStereotypeView', size: [120, 70] },
  Note: { viewType: 'UMLNoteView', size: [120, 50] },
  Text: { viewType: 'UMLTextView', size: [80, 25] }
}

export interface NodeRequest {
  readonly kind: NodeKind
  readonly diagram: Diagram
  readonly left: number
  readonly top: number
  /** Defaults to the kind's default size. */
  readonly width?: number
  readonly height?: number
  /**
   * Owner of the new model element. Default: the diagram's `_parent` (for pins: the model of
   * `container`, which must be an action view).
   */
  readonly owner?: Elem
  /** View that visually contains the new view (subject, swimlane, package; the action view for pins). */
  readonly container?: View
  /** Initial name; default `<TypeName><n>`. */
  readonly name?: string
  /** State invariants: the lifeline the invariant constrains. */
  readonly covered?: Elem
}

/** The containment field used for `kind` in `owner` (falls back to `ownedElements`). */
export function ownerFieldFor(owner: Elem, kind: NodeKind): string {
  const field = NODE_KINDS[kind].field
  return field && fieldOf(owner, field) ? field : 'ownedElements'
}

/** Plans a new node: model element (if any) + its view with all required sub-views. */
export function planNode(req: NodeRequest): CreationPlan {
  if (isRadNodeKind(req.kind)) return planRadNode(req) as CreationPlan
  if (isIdef0NodeKind(req.kind)) return planIdef0Node(req)
  const structure = planStructureNode(req)
  if (structure) return structure
  const spec = NODE_KINDS[req.kind]
  const bounds: Bounds = {
    left: Math.round(req.left),
    top: Math.round(req.top),
    width: Math.round(req.width ?? spec.size[0]),
    height: Math.round(req.height ?? spec.size[1])
  }
  const insertions: Insertion[] = []
  const refAdditions: RefAddition[] = []

  let model: Elem | null = null
  if (spec.modelType) {
    const owner = req.owner ?? defaultNodeOwner(req)
    const field = ownerFieldFor(owner, req.kind)
    const siblings = (owner[field] as unknown[] | undefined) ?? []
    model = createElement(spec.modelType, {
      name: req.name ?? defaultName(spec.modelType, siblings),
      ...spec.modelInit
    })
    if (req.covered && fieldOf(model, 'covered')) model['covered'] = req.covered
    if (isTimingNodeKind(req.kind)) initTimingModel(req, model, owner, field)
    insertions.push({ owner, field, element: model })
  }

  const view = buildNodeView(req, spec, model, bounds, insertions)
  if (req.container && req.kind !== 'TimeConstraint') {
    view.containerView = req.container
    refAdditions.push({ owner: req.container, field: 'containedViews', target: view })
  }
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view, ...(spec.behind ? { index: 0 } : {}) })
  return { model, view, insertions, refAdditions }
}

function defaultNodeOwner(req: NodeRequest): Elem {
  if (isStateMachineNodeKind(req.kind)) return stateMachineNodeOwner(req) as Elem
  if (isTimingNodeKind(req.kind)) {
    const timingOwner = timingNodeOwner(req)
    if (timingOwner) return timingOwner
  }
  if (req.kind === 'InputPin' || req.kind === 'OutputPin') {
    const action = req.container?.model
    if (!isKindOf(action, 'UMLAction')) throw new Error('Pins must be created on an action view')
    return action
  }
  const owner = req.diagram._parent
  if (!owner) throw new Error('Diagram has no owner')
  return owner
}

function buildNodeView(
  req: NodeRequest,
  spec: NodeKindSpec,
  model: Elem | null,
  bounds: Bounds,
  insertions: Insertion[]
): View {
  if (isStructureNodeKind(req.kind)) throw new Error(`${req.kind} is planned by planStructureNode`)
  if (isRadNodeKind(req.kind)) throw new Error(`${req.kind} is planned by planRadNode`)
  if (isIdef0NodeKind(req.kind)) throw new Error(`${req.kind} is planned by planIdef0Node`)
  switch (req.kind) {
    case 'Class':
    case 'DataType':
    case 'PrimitiveType':
    case 'Signal':
      return buildClassifierView(spec.viewType, model as Elem, bounds)
    case 'Interface':
      return buildClassifierView(spec.viewType, model as Elem, bounds, {
        stereotypeDisplay: 'icon',
        suppressAttributes: true,
        suppressOperations: true
      })
    case 'Enumeration':
    case 'Actor':
    case 'UseCase':
      return buildClassifierView(spec.viewType, model as Elem, bounds, {
        suppressAttributes: true,
        suppressOperations: true
      })
    case 'Component':
    case 'Node':
      return buildClassifierView(spec.viewType, model as Elem, bounds, { suppressAttributes: true, suppressOperations: true })
    case 'Artifact':
      return buildClassifierView(spec.viewType, model as Elem, bounds, {
        stereotypeDisplay: 'icon',
        suppressAttributes: true,
        suppressOperations: true
      })
    case 'Stereotype':
      return buildClassifierView(spec.viewType, model as Elem, bounds)
    case 'Subsystem':
    case 'Profile':
    case 'MetaClass':
    case 'Package':
    case 'Model':
    case 'Subject':
    case 'Action':
    case 'SendSignal':
    case 'AcceptSignal':
    case 'AcceptTimeEvent':
    case 'ObjectNode':
      return buildGeneralNodeView(spec.viewType, model, bounds)
    case 'Lifeline':
      return buildLifelineView(model as Elem, bounds, insertions)
    case 'CombinedFragment':
      return buildCombinedFragmentView(model as Elem, bounds)
    case 'Endpoint':
    case 'Gate':
      return createElement<NodeView>(spec.viewType, { model, ...bounds })
    case 'StateInvariant':
    case 'Continuation':
    case 'InteractionUse': {
      const view = createElement<NodeView>(spec.viewType, { model, ...bounds })
      addEmbeddedLabel(view, req.kind === 'StateInvariant' ? 'invariantLabel' : 'nameLabel')
      if (req.kind === 'InteractionUse') addEmbeddedLabel(view, 'frameTypeLabel', { font: { face: 'Arial', size: 13, style: 1 } })
      return view
    }
    case 'InitialNode':
    case 'ActivityFinalNode':
    case 'FlowFinalNode':
    case 'ForkNode':
    case 'JoinNode':
    case 'DecisionNode':
    case 'MergeNode':
      return createElement<NodeView>(spec.viewType, { model, containerChangeable: true, ...bounds })
    case 'Partition':
    case 'HorizontalPartition': {
      const view = createElement<NodeView>(spec.viewType, {
        model,
        ...bounds,
        isVertical: req.kind === 'Partition'
      })
      addEmbeddedLabel(view, 'nameLabel', { left: bounds.left, top: bounds.top + 4, width: bounds.width })
      return view
    }
    case 'InputPin':
    case 'OutputPin': {
      const view = createElement<NodeView>(spec.viewType, { model, ...bounds })
      addFloatingLabels(view, model)
      return view
    }
    case 'State':
    case 'CompositeState':
    case 'OrthogonalState':
    case 'SubmachineState':
    case 'InitialState':
    case 'Choice':
    case 'Join':
    case 'Fork':
    case 'Junction':
    case 'ShallowHistory':
    case 'DeepHistory':
    case 'EntryPoint':
    case 'ExitPoint':
    case 'Terminate':
    case 'FinalState':
    case 'ConnectionPointReference':
      return buildStateMachineNodeView(req, model as Elem, bounds, insertions)
    case 'TimingLifeline':
    case 'TimingState':
    case 'TimeSegment':
    case 'TimeTick':
    case 'TimeConstraint':
    case 'DurationConstraint':
      return buildTimingNodeView(req, model, bounds, insertions)
    case 'Note':
    case 'Text':
      return createElement<NodeView>(spec.viewType, { ...bounds })
  }
}

/** Lifeline head at y = 40 with its dashed line part; also creates the represented role attribute. */
function buildLifelineView(lifeline: Elem, bounds: Bounds, insertions: Insertion[]): View {
  const interaction = insertions[0]?.owner ?? null
  const collaboration = interaction?._parent
  if (isKindOf(collaboration, 'UMLClassifier')) {
    const role = createElement('UMLAttribute', { name: nextName(collaboration.attributes, 'Role') })
    lifeline['represent'] = role
    insertions.push({ owner: collaboration, field: 'attributes', element: role })
  }
  // Lifeline heads sit at a fixed y; lifelines only move horizontally.
  const top = 40
  const height = Math.max(200, bounds.height)
  const view = buildGeneralNodeView('UMLSeqLifelineView', lifeline, { ...bounds, top, height }) as UMLSeqLifelineView
  view.linePart = addSubView(
    view,
    createElement<NodeView>('UMLLinePartView', {
      model: lifeline,
      left: Math.round(bounds.left + bounds.width / 2),
      top: top + 40,
      width: 1,
      height: height - 40
    })
  )
  return view
}

function buildCombinedFragmentView(fragment: Elem, bounds: Bounds): View {
  const operand = createElement('UMLInteractionOperand', { name: 'Operand1', _parent: fragment })
  ;(fragment['operands'] as Elem[]).push(operand)
  const view = createElement<NodeView>('UMLCombinedFragmentView', { model: fragment, ...bounds })
  addEmbeddedLabel(view, 'nameLabel')
  addEmbeddedLabel(view, 'frameTypeLabel', { font: { face: 'Arial', size: 13, style: 1 } })
  const compartment = addListCompartment(view, 'UMLInteractionOperandCompartmentView', 'operandCompartment', fragment)
  addSubView(compartment, createItemView(compartment, operand))
  return view
}

// =============================================================================================
// Features (attributes, operations, parameters, literals ...) and their item views

export type FeatureKind =
  | 'Attribute'
  | 'Operation'
  | 'Reception'
  | 'Parameter'
  | 'EnumerationLiteral'
  | 'ExtensionPoint'
  | 'Operand'
  | 'Slot'

const FEATURES: Record<FeatureKind, { type: string; field: string; ownerType: string }> = {
  Attribute: { type: 'UMLAttribute', field: 'attributes', ownerType: 'UMLClassifier' },
  Operation: { type: 'UMLOperation', field: 'operations', ownerType: 'UMLClassifier' },
  Reception: { type: 'UMLReception', field: 'receptions', ownerType: 'UMLClassifier' },
  Parameter: { type: 'UMLParameter', field: 'parameters', ownerType: 'UMLBehavioralFeature' },
  EnumerationLiteral: { type: 'UMLEnumerationLiteral', field: 'literals', ownerType: 'UMLEnumeration' },
  ExtensionPoint: { type: 'UMLExtensionPoint', field: 'extensionPoints', ownerType: 'UMLUseCase' },
  Operand: { type: 'UMLInteractionOperand', field: 'operands', ownerType: 'UMLCombinedFragment' },
  Slot: { type: 'UMLSlot', field: 'slots', ownerType: 'UMLInstance' }
}

export function canAddFeature(owner: Elem, kind: FeatureKind): boolean {
  const spec = FEATURES[kind]
  return isKindOf(owner, spec.ownerType) || (kind === 'Parameter' && isKindOf(owner, 'UMLBehavior'))
}

/** Plans a new feature element (detached) for `owner`. Item views are added by `planItemViews`. */
export function planFeature(owner: Elem, kind: FeatureKind, props: Record<string, unknown> = {}): Insertion {
  if (!canAddFeature(owner, kind)) throw new Error(`Cannot add ${kind} to ${owner._type}`)
  const spec = FEATURES[kind]
  const siblings = (owner[spec.field] as unknown[] | undefined) ?? []
  const element = createElement(spec.type, { name: defaultName(spec.type, siblings), ...props })
  return { owner, field: spec.field, element }
}

/** How list compartments of views mirror item lists of their model. */
export interface ItemBinding {
  readonly modelField: string
  readonly itemType: string
  readonly compartmentField: string
  readonly itemViewType: string
}

export const ITEM_BINDINGS: readonly ItemBinding[] = [
  binding('attributes', 'UMLAttribute', 'attributeCompartment', 'UMLAttributeView'),
  binding('operations', 'UMLOperation', 'operationCompartment', 'UMLOperationView'),
  binding('receptions', 'UMLReception', 'receptionCompartment', 'UMLReceptionView'),
  binding('literals', 'UMLEnumerationLiteral', 'enumerationLiteralCompartment', 'UMLEnumerationLiteralView'),
  binding('extensionPoints', 'UMLExtensionPoint', 'extensionPointCompartment', 'UMLExtensionPointView'),
  binding('operands', 'UMLInteractionOperand', 'operandCompartment', 'UMLInteractionOperandView'),
  binding('slots', 'UMLSlot', 'slotCompartment', 'UMLSlotView')
]

function binding(modelField: string, itemType: string, compartmentField: string, itemViewType: string): ItemBinding {
  return { modelField, itemType, compartmentField, itemViewType }
}

/** Creates the item view showing `item` inside `compartment` (detached; caller inserts it into `subViews`). */
export function createItemView(compartment: NodeView, item: Elem): View {
  const type = ITEM_BINDINGS.find((b) => isKindOf(item, b.itemType))?.itemViewType ?? 'LabelView'
  if (type === 'UMLInteractionOperandView') {
    const view = createElement<NodeView>(type, {
      model: item,
      left: compartment.left,
      top: compartment.top,
      width: compartment.width,
      height: 30
    })
    addEmbeddedLabel(view, 'guardLabel', { left: compartment.left + 20, top: compartment.top + 15 })
    return view
  }
  return createElement<NodeView>(type, {
    model: item,
    left: compartment.left + 5,
    top: compartment.top + 5,
    width: Math.max(0, compartment.width - 10),
    height: 13,
    horizontalAlignment: 0
  })
}

/**
 * For a new item in `owner[modelField]`, plans one item view per view of `owner` that has the
 * matching compartment. `viewsOfOwner` are the owner's views (see `Repository.viewsOf`).
 */
export function planItemViews(item: Elem, modelField: string, viewsOfOwner: readonly View[]): Insertion[] {
  const bind = ITEM_BINDINGS.find((b) => b.modelField === modelField)
  if (!bind) return []
  const result: Insertion[] = []
  for (const view of viewsOfOwner) {
    const compartment = view[bind.compartmentField]
    if (isKindOf(compartment as Elem, 'NodeView')) {
      const c = compartment as NodeView
      result.push({ owner: c, field: 'subViews', element: Object.assign(createItemView(c, item), { _parent: c }) })
    }
  }
  return result
}

// =============================================================================================
// Edges

export type EdgeKind =
  | StateMachineEdgeKind
  | TimingEdgeKind
  | RadEdgeKind
  | Idef0EdgeKind
  | 'Association'
  | 'DirectedAssociation'
  | 'Aggregation'
  | 'Composition'
  | 'Generalization'
  | 'Dependency'
  | 'Realization'
  | 'InterfaceRealization'
  | 'Include'
  | 'Extend'
  | 'Message'
  | 'ControlFlow'
  | 'ObjectFlow'
  | 'ComponentRealization'
  | 'Deployment'
  | 'CommunicationPath'
  | 'Containment'
  | 'Extension'
  | StructureEdgeKind
  | 'NoteLink'

interface EdgeKindSpec {
  readonly modelType?: string
  readonly viewType: string
  /** Owner of the relationship: the tail's model (default) or the diagram's owner in `field`. */
  readonly ownedBy?: { readonly field: string }
  readonly end1?: Record<string, unknown>
  readonly end2?: Record<string, unknown>
}

export const EDGE_KINDS: Readonly<Record<EdgeKind, EdgeKindSpec>> = {
  ...STATEMACHINE_EDGE_KINDS,
  ...TIMING_EDGE_KINDS,
  ...RAD_EDGE_KINDS,
  ...IDEF0_EDGE_KINDS,
  ...STRUCTURE_EDGE_KINDS,
  Association: { modelType: 'UMLAssociation', viewType: 'UMLAssociationView' },
  DirectedAssociation: {
    modelType: 'UMLAssociation',
    viewType: 'UMLAssociationView',
    end1: { navigable: 'unspecified' },
    end2: { navigable: 'navigable' }
  },
  Aggregation: { modelType: 'UMLAssociation', viewType: 'UMLAssociationView', end2: { aggregation: 'shared' } },
  Composition: { modelType: 'UMLAssociation', viewType: 'UMLAssociationView', end2: { aggregation: 'composite' } },
  Generalization: { modelType: 'UMLGeneralization', viewType: 'UMLGeneralizationView' },
  Dependency: { modelType: 'UMLDependency', viewType: 'UMLDependencyView' },
  Realization: { modelType: 'UMLRealization', viewType: 'UMLRealizationView' },
  InterfaceRealization: { modelType: 'UMLInterfaceRealization', viewType: 'UMLInterfaceRealizationView' },
  Include: { modelType: 'UMLInclude', viewType: 'UMLIncludeView' },
  Extend: { modelType: 'UMLExtend', viewType: 'UMLExtendView' },
  Message: { modelType: 'UMLMessage', viewType: 'UMLSeqMessageView', ownedBy: { field: 'messages' } },
  ControlFlow: { modelType: 'UMLControlFlow', viewType: 'UMLControlFlowView', ownedBy: { field: 'edges' } },
  ObjectFlow: { modelType: 'UMLObjectFlow', viewType: 'UMLObjectFlowView', ownedBy: { field: 'edges' } },
  ComponentRealization: { modelType: 'UMLComponentRealization', viewType: 'UMLComponentRealizationView' },
  Deployment: { modelType: 'UMLDeployment', viewType: 'UMLDeploymentView' },
  CommunicationPath: { modelType: 'UMLCommunicationPath', viewType: 'UMLCommunicationPathView' },
  Containment: { viewType: 'UMLContainmentView' },
  Extension: { modelType: 'UMLExtension', viewType: 'UMLExtensionView' },
  NoteLink: { viewType: 'UMLNoteLinkView' }
}

export interface EdgeRequest {
  readonly kind: EdgeKind
  readonly diagram: Diagram
  /** View at the source end (tail). For messages, a lifeline view or its line part. */
  readonly tail: View
  /** View at the target end (head). */
  readonly head: View
  /** Initial polyline; default: centre of tail to centre of head (messages: horizontal at `y`). */
  readonly points?: readonly Point[]
  /** Messages only: `UMLMessageSort` literal (default `synchCall`). */
  readonly messageSort?: string
  /** Messages only: y coordinate of the message (default: 40 below the top of the tail's line). */
  readonly y?: number
  readonly name?: string
  /** IDEF0 arrows only: the ICOM role at the function end (default: derived from the ends). */
  readonly role?: string
}

const ACTIVITY_NODE_TYPES = ['UMLActivityNode', 'UMLPin']

function lifelineViewOf(view: View): UMLSeqLifelineView | null {
  if (isKindOf(view, 'UMLSeqLifelineView')) return view
  if (view._type === 'UMLLinePartView' && isKindOf(view._parent, 'UMLSeqLifelineView')) return view._parent
  return null
}

function isEndpointView(view: View): boolean {
  return isKindOf(view, 'UMLMessageEndpointView')
}

/** The top of the containment tree holding `el` (the project). */
function rootOf(el: Elem): Elem {
  let root = el
  while (root._parent) root = root._parent
  return root
}

/** Containment link: `child` is moved into `container`, which must not lie inside `child`. */
function canContain(child: Elem | null, container: Elem | null): boolean {
  if (!child || !container || child === container) return false
  if (isKindOf(child, 'Project') || !isKindOf(child, 'UMLModelElement') || !isKindOf(container, 'UMLModelElement')) return false
  for (let p = container._parent; p; p = p._parent) if (p === child) return false
  const siblings = child._parent?.['ownedElements']
  if (!Array.isArray(siblings) || !siblings.includes(child)) return false
  return fieldOf(container, 'ownedElements')?.kind === 'objs'
}

/** Whether an edge of `kind` may connect `tail` to `head` (model types must fit). */
export function canConnect(kind: EdgeKind, tail: View, head: View): boolean {
  if (isStructureEdgeKind(kind)) return canConnectStructure(kind, tail, head)
  if (isRadEdgeKind(kind)) return canConnectRad(kind, tail, head)
  if (isIdef0EdgeKind(kind)) return canConnectIdef0(kind, tail, head)
  const a = tail.model
  const b = head.model
  switch (kind) {
    case 'Association':
    case 'DirectedAssociation':
    case 'Aggregation':
    case 'Composition':
      return isKindOf(a, 'UMLClassifier') && isKindOf(b, 'UMLClassifier')
    case 'Generalization':
      return isKindOf(a, 'UMLClassifier') && isKindOf(b, 'UMLClassifier') && a !== b
    case 'Dependency':
    case 'Realization':
      return isKindOf(a, 'UMLModelElement') && isKindOf(b, 'UMLModelElement')
    case 'InterfaceRealization':
      return isKindOf(a, 'UMLClassifier') && isKindOf(b, 'UMLInterface')
    case 'Include':
    case 'Extend':
      return isKindOf(a, 'UMLUseCase') && isKindOf(b, 'UMLUseCase')
    case 'Message': {
      // Lifeline to lifeline, or a lifeline with a found/lost endpoint or a gate.
      const t = lifelineViewOf(tail) !== null
      const h = lifelineViewOf(head) !== null
      return (t || isEndpointView(tail)) && (h || isEndpointView(head)) && (t || h)
    }
    case 'ControlFlow':
    case 'ObjectFlow':
      return ACTIVITY_NODE_TYPES.some((t) => isKindOf(a, t)) && ACTIVITY_NODE_TYPES.some((t) => isKindOf(b, t))
    case 'ComponentRealization':
      return isKindOf(a, 'UMLClassifier') && isKindOf(b, 'UMLComponent')
    case 'Deployment':
      return (
        (isKindOf(a, 'UMLClassifier') && isKindOf(b, 'UMLNode')) ||
        (isKindOf(a, 'UMLInstance') && isKindOf(b, 'UMLNodeInstance'))
      )
    case 'CommunicationPath':
      return isKindOf(a, 'UMLNode') && isKindOf(b, 'UMLNode')
    case 'Containment':
      return canContain(a, b)
    case 'Extension':
      return isKindOf(a, 'UMLStereotype') && isKindOf(b, 'UMLMetaClass')
    case 'Transition':
      return canConnectStateMachine(tail, head)
    case 'TimingMessage':
      return canConnectTiming(tail, head)
    case 'NoteLink':
      return tail !== head && (tail._type === 'UMLNoteView' || head._type === 'UMLNoteView')
  }
}

/** Plans a new relationship (model + edge view with all labels) between two views. */
export function planEdge(req: EdgeRequest): CreationPlan {
  if (!canConnect(req.kind, req.tail, req.head)) {
    throw new Error(`Cannot connect ${req.tail._type} to ${req.head._type} with ${req.kind}`)
  }
  const structure = planStructureEdge(req)
  if (structure) return structure
  if (isRadEdgeKind(req.kind)) return planRadEdge(req) as CreationPlan
  if (isIdef0EdgeKind(req.kind)) return planIdef0Edge(req)
  if (req.kind === 'Message') return planMessage(req)
  if (req.kind === 'Transition') return planTransition(req)
  if (req.kind === 'TimingMessage') return planTimingMessage(req)
  const spec = EDGE_KINDS[req.kind]
  const points = req.points ? [...req.points] : defaultPoints(req.tail, req.head)
  const insertions: Insertion[] = []
  const source = req.tail.model
  const target = req.head.model

  if (!spec.modelType) {
    const view = createElement<View>(spec.viewType, { tail: req.tail, head: req.head, points })
    insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
    const moves: ModelMove[] = []
    const removals: Elem[] = []
    if (req.kind === 'Containment' && source && target && source._parent !== target) {
      moves.push({ element: source, owner: target, field: 'ownedElements' })
      // The element leaves its old owner: containment links drawn to that owner no longer hold.
      for (const el of walk(rootOf(req.diagram))) {
        if (el._type !== 'UMLContainmentView') continue
        const link = el as EdgeView
        if (link.tail?.model === source && link.head?.model !== target) removals.push(el)
      }
    }
    return {
      model: null,
      view,
      insertions,
      refAdditions: [],
      ...(moves.length > 0 ? { moves } : {}),
      ...(removals.length > 0 ? { removals } : {})
    }
  }

  const owner = spec.ownedBy ? (req.diagram._parent as Elem) : (source as Elem)
  const field = spec.ownedBy && fieldOf(owner, spec.ownedBy.field) ? spec.ownedBy.field : 'ownedElements'
  const model = createElement(spec.modelType, req.name ? { name: req.name } : {})
  insertions.push({ owner, field, element: model })

  const init = { model, tail: req.tail, head: req.head, points }
  let view: View
  if (isSubtype(spec.modelType, 'UMLAssociation')) {
    const end1 = createElement('UMLAssociationEnd', { _parent: model, reference: source, ...spec.end1 })
    const end2 = createElement('UMLAssociationEnd', { _parent: model, reference: target, ...spec.end2 })
    model['end1'] = end1
    model['end2'] = end2
    view = buildUndirectedEdgeView(spec.viewType, init, end1, end2)
  } else {
    model['source'] = source
    model['target'] = target
    view = buildGeneralEdgeView(spec.viewType, init)
  }
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
  return { model, view, insertions, refAdditions: [] }
}

function defaultPoints(tail: View, head: View): Point[] {
  const a = centerOf(tail)
  const b = centerOf(head)
  if (!a || !b) return []
  if (tail === head) {
    const box = boundsOf(tail) as Bounds
    const right = box.left + box.width
    return [
      { x: right, y: a.y - 10 },
      { x: right + 30, y: a.y - 10 },
      { x: right + 30, y: a.y + 10 },
      { x: right, y: a.y + 10 }
    ]
  }
  return [a, b]
}

const SORTS_WITHOUT_NAME = new Set(['reply', 'createMessage', 'deleteMessage'])
const SORTS_WITH_ACTIVATION = new Set(['synchCall', 'asynchCall', 'deleteMessage'])

/**
 * Messages: model in the interaction's `messages`, source/target = lifelines; the view's
 * tail/head are the lifelines' line parts.
 */
function planMessage(req: EdgeRequest): CreationPlan {
  const tailLifeline = lifelineViewOf(req.tail)
  const headLifeline = lifelineViewOf(req.head)
  // An end is a lifeline (its line part) or a found/lost endpoint / gate view.
  const tailLine = (tailLifeline ? (tailLifeline.linePart ?? tailLifeline) : req.tail) as NodeView
  const headLine = (headLifeline ? (headLifeline.linePart ?? headLifeline) : req.head) as NodeView
  const interaction = req.diagram._parent as Elem
  const field = fieldOf(interaction, 'messages') ? 'messages' : 'ownedElements'
  const sort = req.messageSort ?? 'synchCall'
  const siblings = (interaction[field] as unknown[] | undefined) ?? []

  const model = createElement('UMLMessage', {
    name: req.name ?? (SORTS_WITHOUT_NAME.has(sort) ? '' : defaultName('UMLMessage', siblings)),
    messageSort: sort,
    source: tailLifeline ? tailLifeline.model : req.tail.model,
    target: headLifeline ? headLifeline.model : req.head.model
  })

  const y = Math.round(req.y ?? req.points?.[0]?.y ?? tailLine.top + 40)
  const tx = Math.round(tailLine.left + tailLine.width / 2)
  const hx = Math.round(headLine.left + headLine.width / 2)
  const points: Point[] = req.points
    ? [...req.points]
    : tailLifeline !== null && tailLifeline === headLifeline
      ? [
          { x: tx, y },
          { x: tx + 30, y },
          { x: tx + 30, y: y + 20 },
          { x: tx + 7, y: y + 20 }
        ]
      : [
          { x: tx, y },
          { x: hx, y }
        ]

  const view = createElement<UMLSeqMessageView>('UMLSeqMessageView', {
    model,
    tail: tailLine,
    head: headLine,
    points
  })
  addRelationshipLabels(view, model)
  const arrival = points[points.length - 1] ?? { x: hx, y }
  view.activation = addSubView(
    view,
    createElement<NodeView>('UMLActivationView', {
      model,
      visible: SORTS_WITH_ACTIVATION.has(sort) && headLifeline !== null,
      left: Math.round(headLine.left + headLine.width / 2) - 7,
      top: arrival.y,
      width: 14,
      height: 25
    })
  )
  return {
    model,
    view,
    insertions: [
      { owner: interaction, field, element: model },
      { owner: req.diagram, field: 'ownedViews', element: view }
    ],
    refAdditions: []
  }
}
