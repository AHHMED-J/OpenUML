/**
 * Toolbox palettes per diagram type. Each item's `kind` is a key of the model's `NODE_KINDS`
 * (rectangle/point gestures) or `EDGE_KINDS` (line gestures).
 */
import type { EdgeKind, NodeKind } from '../../model'
import type { PaletteTool } from '../uiStore'

export interface PaletteItem extends PaletteTool {
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
  extra: Pick<PaletteTool, 'messageSort' | 'selfConnection'> = {}
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
    diagramTypes: [CLASS],
    autoExpand: [CLASS],
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
    diagramTypes: [CLASS],
    items: [node('package', 'Package', 'Package'), node('model', 'Model', 'Model'), edge('pkg-dependency', 'Dependency', 'Dependency')]
  },
  {
    id: 'use-cases',
    title: 'Use Cases',
    diagramTypes: [USECASE],
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
    items: [node('combined-fragment', 'Combined Fragment', 'CombinedFragment')]
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
    id: 'annotations',
    title: 'Annotations',
    autoExpand: [CLASS, USECASE, SEQUENCE, ACTIVITY],
    items: [node('text', 'Text', 'Text'), node('note', 'Note', 'Note'), edge('note-link', 'Note Link', 'NoteLink')]
  }
]

/** Groups visible on a diagram type. */
export function palettesFor(diagramType: string | null): PaletteGroup[] {
  if (!diagramType) return []
  return PALETTES.filter((g) => !g.diagramTypes || g.diagramTypes.includes(diagramType))
}
