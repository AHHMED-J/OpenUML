/**
 * Timing diagram factories: diagram creation (interaction + timing frame), lifeline bands,
 * state/condition rows, time segments, ticks, time and duration constraints, and messages
 * between segments. Called from `factories.ts`.
 */
import { isKindOf } from './metamodel'
import { ModelRuleError } from './errors'
import type { CreationPlan, DiagramPlan, EdgeRequest, Insertion, NodeRequest } from './factories'
import type { Bounds, Diagram, Elem, NodeView, Point, View } from './types'
import {
  addEmbeddedLabel,
  addSubView,
  boundsOf,
  buildGeneralEdgeView,
  createElement,
  defaultName,
  nextName
} from './view-builders'
import type { BehaviorNodeSpec } from './factories-statemachine'
import { ownedElementsOf } from './fields'

export type TimingNodeKind = 'TimingLifeline' | 'TimingState' | 'TimeSegment' | 'TimeTick' | 'TimeConstraint' | 'DurationConstraint'
export type TimingEdgeKind = 'TimingMessage'

/** Height of a time segment and minimum height of a state row. */
const TIMING_ROW_HEIGHT = 25
/** Grid cell used for the minimum width of segments and ticks. */
const GRID_CELL = 12

export const TIMING_NODE_KINDS: Readonly<Record<TimingNodeKind, BehaviorNodeSpec>> = {
  TimingLifeline: { modelType: 'UMLLifeline', viewType: 'UMLTimingLifelineView', field: 'participants', size: [200, 60] },
  TimingState: { modelType: 'UMLConstraint', viewType: 'UMLTimingStateView', field: 'ownedElements', size: [150, TIMING_ROW_HEIGHT] },
  TimeSegment: {
    modelType: 'UMLStateInvariant',
    modelInit: { invariant: '' },
    viewType: 'UMLTimeSegmentView',
    field: 'fragments',
    size: [GRID_CELL * 3, TIMING_ROW_HEIGHT]
  },
  TimeTick: { viewType: 'UMLTimeTickView', size: [GRID_CELL * 3, 11] },
  TimeConstraint: { modelType: 'UMLTimeConstraint', viewType: 'UMLTimeConstraintView', field: 'ownedElements', size: [60, 14] },
  DurationConstraint: { modelType: 'UMLDurationConstraint', viewType: 'UMLDurationConstraintView', field: 'ownedElements', size: [60, 20] }
}

export const TIMING_EDGE_KINDS = {
  TimingMessage: { modelType: 'UMLMessage', viewType: 'UMLTimingMessageView', ownedBy: { field: 'messages' } }
} as const

export function isTimingNodeKind(kind: string): kind is TimingNodeKind {
  return Object.prototype.hasOwnProperty.call(TIMING_NODE_KINDS, kind)
}

/**
 * Plans a timing diagram: an interaction directly, a collaboration gets a new interaction, any
 * other owner gets a collaboration with an interaction. The diagram gets a timing frame view.
 */
export function planTimingDiagram(owner: Elem, name?: string): DiagramPlan {
  const diagram = createElement<Diagram>('UMLTimingDiagram')
  let top: Elem = diagram
  let parent: Elem = owner
  if (!isKindOf(owner, 'UMLInteraction')) {
    const interaction = createElement('UMLInteraction')
    if (isKindOf(owner, 'UMLCollaboration')) {
      interaction['name'] = defaultName('UMLInteraction', ownedElementsOf(owner))
      top = interaction
    } else {
      const collaboration = createElement('UMLCollaboration', { name: defaultName('UMLCollaboration', ownedElementsOf(owner)) })
      interaction['name'] = defaultName('UMLInteraction', [])
      interaction._parent = collaboration
      ownedElementsOf(collaboration).push(interaction)
      top = collaboration
    }
    parent = interaction
  }
  diagram.name = name ?? defaultName('UMLTimingDiagram', parent === owner ? ownedElementsOf(owner) : [])
  if (top !== diagram) {
    diagram._parent = parent
    ownedElementsOf(parent).push(diagram)
  }
  const frame = createElement<NodeView>('UMLTimingFrameView', { model: diagram, left: 5, top: 5, width: 695, height: 595 })
  addEmbeddedLabel(frame, 'nameLabel', { left: 5, top: 5 })
  addEmbeddedLabel(frame, 'frameTypeLabel', { left: 5, top: 5, font: { face: 'Arial', size: 13, style: 1 } })
  frame._parent = diagram
  diagram.ownedViews.push(frame)
  return { diagram, model: top, view: null, insertions: [{ owner, field: 'ownedElements', element: top }], refAdditions: [] }
}

/** Owner of a new timing model element, or null for the default (the diagram's interaction). */
export function timingNodeOwner(req: NodeRequest): Elem | null {
  const container = req.container
  switch (req.kind as TimingNodeKind) {
    case 'TimingState': {
      if (!isKindOf(container?.model, 'UMLLifeline')) throw new ModelRuleError('A state/condition must be placed on a lifeline')
      return container.model
    }
    case 'TimeConstraint':
      return req.owner ?? container?.model ?? null
    default:
      return null
  }
}

/** Throws when `req` is not placed where timing elements are allowed. */
function requireContainer(req: NodeRequest): void {
  switch (req.kind as TimingNodeKind) {
    case 'TimingLifeline':
    case 'TimeTick':
      if (!req.container || req.container._type !== 'UMLTimingFrameView') throw new ModelRuleError('Timing elements should be placed inside a frame')
      break
    case 'TimeSegment':
      if (req.container?._type !== 'UMLTimingStateView') throw new ModelRuleError('A time segment should be placed on a state/condition row')
      break
    case 'TimeConstraint':
      if (!req.container) throw new ModelRuleError('A time constraint should be placed on a message or a time segment')
      break
    default:
  }
}

/** Initializes the freshly created model element of a timing node (names, segment links). */
export function initTimingModel(req: NodeRequest, model: Elem, owner: Elem, field: string): void {
  requireContainer(req)
  switch (req.kind as TimingNodeKind) {
    case 'TimingState':
      model['name'] = nextName((owner[field] as unknown[] | undefined) ?? [], 'State-Condition')
      break
    case 'TimeSegment': {
      const row = req.container?.model as Elem
      model['name'] = nextName((owner[field] as unknown[] | undefined) ?? [], 'Time Segment')
      model['covered'] = row._parent
      model['invariant'] = row
      break
    }
    default:
  }
}

function centerOfAny(view: View): Point {
  const b = boundsOf(view)
  if (b) return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  const pts = (view['points'] as Point[] | undefined) ?? []
  const a = pts[0] ?? { x: 0, y: 0 }
  const z = pts[pts.length - 1] ?? a
  return { x: Math.round((a.x + z.x) / 2), y: Math.round((a.y + z.y) / 2) }
}

/** Builds the view of a timing node kind (plus role attribute / link edge as extra insertions). */
export function buildTimingNodeView(req: NodeRequest, model: Elem | null, bounds: Bounds, insertions: Insertion[]): View {
  requireContainer(req)
  switch (req.kind as TimingNodeKind) {
    case 'TimingLifeline': {
      const lifeline = model as Elem
      const interaction = insertions[0]?.owner ?? null
      const collaboration = interaction?._parent
      if (isKindOf(collaboration, 'UMLClassifier')) {
        const role = createElement('UMLAttribute', { name: nextName(collaboration.attributes, 'Role') })
        lifeline['represent'] = role
        insertions.push({ owner: collaboration, field: 'attributes', element: role })
      }
      const view = createElement<NodeView>('UMLTimingLifelineView', { model: lifeline, showType: true, ...bounds, width: Math.max(200, bounds.width) })
      addEmbeddedLabel(view, 'nameLabel')
      return view
    }
    case 'TimingState': {
      const view = createElement<NodeView>('UMLTimingStateView', { model, ...bounds })
      addEmbeddedLabel(view, 'nameLabel')
      return view
    }
    case 'TimeSegment':
      return createElement<NodeView>('UMLTimeSegmentView', {
        model,
        ...bounds,
        width: Math.max(bounds.width, GRID_CELL * 3),
        height: TIMING_ROW_HEIGHT
      })
    case 'TimeTick':
      return createElement<NodeView>('UMLTimeTickView', { ...bounds, width: Math.max(bounds.width, GRID_CELL * 3) - 1, height: 11, text: '' })
    case 'DurationConstraint': {
      const view = createElement<NodeView>('UMLDurationConstraintView', { model, ...bounds })
      const label = addSubView(
        view,
        createElement<NodeView>('NodeLabelView', {
          model,
          parentStyle: false,
          left: bounds.left,
          top: bounds.top,
          height: 13,
          alpha: (3 * Math.PI) / 4,
          distance: 20,
          hostNode: view
        })
      )
      view['nameLabel'] = label
      return view
    }
    case 'TimeConstraint': {
      const host = req.container as View
      const label = createElement<NodeView>('UMLTimeConstraintView', {
        model,
        left: bounds.left,
        top: bounds.top + 20,
        width: bounds.width,
        height: 14
      })
      const tail = centerOfAny(host)
      const link = createElement<View>('UMLTimeConstraintLinkView', {
        tail: host,
        head: label,
        points: [tail, { x: bounds.left + Math.round(bounds.width / 2), y: bounds.top + 20 }]
      })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: link })
      return label
    }
    default:
      return createElement<NodeView>('NodeView', { ...bounds })
  }
}

// ---------------------------------------------------------------------------------------------
// Messages

export function canConnectTiming(tail: View, head: View): boolean {
  return tail._type === 'UMLTimeSegmentView' && head._type === 'UMLTimeSegmentView' && tail !== head
}

/** Plans a message between two time segments (source/target = the lifelines the segments cover). */
export function planTimingMessage(req: EdgeRequest): CreationPlan {
  const interaction = req.diagram._parent as Elem
  const siblings = (interaction['messages'] as unknown[] | undefined) ?? []
  const model = createElement('UMLMessage', {
    name: req.name ?? defaultName('UMLMessage', siblings),
    messageSort: req.messageSort ?? 'synchCall',
    source: req.tail.model?.['covered'] ?? null,
    target: req.head.model?.['covered'] ?? null
  })
  const t = boundsOf(req.tail)
  const h = boundsOf(req.head)
  const points: Point[] = req.points
    ? [...req.points]
    : t && h
      ? [
          { x: t.left + t.width, y: t.top + 12 },
          { x: h.left, y: h.top + 12 }
        ]
      : []
  const view = buildGeneralEdgeView('UMLTimingMessageView', { model, tail: req.tail, head: req.head, points })
  return {
    model,
    view,
    insertions: [
      { owner: interaction, field: 'messages', element: model },
      { owner: req.diagram, field: 'ownedViews', element: view }
    ],
    refAdditions: []
  }
}
