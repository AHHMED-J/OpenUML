/**
 * Model > Add and Add Diagram: which items are offered for a selected parent, and creating them
 * (each creation is one undoable operation through `commands/`).
 */
import {
  addFeature,
  createDiagram,
  createModelElement,
  type ModelEngine
} from '../commands'
import {
  createElement,
  defaultName,
  isKindOf,
  newRegion,
  nextName,
  type DiagramKind,
  type Elem,
  type FeatureKind
} from '../model'

export interface AddItem {
  /** Menu id suffix (`uml.<id>`). */
  readonly id: string
  readonly label: string
  /** Element type created. */
  readonly type: string
  /** Created through `addFeature` (adds item views to every view of the owner). */
  readonly feature?: FeatureKind
  /** Containment field for plain elements (default `ownedElements`). */
  readonly field?: string
  /** Name prefix for new elements (`<baseName><n>`); default: the type's display name. */
  readonly baseName?: string
  /** Where the element goes when it is not owned by the selected parent itself. */
  readonly ownerOf?: (parent: Elem) => { readonly owner: Elem; readonly field: string }
  /** Initializes the detached element before it is inserted. */
  readonly init?: (element: Elem, parent: Elem) => void
  /** Visible when the (effective) parent satisfies this. */
  readonly accepts: (parent: Elem) => boolean
}

const isProject = (e: Elem): boolean => isKindOf(e, 'Project')
const isPackage = (e: Elem): boolean => isKindOf(e, 'UMLPackage') || e._type === 'UMLSubsystem'
const isClassifier = (e: Elem): boolean => isKindOf(e, 'UMLClassifier')
const projectOrPackage = (e: Elem): boolean => isProject(e) || isPackage(e)
const namespace = (e: Elem): boolean => projectOrPackage(e) || isClassifier(e)

const isStateMachine = (e: Elem): boolean => isKindOf(e, 'UMLStateMachine')
const isState = (e: Elem): boolean => isKindOf(e, 'UMLState') && !isKindOf(e, 'UMLFinalState')
/** The region an internal transition of `state` lives in: its first own region, else the one containing it. */
function internalTransitionHome(state: Elem): { owner: Elem; field: string } {
  const own = (state['regions'] as Elem[] | undefined)?.[0]
  const home = own ?? (isKindOf(state._parent, 'UMLRegion') ? state._parent : null)
  if (!home) throw new Error('A state needs a region to hold internal transitions.')
  return { owner: home, field: 'transitions' }
}
const stateMachineItems: readonly AddItem[] = [
  {
    id: 'state-machine',
    label: 'State Machine',
    type: 'UMLStateMachine',
    accepts: projectOrPackage,
    init: (el) => {
      newRegion(el)
    }
  },
  {
    id: 'region',
    label: 'Region',
    type: 'UMLRegion',
    field: 'regions',
    accepts: (e) => isStateMachine(e) || isState(e),
    init: (el) => {
      el['name'] = ''
    }
  },
  { id: 'state', label: 'State', type: 'UMLState', field: 'vertices', accepts: (e) => isKindOf(e, 'UMLRegion') },
  { id: 'entry-activity', label: 'Entry Activity', type: 'UMLOpaqueBehavior', field: 'entryActivities', baseName: 'EntryActivity', accepts: isState },
  { id: 'do-activity', label: 'Do Activity', type: 'UMLOpaqueBehavior', field: 'doActivities', baseName: 'DoActivity', accepts: isState },
  { id: 'exit-activity', label: 'Exit Activity', type: 'UMLOpaqueBehavior', field: 'exitActivities', baseName: 'ExitActivity', accepts: isState },
  {
    id: 'internal-transition',
    label: 'Internal Transition',
    type: 'UMLTransition',
    accepts: (e) => isState(e) && (((e['regions'] as unknown[] | undefined)?.length ?? 0) > 0 || isKindOf(e._parent, 'UMLRegion')),
    ownerOf: internalTransitionHome,
    init: (el, parent) => {
      el['name'] = ''
      el['kind'] = 'internal'
      el['source'] = parent
      el['target'] = parent
    }
  }
]

const isRadProcess = (e: Elem): boolean => isKindOf(e, 'RADProcess')
const isRadRole = (e: Elem): boolean => isKindOf(e, 'RADRole')
const radElementItem = (id: string, label: string, type: string, baseName: string, init?: (el: Elem) => void): AddItem => ({
  id,
  label,
  type,
  field: 'elements',
  baseName,
  accepts: isRadRole,
  ...(init ? { init } : {})
})
const radItems: readonly AddItem[] = [
  { id: 'rad-process', label: 'RAD Process', type: 'RADProcess', accepts: projectOrPackage },
  { id: 'rad-role', label: 'Role', type: 'RADRole', field: 'roles', baseName: 'Role', accepts: isRadProcess },
  radElementItem('rad-activity', 'Activity', 'RADActivity', 'Activity'),
  radElementItem('rad-interaction', 'Interaction', 'RADInteraction', 'Interaction'),
  radElementItem('rad-undefined-process', 'Undefined Process', 'RADUndefinedProcess', 'Process'),
  radElementItem('rad-state-marker', 'State Marker', 'RADStateMarker', 'Marker', (el) => {
    el['name'] = ''
  }),
  radElementItem('rad-wait', 'Wait', 'RADWait', 'Event'),
  radElementItem('rad-role-start', 'Role Start', 'RADRoleStart', 'Start', (el) => {
    el['name'] = ''
  }),
  radElementItem('rad-case-refinement', 'Case Refinement', 'RADCaseRefinement', 'Question'),
  radElementItem('rad-part-refinement', 'Part Refinement', 'RADPartRefinement', 'Split')
]

export const ADD_ITEMS: readonly AddItem[] = [
  { id: 'model', label: 'Model', type: 'UMLModel', accepts: projectOrPackage },
  { id: 'package', label: 'Package', type: 'UMLPackage', accepts: projectOrPackage },
  { id: 'class', label: 'Class', type: 'UMLClass', accepts: namespace },
  { id: 'interface', label: 'Interface', type: 'UMLInterface', accepts: namespace },
  { id: 'datatype', label: 'DataType', type: 'UMLDataType', accepts: namespace },
  { id: 'enumeration', label: 'Enumeration', type: 'UMLEnumeration', accepts: namespace },
  { id: 'subsystem', label: 'Subsystem', type: 'UMLSubsystem', accepts: projectOrPackage },
  { id: 'component', label: 'Component', type: 'UMLComponent', accepts: namespace },
  { id: 'artifact', label: 'Artifact', type: 'UMLArtifact', accepts: namespace },
  { id: 'node', label: 'Node', type: 'UMLNode', accepts: namespace },
  { id: 'profile', label: 'Profile', type: 'UMLProfile', accepts: projectOrPackage },
  { id: 'stereotype', label: 'Stereotype', type: 'UMLStereotype', accepts: (e) => isKindOf(e, 'UMLProfile') },
  { id: 'metaclass', label: 'MetaClass', type: 'UMLMetaClass', accepts: (e) => isKindOf(e, 'UMLProfile') },
  { id: 'object', label: 'Object', type: 'UMLObject', accepts: projectOrPackage },
  { id: 'information-item', label: 'Information Item', type: 'UMLInformationItem', accepts: namespace },
  { id: 'slot', label: 'Slot', type: 'UMLSlot', feature: 'Slot', accepts: (e) => isKindOf(e, 'UMLInstance') },
  { id: 'usecase', label: 'Use Case', type: 'UMLUseCase', accepts: namespace },
  { id: 'actor', label: 'Actor', type: 'UMLActor', accepts: namespace },
  { id: 'attribute', label: 'Attribute', type: 'UMLAttribute', feature: 'Attribute', accepts: isClassifier },
  { id: 'operation', label: 'Operation', type: 'UMLOperation', feature: 'Operation', accepts: isClassifier },
  {
    id: 'parameter',
    label: 'Parameter',
    type: 'UMLParameter',
    feature: 'Parameter',
    accepts: (e) => isKindOf(e, 'UMLBehavioralFeature') || isKindOf(e, 'UMLActivity')
  },
  {
    id: 'enumeration-literal',
    label: 'Enumeration Literal',
    type: 'UMLEnumerationLiteral',
    feature: 'EnumerationLiteral',
    accepts: (e) => isKindOf(e, 'UMLEnumeration')
  },
  {
    id: 'extension-point',
    label: 'Extension Point',
    type: 'UMLExtensionPoint',
    feature: 'ExtensionPoint',
    accepts: (e) => isKindOf(e, 'UMLUseCase')
  },
  { id: 'collaboration', label: 'Collaboration', type: 'UMLCollaboration', accepts: namespace },
  { id: 'interaction', label: 'Interaction', type: 'UMLInteraction', accepts: isClassifier },
  { id: 'activity', label: 'Activity', type: 'UMLActivity', accepts: namespace },
  { id: 'action', label: 'Action', type: 'UMLAction', field: 'nodes', accepts: (e) => isKindOf(e, 'UMLActivity') },
  {
    id: 'interaction-operand',
    label: 'Interaction Operand',
    type: 'UMLInteractionOperand',
    feature: 'Operand',
    accepts: (e) => isKindOf(e, 'UMLCombinedFragment')
  },
  ...stateMachineItems,
  ...radItems
]

export interface AddDiagramItem {
  readonly kind: DiagramKind
  readonly label: string
  readonly type: string
  readonly accepts: (parent: Elem) => boolean
}

function hasInteractionDiagram(e: Elem): boolean {
  const owned = e['ownedElements']
  return Array.isArray(owned) && owned.some((c) => isKindOf(c as Elem, 'UMLSequenceDiagram'))
}

export const ADD_DIAGRAM_ITEMS: readonly AddDiagramItem[] = [
  { kind: 'ClassDiagram', label: 'Class Diagram', type: 'UMLClassDiagram', accepts: projectOrPackage },
  { kind: 'UseCaseDiagram', label: 'Use Case Diagram', type: 'UMLUseCaseDiagram', accepts: projectOrPackage },
  {
    kind: 'SequenceDiagram',
    label: 'Sequence Diagram',
    type: 'UMLSequenceDiagram',
    accepts: (e) =>
      projectOrPackage(e) ||
      isClassifier(e) ||
      isKindOf(e, 'UMLOperation') ||
      (isKindOf(e, 'UMLInteraction') && !hasInteractionDiagram(e))
  },
  {
    kind: 'ActivityDiagram',
    label: 'Activity Diagram',
    type: 'UMLActivityDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLOperation') || isKindOf(e, 'UMLActivity')
  },
  {
    kind: 'StatechartDiagram',
    label: 'Statechart Diagram',
    type: 'UMLStatechartDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLOperation') || isStateMachine(e)
  },
  {
    kind: 'TimingDiagram',
    label: 'Timing Diagram',
    type: 'UMLTimingDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLInteraction')
  },
  {
    kind: 'RADDiagram',
    label: 'Role Activity Diagram',
    type: 'RADDiagram',
    accepts: (e) => projectOrPackage(e) || isRadProcess(e)
  },
  { kind: 'ComponentDiagram', label: 'Component Diagram', type: 'UMLComponentDiagram', accepts: projectOrPackage },
  { kind: 'DeploymentDiagram', label: 'Deployment Diagram', type: 'UMLDeploymentDiagram', accepts: projectOrPackage },
  { kind: 'PackageDiagram', label: 'Package Diagram', type: 'UMLPackageDiagram', accepts: projectOrPackage },
  { kind: 'ProfileDiagram', label: 'Profile Diagram', type: 'UMLProfileDiagram', accepts: projectOrPackage },
  { kind: 'ObjectDiagram', label: 'Object Diagram', type: 'UMLObjectDiagram', accepts: projectOrPackage },
  {
    kind: 'CompositeStructureDiagram',
    label: 'Composite Structure Diagram',
    type: 'UMLCompositeStructureDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e)
  },
  {
    kind: 'CommunicationDiagram',
    label: 'Communication Diagram',
    type: 'UMLCommunicationDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLInteraction')
  },
  {
    kind: 'InteractionOverviewDiagram',
    label: 'Interaction Overview Diagram',
    type: 'UMLInteractionOverviewDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLInteraction') || isKindOf(e, 'UMLActivity')
  },
  { kind: 'InformationFlowDiagram', label: 'Information Flow Diagram', type: 'UMLInformationFlowDiagram', accepts: projectOrPackage }
]

/** Items of Model > Add visible for `parent`. */
export function addItemsFor(parent: Elem | null): AddItem[] {
  return parent ? ADD_ITEMS.filter((i) => i.accepts(parent)) : []
}

export function addDiagramItemsFor(parent: Elem | null): AddDiagramItem[] {
  return parent ? ADD_DIAGRAM_ITEMS.filter((i) => i.accepts(parent)) : []
}

/** Creates an element of `item` under `parent` as one operation; returns it. */
export function addModelElement(engine: ModelEngine, parent: Elem, item: AddItem): Elem {
  if (!item.accepts(parent)) throw new Error(`${item.label} cannot be placed here.`)
  if (item.feature) return addFeature(engine, parent, item.feature)
  const target = item.ownerOf?.(parent) ?? { owner: parent, field: item.field ?? 'ownedElements' }
  const siblings = (target.owner[target.field] as unknown[] | undefined) ?? []
  const element = createElement(item.type, { name: item.baseName ? nextName(siblings, item.baseName) : defaultName(item.type, siblings) })
  item.init?.(element, parent)
  return createModelElement(engine, target.owner, element, target.field)
}

/** Creates a diagram under `parent`; returns the new diagram. */
export function addDiagram(engine: ModelEngine, parent: Elem, kind: DiagramKind): Elem {
  const item = ADD_DIAGRAM_ITEMS.find((i) => i.kind === kind)
  if (item && !item.accepts(parent)) throw new Error(`${item.label} cannot be placed here.`)
  return createDiagram(engine, kind, parent).diagram
}
