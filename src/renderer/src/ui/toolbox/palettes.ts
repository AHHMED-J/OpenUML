/**
 * Toolbox palettes per diagram type. Each item's `kind` is a key of the model's `NODE_KINDS`
 * (rectangle/point gestures) or `EDGE_KINDS` (line gestures).
 */
import { EDGE_KINDS, NODE_KINDS, type EdgeKind, type NodeKind } from '../../model'
import type { PaletteTool } from '../uiStore'

interface PaletteItem extends PaletteTool {
  readonly id: string
  readonly label: string
  readonly kind: NodeKind | EdgeKind
  readonly gesture: 'rect' | 'line' | 'point'
}

export interface PaletteGroup {
  readonly id: string
  readonly title: string
  /** Diagram types where the group is visible; omitted = every diagram. */
  readonly diagramTypes?: readonly string[]
  /** Diagram types where the group starts expanded. */
  readonly autoExpand?: readonly string[]
  readonly items: readonly PaletteItem[]
}

const CLASS = 'UMLClassDiagram'
const USECASE = 'UMLUseCaseDiagram'
const SEQUENCE = 'UMLSequenceDiagram'
const ACTIVITY = 'UMLActivityDiagram'
const STATECHART = 'UMLStatechartDiagram'
const TIMING = 'UMLTimingDiagram'
const COMPONENT = 'UMLComponentDiagram'
const DEPLOYMENT = 'UMLDeploymentDiagram'
const PACKAGE = 'UMLPackageDiagram'
const PROFILE = 'UMLProfileDiagram'
const OBJECT = 'UMLObjectDiagram'
const COMPOSITE = 'UMLCompositeStructureDiagram'
const COMMUNICATION = 'UMLCommunicationDiagram'
const OVERVIEW = 'UMLInteractionOverviewDiagram'
const INFOFLOW = 'UMLInformationFlowDiagram'
const IDEF0 = 'IDEF0Diagram'
const RAD = 'RADDiagram'

const node = (id: string, label: string, kind: NodeKind, gesture: 'rect' | 'point' = 'rect'): PaletteItem => ({
  id,
  label,
  kind,
  gesture
})
const edge = (
  id: string,
  label: string,
  kind: EdgeKind,
  extra: Pick<PaletteTool, 'messageSort' | 'selfConnection' | 'freeEnd'> = {}
): PaletteItem => ({
  id,
  label,
  kind,
  gesture: 'line',
  ...extra
})

export const PALETTES: readonly PaletteGroup[] = [
  {
    id: 'classes-basic',
    title: 'Classes (Basic)',
    diagramTypes: [CLASS, COMPOSITE, INFOFLOW],
    autoExpand: [CLASS, COMPOSITE],
    items: [
      node('class', 'Class', 'Class'),
      node('interface', 'Interface', 'Interface'),
      edge('association', 'Association', 'Association'),
      edge('directed-association', 'Directed Association', 'DirectedAssociation'),
      edge('aggregation', 'Aggregation', 'Aggregation'),
      edge('composition', 'Composition', 'Composition'),
      edge('dependency', 'Dependency', 'Dependency'),
      edge('generalization', 'Generalization', 'Generalization'),
      edge('interface-realization', 'Interface Realization', 'InterfaceRealization')
    ]
  },
  {
    id: 'classes-advanced',
    title: 'Classes (Advanced)',
    diagramTypes: [CLASS],
    items: [
      node('datatype', 'DataType', 'DataType'),
      node('primitive-type', 'PrimitiveType', 'PrimitiveType'),
      node('enumeration', 'Enumeration', 'Enumeration'),
      node('signal', 'Signal', 'Signal'),
      edge('realization', 'Realization', 'Realization')
    ]
  },
  {
    id: 'packages',
    title: 'Packages',
    diagramTypes: [CLASS, PACKAGE],
    autoExpand: [PACKAGE],
    items: [
      node('package', 'Package', 'Package'),
      node('model', 'Model', 'Model'),
      node('subsystem', 'Subsystem', 'Subsystem'),
      edge('containment', 'Containment', 'Containment'),
      edge('pkg-dependency', 'Dependency', 'Dependency')
    ]
  },
  {
    id: 'components',
    title: 'Components',
    diagramTypes: [COMPONENT, DEPLOYMENT],
    autoExpand: [COMPONENT],
    items: [
      node('component', 'Component', 'Component'),
      node('artifact', 'Artifact', 'Artifact'),
      node('comp-interface', 'Interface', 'Interface'),
      edge('comp-dependency', 'Dependency', 'Dependency'),
      edge('comp-interface-realization', 'Interface Realization', 'InterfaceRealization'),
      edge('component-realization', 'Component Realization', 'ComponentRealization')
    ]
  },
  {
    id: 'deployment',
    title: 'Deployment',
    diagramTypes: [COMPONENT, DEPLOYMENT],
    autoExpand: [COMPONENT, DEPLOYMENT],
    items: [
      node('node', 'Node', 'Node'),
      edge('deployment', 'Deployment', 'Deployment'),
      edge('communication-path', 'Communication Path', 'CommunicationPath')
    ]
  },
  {
    id: 'profiles',
    title: 'Profiles',
    diagramTypes: [PROFILE],
    autoExpand: [PROFILE],
    items: [
      node('metaclass', 'MetaClass', 'MetaClass'),
      node('stereotype', 'Stereotype', 'Stereotype'),
      node('profile-enumeration', 'Enumeration', 'Enumeration'),
      edge('extension', 'Extension', 'Extension'),
      edge('profile-generalization', 'Generalization', 'Generalization')
    ]
  },
  {
    id: 'use-cases',
    title: 'Use Cases',
    diagramTypes: [USECASE, INFOFLOW],
    autoExpand: [USECASE],
    items: [
      node('uc-package', 'Package', 'Package'),
      node('subject', 'Use Case Subject', 'Subject'),
      node('use-case', 'Use Case', 'UseCase'),
      node('actor', 'Actor', 'Actor'),
      edge('uc-association', 'Association', 'Association'),
      edge('uc-directed-association', 'Directed Association', 'DirectedAssociation'),
      edge('uc-generalization', 'Generalization', 'Generalization'),
      edge('uc-dependency', 'Dependency', 'Dependency'),
      edge('include', 'Include', 'Include'),
      edge('extend', 'Extend', 'Extend')
    ]
  },
  {
    id: 'interactions-basic',
    title: 'Interactions (Basic)',
    diagramTypes: [SEQUENCE],
    autoExpand: [SEQUENCE],
    items: [
      node('lifeline', 'Lifeline', 'Lifeline'),
      edge('message', 'Message', 'Message', { messageSort: 'synchCall' }),
      { ...edge('self-message', 'Self Message', 'Message', { messageSort: 'synchCall', selfConnection: true }), gesture: 'point' },
      edge('async-message', 'Async Message', 'Message', { messageSort: 'asynchCall' }),
      edge('reply-message', 'Reply Message', 'Message', { messageSort: 'reply' }),
      edge('create-message', 'Create Message', 'Message', { messageSort: 'createMessage' }),
      edge('delete-message', 'Delete Message', 'Message', { messageSort: 'deleteMessage' }),
      edge('async-signal-message', 'Async Signal Message', 'Message', { messageSort: 'asynchSignal' })
    ]
  },
  {
    id: 'interactions-advanced',
    title: 'Interactions (Advanced)',
    diagramTypes: [SEQUENCE],
    items: [
      edge('found-message', 'Found Message', 'Message', { messageSort: 'asynchCall', freeEnd: 'tail' }),
      edge('lost-message', 'Lost Message', 'Message', { messageSort: 'asynchCall', freeEnd: 'head' }),
      node('endpoint', 'Endpoint', 'Endpoint', 'point'),
      node('gate', 'Gate', 'Gate', 'point'),
      node('state-invariant', 'State Invariant', 'StateInvariant', 'point'),
      node('continuation', 'Continuation', 'Continuation'),
      node('combined-fragment', 'Combined Fragment', 'CombinedFragment'),
      node('interaction-use', 'Interaction Use', 'InteractionUse')
    ]
  },
  {
    id: 'activities-basic',
    title: 'Activities (Basic)',
    diagramTypes: [ACTIVITY],
    autoExpand: [ACTIVITY],
    items: [
      node('action', 'Action', 'Action'),
      node('initial', 'Initial', 'InitialNode', 'point'),
      node('final', 'Final', 'ActivityFinalNode', 'point'),
      node('fork', 'Fork', 'ForkNode'),
      node('join', 'Join', 'JoinNode'),
      node('merge', 'Merge', 'MergeNode', 'point'),
      node('decision', 'Decision', 'DecisionNode', 'point'),
      edge('control-flow', 'Control Flow', 'ControlFlow')
    ]
  },
  {
    id: 'activities-advanced',
    title: 'Activities (Advanced)',
    diagramTypes: [ACTIVITY],
    items: [
      node('swimlane-vertical', 'Swimlane (Vertical)', 'Partition'),
      node('swimlane-horizontal', 'Swimlane (Horizontal)', 'HorizontalPartition'),
      node('send-signal', 'Send Signal', 'SendSignal'),
      node('accept-signal', 'Accept Signal', 'AcceptSignal'),
      node('accept-time-event', 'Accept Time Event', 'AcceptTimeEvent'),
      node('flow-final', 'Flow Final', 'FlowFinalNode', 'point'),
      node('object-node', 'Object Node', 'ObjectNode'),
      node('input-pin', 'Input Pin', 'InputPin', 'point'),
      node('output-pin', 'Output Pin', 'OutputPin', 'point'),
      edge('object-flow', 'Object Flow', 'ObjectFlow')
    ]
  },
  {
    id: 'statechart-basic',
    title: 'Statechart (Basic)',
    diagramTypes: [STATECHART],
    autoExpand: [STATECHART],
    items: [
      node('simple-state', 'Simple State', 'State'),
      node('initial-state', 'Initial State', 'InitialState', 'point'),
      node('choice', 'Choice', 'Choice', 'point'),
      node('state-join', 'Join', 'Join'),
      node('state-fork', 'Fork', 'Fork'),
      node('final-state', 'Final State', 'FinalState', 'point'),
      edge('transition', 'Transition', 'Transition'),
      { ...edge('self-transition', 'Self Transition', 'Transition', { selfConnection: true }), gesture: 'point' }
    ]
  },
  {
    id: 'statechart-advanced',
    title: 'Statechart (Advanced)',
    diagramTypes: [STATECHART],
    items: [
      node('composite-state', 'Composite State', 'CompositeState'),
      node('submachine-state', 'Submachine State', 'SubmachineState'),
      node('orthogonal-state', 'Orthogonal State', 'OrthogonalState'),
      node('junction', 'Junction', 'Junction', 'point'),
      node('shallow-history', 'Shallow History', 'ShallowHistory', 'point'),
      node('deep-history', 'Deep History', 'DeepHistory', 'point'),
      node('entry-point', 'Entry Point', 'EntryPoint', 'point'),
      node('exit-point', 'Exit Point', 'ExitPoint', 'point'),
      node('terminate', 'Terminate', 'Terminate', 'point'),
      node('connection-point-reference', 'Connection Point Reference', 'ConnectionPointReference', 'point')
    ]
  },
  {
    id: 'timing',
    title: 'Timing',
    diagramTypes: [TIMING],
    autoExpand: [TIMING],
    items: [
      node('timing-lifeline', 'Lifeline', 'TimingLifeline', 'point'),
      node('timing-state', 'State/Condition', 'TimingState', 'point'),
      node('time-segment', 'Time Segment', 'TimeSegment'),
      node('time-tick', 'Time Tick', 'TimeTick', 'point'),
      node('time-constraint', 'Time Constraint', 'TimeConstraint', 'point'),
      node('duration-constraint', 'Duration Constraint', 'DurationConstraint'),
      edge('timing-message', 'Message', 'TimingMessage')
    ]
  },
  {
    id: 'instances',
    title: 'Instances',
    diagramTypes: [OBJECT, CLASS, COMPONENT, DEPLOYMENT],
    autoExpand: [OBJECT],
    items: [
      node('object', 'Object', 'Object'),
      node('artifact-instance', 'Artifact Instance', 'ArtifactInstance'),
      node('component-instance', 'Component Instance', 'ComponentInstance'),
      node('node-instance', 'Node Instance', 'NodeInstance'),
      edge('link', 'Link', 'Link'),
      edge('directed-link', 'Directed Link', 'DirectedLink'),
      edge('link-object', 'Link Object', 'LinkObject')
    ]
  },
  {
    id: 'composite-structure',
    title: 'Composite Structure',
    diagramTypes: [COMPOSITE, CLASS, COMPONENT],
    autoExpand: [COMPOSITE],
    items: [
      node('collaboration', 'Collaboration', 'Collaboration'),
      node('port', 'Port', 'Port', 'point'),
      node('part', 'Part', 'Part'),
      edge('connector', 'Connector', 'Connector'),
      node('collaboration-use', 'Collaboration Use', 'CollaborationUse'),
      edge('role-binding', 'Role Binding', 'RoleBinding'),
      edge('cs-realization', 'Realization', 'Realization')
    ]
  },
  {
    id: 'communication',
    title: 'Communication',
    diagramTypes: [COMMUNICATION],
    autoExpand: [COMMUNICATION],
    items: [
      node('comm-lifeline', 'Lifeline', 'CommLifeline'),
      edge('comm-connector', 'Connector', 'Connector'),
      { ...edge('comm-self-connector', 'Self Connector', 'Connector', { selfConnection: true }), gesture: 'point' },
      edge('forward-message', 'Forward Message', 'CommForwardMessage', { messageSort: 'synchCall' }),
      edge('reverse-message', 'Reverse Message', 'CommReverseMessage', { messageSort: 'synchCall' })
    ]
  },
  {
    id: 'interaction-overview',
    title: 'Interaction Overview',
    diagramTypes: [OVERVIEW],
    autoExpand: [OVERVIEW],
    items: [
      node('ov-interaction-use', 'Interaction Use', 'InteractionUseInOverview'),
      node('ov-interaction', 'Interaction (Inline)', 'InteractionInOverview'),
      node('ov-initial', 'Initial', 'InitialNode', 'point'),
      node('ov-final', 'Final', 'ActivityFinalNode', 'point'),
      node('ov-fork', 'Fork', 'ForkNode'),
      node('ov-join', 'Join', 'JoinNode'),
      node('ov-merge', 'Merge', 'MergeNode', 'point'),
      node('ov-decision', 'Decision', 'DecisionNode', 'point'),
      edge('ov-control-flow', 'Control Flow', 'ControlFlow')
    ]
  },
  {
    id: 'information-flows',
    title: 'Information Flows',
    diagramTypes: [INFOFLOW],
    autoExpand: [INFOFLOW],
    items: [node('information-item', 'Information Item', 'InformationItem'), edge('information-flow', 'Information Flow', 'InformationFlow')]
  },
  {
    id: 'rad-basic',
    title: 'RAD (Basic)',
    diagramTypes: [RAD],
    autoExpand: [RAD],
    items: [
      node('rad-role', 'Role', 'RADRole'),
      node('rad-activity', 'Activity', 'RADActivity', 'point'),
      // One line tool: within a role a state line; between two roles' activities an interaction.
      edge('rad-state-line', 'Line', 'RADStateLine'),
      node('rad-case-refinement', 'Case Refinement', 'RADCaseRefinement', 'point'),
      node('rad-part-refinement', 'Part Refinement', 'RADPartRefinement', 'point'),
      node('rad-start', 'Start', 'RADStartMarker', 'point'),
      node('rad-end', 'End', 'RADEndMarker', 'point')
    ]
  },
  {
    id: 'rad-advanced',
    title: 'RAD (Advanced)',
    diagramTypes: [RAD],
    items: [
      node('rad-interaction', 'Interaction', 'RADInteraction', 'point'),
      edge('rad-interaction-link', 'Interaction Link', 'RADInteractionLink'),
      node('rad-case-branch', 'Add Alternative', 'RADCaseBranch', 'point'),
      node('rad-part-branch', 'Add Parallel Path', 'RADPartBranch', 'point'),
      node('rad-undefined-process', 'Undefined Process', 'RADUndefinedProcess', 'point'),
      node('rad-state-marker', 'State Marker', 'RADStateMarker', 'point'),
      node('rad-wait', 'Wait (Event)', 'RADWait', 'point'),
      node('rad-role-start', 'Role Start', 'RADRoleStart', 'point'),
      node('rad-external-role-start', 'External Role Start', 'RADExternalRoleStart', 'point')
    ]
  },
  {
    id: 'idef0',
    title: 'IDEF0',
    diagramTypes: [IDEF0],
    autoExpand: [IDEF0],
    items: [
      node('idef0-function', 'Function', 'IDEF0Function'),
      edge('idef0-arrow', 'Arrow', 'IDEF0Arrow'),
      edge('idef0-call', 'Call Arrow', 'IDEF0Call'),
      node('idef0-model-note', 'Model Note', 'IDEF0ModelNote', 'point')
    ]
  },
  {
    id: 'annotations',
    title: 'Annotations',
    autoExpand: [CLASS, USECASE, SEQUENCE, ACTIVITY, STATECHART, TIMING, COMPONENT, DEPLOYMENT, PACKAGE, PROFILE, OBJECT, COMPOSITE, COMMUNICATION, OVERVIEW, INFOFLOW, IDEF0, RAD],
    items: [node('text', 'Text', 'Text'), node('note', 'Note', 'Note'), edge('note-link', 'Note Link', 'NoteLink')]
  }
]

/** Groups visible on a diagram type. */
export function palettesFor(diagramType: string | null): PaletteGroup[] {
  if (!diagramType) return []
  return PALETTES.filter((g) => !g.diagramTypes || g.diagramTypes.includes(diagramType))
}

/** True when a tool of the diagram type's palette creates views of `viewType` (used to vet pasted views). */
export function diagramCanHostView(diagramType: string, viewType: string): boolean {
  return palettesFor(diagramType).some((g) =>
    g.items.some((item) => {
      const spec = (NODE_KINDS as Record<string, { viewType: string } | undefined>)[item.kind] ?? (EDGE_KINDS as Record<string, { viewType: string } | undefined>)[item.kind]
      return spec?.viewType === viewType
    })
  )
}
