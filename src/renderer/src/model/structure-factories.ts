/**
 * Factories of the structural / interaction-overview diagram families (object, composite
 * structure, communication, interaction overview, information flow). `factories.ts` merges the
 * kind tables below into `NODE_KINDS` / `EDGE_KINDS` / `DIAGRAM_TYPES` and delegates to these
 * planners for the kinds listed here. Plans are detached, like all plans (see `factories.ts`).
 *
 * This module imports only types from `factories.ts` (the dependency is one-way at run time).
 */
import { isKindOf } from './metamodel'
import type { Bounds, Diagram, EdgeView, Elem, NodeView, Point, View } from './types'
import type { CreationPlan, DiagramPlan, EdgeRequest, Insertion, NodeRequest, RefAddition } from './factories'
import {
  addEmbeddedLabel,
  addFloatingLabels,
  addListCompartment,
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

// =============================================================================================
// Kind tables

export type StructureDiagramKind =
  | 'ObjectDiagram'
  | 'CompositeStructureDiagram'
  | 'CommunicationDiagram'
  | 'InteractionOverviewDiagram'
  | 'InformationFlowDiagram'

export const STRUCTURE_DIAGRAM_TYPES: Record<StructureDiagramKind, string> = {
  ObjectDiagram: 'UMLObjectDiagram',
  CompositeStructureDiagram: 'UMLCompositeStructureDiagram',
  CommunicationDiagram: 'UMLCommunicationDiagram',
  InteractionOverviewDiagram: 'UMLInteractionOverviewDiagram',
  InformationFlowDiagram: 'UMLInformationFlowDiagram'
}

export function isStructureDiagramKind(kind: string): kind is StructureDiagramKind {
  return Object.prototype.hasOwnProperty.call(STRUCTURE_DIAGRAM_TYPES, kind)
}

export type StructureNodeKind =
  | 'Object'
  | 'ArtifactInstance'
  | 'ComponentInstance'
  | 'NodeInstance'
  | 'Port'
  | 'Part'
  | 'Collaboration'
  | 'CollaborationUse'
  | 'CommLifeline'
  | 'InteractionUseInOverview'
  | 'InteractionInOverview'
  | 'InformationItem'

export interface StructureNodeSpec {
  readonly modelType?: string
  readonly modelInit?: Record<string, unknown>
  readonly viewType: string
  readonly field?: string
  readonly size: readonly [number, number]
  readonly behind?: boolean
}

/** Port box size (fixed). */
export const PORT_SIZE = 14
/** Minimum size of a communication lifeline. */
export const COMM_LIFELINE_MIN = { width: 100, height: 30 } as const

export const STRUCTURE_NODE_KINDS: Readonly<Record<StructureNodeKind, StructureNodeSpec>> = {
  Object: { modelType: 'UMLObject', viewType: 'UMLObjectView', size: [120, 40] },
  ArtifactInstance: { modelType: 'UMLArtifactInstance', viewType: 'UMLArtifactInstanceView', size: [120, 50] },
  ComponentInstance: { modelType: 'UMLComponentInstance', viewType: 'UMLComponentInstanceView', size: [120, 60] },
  NodeInstance: { modelType: 'UMLNodeInstance', viewType: 'UMLNodeInstanceView', size: [120, 70] },
  Port: { modelType: 'UMLPort', viewType: 'UMLPortView', size: [PORT_SIZE, PORT_SIZE] },
  Part: { modelType: 'UMLAttribute', modelInit: { aggregation: 'composite' }, viewType: 'UMLPartView', field: 'attributes', size: [80, 40] },
  Collaboration: { modelType: 'UMLCollaboration', viewType: 'UMLCollaborationView', size: [140, 70] },
  CollaborationUse: { modelType: 'UMLCollaborationUse', viewType: 'UMLCollaborationUseView', size: [140, 60] },
  CommLifeline: { modelType: 'UMLLifeline', viewType: 'UMLCommLifelineView', field: 'participants', size: [100, 30] },
  InteractionUseInOverview: { modelType: 'UMLAction', viewType: 'UMLInteractionUseView', field: 'nodes', size: [140, 60] },
  InteractionInOverview: { modelType: 'UMLAction', viewType: 'UMLInteractionInlineView', field: 'nodes', size: [220, 150] },
  InformationItem: { modelType: 'UMLInformationItem', viewType: 'UMLInformationItemView', size: [120, 70] }
}

export function isStructureNodeKind(kind: string): kind is StructureNodeKind {
  return Object.prototype.hasOwnProperty.call(STRUCTURE_NODE_KINDS, kind)
}

export type StructureEdgeKind =
  | 'Link'
  | 'DirectedLink'
  | 'LinkObject'
  | 'LinkObjectLink'
  | 'Connector'
  | 'CommForwardMessage'
  | 'CommReverseMessage'
  | 'RoleBinding'
  | 'InformationFlow'

export interface StructureEdgeSpec {
  readonly modelType?: string
  readonly viewType: string
  readonly ownedBy?: { readonly field: string }
  readonly end1?: Record<string, unknown>
  readonly end2?: Record<string, unknown>
}

export const STRUCTURE_EDGE_KINDS: Readonly<Record<StructureEdgeKind, StructureEdgeSpec>> = {
  Link: { modelType: 'UMLLink', viewType: 'UMLLinkView' },
  DirectedLink: { modelType: 'UMLLink', viewType: 'UMLLinkView', end1: { navigable: 'unspecified' }, end2: { navigable: 'navigable' } },
  LinkObject: { modelType: 'UMLLink', viewType: 'UMLLinkView' },
  LinkObjectLink: { modelType: 'UMLLinkObjectLink', viewType: 'UMLLinkObjectLinkView' },
  Connector: { modelType: 'UMLConnector', viewType: 'UMLConnectorView' },
  CommForwardMessage: { modelType: 'UMLMessage', viewType: 'UMLCommMessageView', ownedBy: { field: 'messages' } },
  CommReverseMessage: { modelType: 'UMLMessage', viewType: 'UMLCommMessageView', ownedBy: { field: 'messages' } },
  RoleBinding: { modelType: 'UMLRoleBinding', viewType: 'UMLRoleBindingView' },
  InformationFlow: { modelType: 'UMLInformationFlow', viewType: 'UMLInformationFlowView' }
}

export function isStructureEdgeKind(kind: string): kind is StructureEdgeKind {
  return Object.prototype.hasOwnProperty.call(STRUCTURE_EDGE_KINDS, kind)
}

// =============================================================================================
// Helpers

function ownedList(el: Elem, field = 'ownedElements'): Elem[] {
  const list = el[field]
  return Array.isArray(list) ? (list as Elem[]) : []
}

function nest<T extends Elem>(parent: Elem, child: T, field = 'ownedElements'): T {
  child._parent = parent
  ownedList(parent, field).push(child)
  return child
}

const FRAME_FONT = { face: 'Arial', size: 13, style: 1 }

/** Frame of a communication / interaction overview diagram: (8,8) 700 × 600, `model` = the diagram. */
function addFrame(diagram: Diagram): void {
  const frame = createElement<NodeView>('UMLFrameView', { model: diagram, left: 8, top: 8, width: 700, height: 600 })
  addEmbeddedLabel(frame, 'nameLabel', { left: 8, top: 8 })
  addEmbeddedLabel(frame, 'frameTypeLabel', { left: 8, top: 8, font: FRAME_FONT })
  frame._parent = diagram
  diagram.ownedViews.push(frame)
}

/** The classifier that hosts ports/parts for `view` (a classifier view or a part view typed by a classifier). */
export function structureHostOf(view: View | null | undefined): Elem | null {
  const model = view?.model
  if (!model) return null
  if (isKindOf(model, 'UMLClassifier')) return model
  if (isKindOf(model, 'UMLAttribute')) {
    const type = model['type']
    return type && typeof type === 'object' && isKindOf(type as Elem, 'UMLClassifier') ? (type as Elem) : null
  }
  return null
}

// =============================================================================================
// Diagrams

/** Plans a diagram of a structural kind, creating the wrapping elements it needs (specs 23, 25, 26, 28, 30). */
export function planStructureDiagram(kind: StructureDiagramKind, owner: Elem, name?: string): DiagramPlan {
  const type = STRUCTURE_DIAGRAM_TYPES[kind]
  const diagram = createElement<Diagram>(type)
  let top: Elem = diagram
  let parent: Elem = owner

  switch (kind) {
    case 'ObjectDiagram':
    case 'InformationFlowDiagram':
      if (isKindOf(owner, 'Project')) {
        top = createElement('UMLModel', { name: defaultName('UMLModel', ownedList(owner)) })
        parent = top
      }
      break
    case 'CompositeStructureDiagram':
      if (!isKindOf(owner, 'UMLClassifier')) {
        top = createElement('UMLCollaboration', { name: defaultName('UMLCollaboration', ownedList(owner)) })
        parent = top
      }
      break
    case 'CommunicationDiagram':
      if (!isKindOf(owner, 'UMLInteraction')) {
        const interaction = createElement('UMLInteraction')
        if (isKindOf(owner, 'UMLCollaboration')) {
          interaction['name'] = defaultName('UMLInteraction', ownedList(owner))
          top = interaction
        } else {
          const collaboration = createElement('UMLCollaboration', { name: defaultName('UMLCollaboration', ownedList(owner)) })
          interaction['name'] = defaultName('UMLInteraction', [])
          nest(collaboration, interaction)
          top = collaboration
        }
        parent = interaction
      }
      break
    case 'InteractionOverviewDiagram':
      if (!isKindOf(owner, 'UMLActivity')) {
        const activity = createElement('UMLActivity')
        if (isKindOf(owner, 'UMLInteraction')) {
          activity['name'] = defaultName('UMLActivity', ownedList(owner))
          top = activity
        } else if (isKindOf(owner, 'UMLClassifier')) {
          const interaction = createElement('UMLInteraction', { name: defaultName('UMLInteraction', ownedList(owner)) })
          activity['name'] = defaultName('UMLActivity', [])
          nest(interaction, activity)
          top = interaction
        } else {
          const collaboration = createElement('UMLCollaboration', { name: defaultName('UMLCollaboration', ownedList(owner)) })
          const interaction = createElement('UMLInteraction', { name: defaultName('UMLInteraction', []) })
          nest(collaboration, interaction)
          activity['name'] = defaultName('UMLActivity', [])
          nest(interaction, activity)
          top = collaboration
        }
        parent = activity
      }
      break
  }

  diagram.name = name ?? defaultName(type, parent === owner ? ownedList(owner) : [])
  if (top !== diagram) nest(parent, diagram)
  if (kind === 'CommunicationDiagram' || kind === 'InteractionOverviewDiagram') addFrame(diagram)

  return { diagram, model: top, view: null, insertions: [{ owner, field: 'ownedElements', element: top }], refAdditions: [] }
}

// =============================================================================================
// Nodes

/** Plans a node of a structural kind, or returns null when `req.kind` is not one of them. */
export function planStructureNode(req: NodeRequest): CreationPlan | null {
  if (!isStructureNodeKind(req.kind)) return null
  const kind = req.kind
  const spec = STRUCTURE_NODE_KINDS[kind]
  const width = Math.round(req.width ?? spec.size[0])
  const height = Math.round(req.height ?? spec.size[1])
  const insertions: Insertion[] = []
  const refAdditions: RefAddition[] = []
  const diagramOwner = req.diagram._parent
  if (!diagramOwner) throw new Error('Diagram has no owner')
  const named = (owner: Elem, field: string, type: string): string => req.name ?? defaultName(type, ownedList(owner, field))
  const finish = (model: Elem | null, view: View): CreationPlan => {
    if (req.container) {
      view.containerView = req.container
      refAdditions.push({ owner: req.container, field: 'containedViews', target: view })
    }
    insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
    return { model, view, insertions, refAdditions }
  }

  switch (kind) {
    case 'Object':
    case 'ArtifactInstance':
    case 'ComponentInstance':
    case 'NodeInstance':
    case 'Collaboration':
    case 'CollaborationUse':
    case 'InformationItem': {
      const owner = req.owner ?? diagramOwner
      const model = createElement(spec.modelType as string, { name: named(owner, 'ownedElements', spec.modelType as string), ...spec.modelInit })
      insertions.push({ owner, field: 'ownedElements', element: model })
      const bounds: Bounds = { left: Math.round(req.left), top: Math.round(req.top), width, height }
      let view: View
      if (kind === 'InformationItem') {
        view = buildClassifierView(spec.viewType, model, bounds)
      } else {
        view = buildGeneralNodeView(spec.viewType, model, bounds)
        if (kind === 'Object') addListCompartment(view as NodeView, 'UMLSlotCompartmentView', 'slotCompartment', model)
        if (kind === 'Collaboration') addListCompartment(view as NodeView, 'UMLTemplateParameterCompartmentView', 'templateParameterCompartment', model, false)
        if (kind === 'ArtifactInstance') view['stereotypeDisplay'] = 'icon'
      }
      return finish(model, view)
    }

    case 'Port':
    case 'Part': {
      const host = req.owner ?? structureHostOf(req.container) ?? (kind === 'Part' && isKindOf(diagramOwner, 'UMLClassifier') ? diagramOwner : null)
      if (!host) {
        throw new Error(
          req.container && isKindOf(req.container.model, 'UMLAttribute')
            ? 'Type should be assigned to have Ports'
            : kind === 'Port'
              ? 'A port must be placed on a classifier or a typed part'
              : 'A part must be placed on a classifier or a typed part'
        )
      }
      const model = createElement(spec.modelType as string, {
        name: req.name ?? nextName(ownedList(host, 'attributes'), kind),
        ...spec.modelInit
      })
      insertions.push({ owner: host, field: 'attributes', element: model })
      let view: View
      if (kind === 'Port') {
        const cx = req.left + (req.width ?? 0) / 2
        const cy = req.top + (req.height ?? 0) / 2
        view = createElement<NodeView>('UMLPortView', {
          model,
          left: Math.round(cx - PORT_SIZE / 2),
          top: Math.round(cy - PORT_SIZE / 2),
          width: PORT_SIZE,
          height: PORT_SIZE
        })
        addFloatingLabels(view as NodeView, model)
      } else {
        view = buildGeneralNodeView(spec.viewType, model, { left: Math.round(req.left), top: Math.round(req.top), width, height }, { containerChangeable: false })
      }
      return finish(model, view)
    }

    case 'CommLifeline': {
      const interaction = diagramOwner
      const model = createElement('UMLLifeline', { name: req.name ?? defaultName('UMLLifeline', ownedList(interaction, 'participants')) })
      insertions.push({ owner: interaction, field: 'participants', element: model })
      const classifier = interaction._parent
      if (isKindOf(classifier, 'UMLClassifier')) {
        const role = createElement('UMLAttribute', { name: nextName(ownedList(classifier, 'attributes'), 'Role') })
        model['represent'] = role
        insertions.push({ owner: classifier, field: 'attributes', element: role })
      }
      const view = buildGeneralNodeView(
        spec.viewType,
        model,
        { left: Math.round(req.left), top: Math.round(req.top), width: Math.max(COMM_LIFELINE_MIN.width, width), height: Math.max(COMM_LIFELINE_MIN.height, height) }
      )
      return finish(model, view)
    }

    case 'InteractionUseInOverview':
    case 'InteractionInOverview': {
      const activity = req.owner ?? diagramOwner
      if (!isKindOf(activity, 'UMLActivity')) throw new Error('Interaction overview nodes must be created in an activity')
      const owning = isKindOf(activity._parent, 'UMLInteraction') ? activity._parent : null
      // The referenced interaction lives next to the interaction that owns the activity.
      const home = owning?._parent ?? activity._parent
      if (!home) throw new Error('Activity has no owner')
      const action = createElement('UMLAction', { name: req.name ?? defaultName('UMLAction', ownedList(activity, 'nodes')), kind: 'callBehavior' })
      insertions.push({ owner: activity, field: 'nodes', element: action })
      const interaction = createElement('UMLInteraction', { name: defaultName('UMLInteraction', ownedList(home)) })
      insertions.push({ owner: home, field: 'ownedElements', element: interaction })
      const bounds: Bounds = { left: Math.round(req.left), top: Math.round(req.top), width, height }
      const view = createElement<NodeView>(spec.viewType, { model: action, containerChangeable: true, ...bounds })
      addEmbeddedLabel(view, 'nameLabel')
      addEmbeddedLabel(view, 'frameTypeLabel', { font: FRAME_FONT })
      if (kind === 'InteractionUseInOverview') {
        if (owning) {
          const use = createElement('UMLInteractionUse', {
            name: defaultName('UMLInteractionUse', ownedList(owning, 'fragments')),
            refersTo: interaction
          })
          insertions.push({ owner: owning, field: 'fragments', element: use })
          action['target'] = use
        } else {
          // No interaction owns the activity to hold the use: refer to the interaction directly.
          action['target'] = interaction
        }
      } else {
        const sd = createElement<Diagram>('UMLSequenceDiagram', { name: defaultName('UMLSequenceDiagram', []) })
        addFrame(sd)
        insertions.push({ owner: interaction, field: 'ownedElements', element: sd })
        action['target'] = sd
      }
      return finish(action, view)
    }
  }
}

// =============================================================================================
// Edges

function viewModelOf(view: View | null | undefined): Elem | null {
  return view?.model ?? null
}

/** The role attribute a communication lifeline view represents, or null. */
export function lifelineRole(view: View | null | undefined): Elem | null {
  if (!isKindOf(view, 'UMLCommLifelineView')) return null
  const role = view?.model?.['represent']
  return role && typeof role === 'object' ? (role as Elem) : null
}

/** Whether an edge of a structural `kind` may connect `tail` to `head`. */
export function canConnectStructure(kind: StructureEdgeKind, tail: View, head: View): boolean {
  const a = tail.model
  const b = head.model
  switch (kind) {
    case 'Link':
    case 'DirectedLink':
    case 'LinkObject':
      return isKindOf(a, 'UMLInstance') && isKindOf(b, 'UMLInstance')
    case 'LinkObjectLink': {
      const objectFirst = isKindOf(a, 'UMLObject') && isKindOf(head, 'EdgeView') && isKindOf(b, 'UMLLink')
      const linkFirst = isKindOf(b, 'UMLObject') && isKindOf(tail, 'EdgeView') && isKindOf(a, 'UMLLink')
      return objectFirst || linkFirst
    }
    case 'Connector': {
      if (isKindOf(tail, 'UMLCommLifelineView') || isKindOf(head, 'UMLCommLifelineView')) {
        return lifelineRole(tail) !== null && lifelineRole(head) !== null
      }
      return isKindOf(a, 'UMLFeature') && isKindOf(b, 'UMLFeature')
    }
    case 'CommForwardMessage':
    case 'CommReverseMessage':
      return isKindOf(tail, 'UMLCommLifelineView') && isKindOf(head, 'UMLCommLifelineView') && lifelineRole(tail) !== null && lifelineRole(head) !== null
    case 'RoleBinding':
      return isKindOf(a, 'UMLCollaborationUse') && isKindOf(b, 'UMLAttribute')
    case 'InformationFlow':
      return isKindOf(a, 'UMLModelElement') && isKindOf(b, 'UMLModelElement')
  }
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

function midpoint(points: readonly Point[]): Point {
  const n = points.length
  if (n === 0) return { x: 0, y: 0 }
  const m = Math.floor(n / 2)
  if (n % 2 === 0) {
    const p = points[m - 1] as Point
    const q = points[m] as Point
    return { x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) }
  }
  return points[m] as Point
}

/** The connector view of the diagram joining two communication lifeline views, if any. */
export function findConnectorView(diagram: Diagram, a: View, b: View): EdgeView | null {
  for (const v of diagram.ownedViews) {
    if (v._type !== 'UMLConnectorView') continue
    const e = v as EdgeView
    if ((e.tail === a && e.head === b) || (e.tail === b && e.head === a)) return e
  }
  return null
}

/** Plans the connector (model + view) between two parts/ports or two communication lifelines. */
function planConnector(req: EdgeRequest, points: Point[], insertions: Insertion[]): { model: Elem; view: EdgeView } {
  const comm = isKindOf(req.tail, 'UMLCommLifelineView')
  const source = comm ? (lifelineRole(req.tail) as Elem) : (req.tail.model as Elem)
  const target = comm ? (lifelineRole(req.head) as Elem) : (req.head.model as Elem)
  const diagramOwner = req.diagram._parent
  // Communication connectors belong to the tail role; others to the diagram's classifier.
  const owner = comm || !isKindOf(diagramOwner, 'UMLClassifier') ? source : (diagramOwner as Elem)
  const model = createElement('UMLConnector', req.name ? { name: req.name } : {})
  insertions.push({ owner, field: 'ownedElements', element: model })
  const end1 = createElement('UMLConnectorEnd', { _parent: model, reference: source })
  const end2 = createElement('UMLConnectorEnd', { _parent: model, reference: target })
  model['end1'] = end1
  model['end2'] = end2
  const view = buildUndirectedEdgeView('UMLConnectorView', { model, tail: req.tail, head: req.head, points }, end1, end2) as EdgeView
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
  return { model, view }
}

/** Plans an edge of a structural kind, or returns null when `req.kind` is not one of them. */
export function planStructureEdge(req: EdgeRequest): CreationPlan | null {
  if (!isStructureEdgeKind(req.kind)) return null
  const kind = req.kind
  const spec = STRUCTURE_EDGE_KINDS[kind]
  const points = req.points ? [...req.points] : defaultPoints(req.tail, req.head)
  const insertions: Insertion[] = []
  const source = req.tail.model as Elem
  const target = req.head.model as Elem

  switch (kind) {
    case 'Link':
    case 'DirectedLink':
    case 'LinkObject': {
      const { model, view } = planLink(req, spec, points, insertions)
      if (kind !== 'LinkObject') return { model, view, insertions, refAdditions: [] }
      // Link object: a new object 30 below the link's middle, joined to the link by a dashed connector.
      const diagramOwner = req.diagram._parent as Elem
      const mid = midpoint(points)
      const object = createElement('UMLObject', { name: nextName(ownedList(diagramOwner), 'LinkObject') })
      insertions.push({ owner: diagramOwner, field: 'ownedElements', element: object })
      const size = STRUCTURE_NODE_KINDS.Object.size
      const objectView = buildGeneralNodeView(
        'UMLObjectView',
        object,
        { left: Math.round(mid.x - size[0] / 2), top: Math.round(mid.y + 30), width: size[0], height: size[1] },
        {}
      )
      addListCompartment(objectView, 'UMLSlotCompartmentView', 'slotCompartment', object)
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: objectView })
      const loLink = createElement('UMLLinkObjectLink', { objectSide: object, linkSide: model })
      insertions.push({ owner: object, field: 'ownedElements', element: loLink })
      const loView = createElement<EdgeView>('UMLLinkObjectLinkView', {
        model: loLink,
        tail: objectView,
        head: view,
        points: [centerOf(objectView) ?? mid, mid]
      })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: loView })
      return { model: object, view: objectView, insertions, refAdditions: [] }
    }

    case 'LinkObjectLink': {
      const objectFirst = isKindOf(req.tail.model, 'UMLObject')
      const objectView = objectFirst ? req.tail : req.head
      const linkView = (objectFirst ? req.head : req.tail) as EdgeView
      const object = objectView.model as Elem
      const model = createElement('UMLLinkObjectLink', { objectSide: object, linkSide: linkView.model })
      insertions.push({ owner: object, field: 'ownedElements', element: model })
      const linkPoints = linkView.points ?? []
      const mid = linkPoints.length > 0 ? midpoint(linkPoints) : (centerOf(req.head) ?? { x: 0, y: 0 })
      const view = createElement<EdgeView>(spec.viewType, {
        model,
        tail: objectView,
        head: linkView,
        points: req.points ? [...req.points] : [centerOf(objectView) ?? mid, mid]
      })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
      return { model, view, insertions, refAdditions: [] }
    }

    case 'Connector': {
      const { model, view } = planConnector(req, points, insertions)
      return { model, view, insertions, refAdditions: [] }
    }

    case 'CommForwardMessage':
    case 'CommReverseMessage': {
      const interaction = req.diagram._parent as Elem
      let connectorView = findConnectorView(req.diagram, req.tail, req.head)
      let connector: Elem
      if (connectorView) connector = connectorView.model as Elem
      else {
        // The requested name belongs to the message, not to the connector it rides on.
        const { name: _name, ...connectorReq } = req
        const planned = planConnector(connectorReq, points, insertions)
        connector = planned.model
        connectorView = planned.view
      }
      const forward = kind === 'CommForwardMessage'
      const sort = req.messageSort ?? 'synchCall'
      const message = createElement('UMLMessage', {
        name: req.name ?? defaultName('UMLMessage', ownedList(interaction, 'messages')),
        messageSort: sort,
        source: viewModelOf(forward ? req.tail : req.head),
        target: viewModelOf(forward ? req.head : req.tail),
        connector
      })
      insertions.push({ owner: interaction, field: 'messages', element: message })
      const stacked = req.diagram.ownedViews.filter((v) => v._type === 'UMLCommMessageView' && (v as unknown as { hostEdge: unknown }).hostEdge === connectorView).length
      const line = connectorView.points.length > 0 ? connectorView.points : points
      const mid = midpoint(line)
      const view = createElement<NodeView>('UMLCommMessageView', {
        model: message,
        hostEdge: connectorView,
        edgePosition: 1,
        alpha: Math.PI / 2,
        distance: 10 + 30 * stacked,
        left: mid.x - 20,
        top: mid.y - 10,
        width: 40,
        height: 12
      })
      addFloatingLabels(view, message)
      // Labels sit relative to the arrow axis: name 10, stereotype 25 and property 10 beside it.
      const polarOf = { nameLabel: 10, stereotypeLabel: 25, propertyLabel: 10 } as const
      for (const field of ['nameLabel', 'stereotypeLabel', 'propertyLabel'] as const) {
        Object.assign(view[field] as View, { alpha: Math.PI / 2, distance: polarOf[field] })
      }
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
      return { model: message, view, insertions, refAdditions: [] }
    }

    case 'RoleBinding': {
      const model = createElement('UMLRoleBinding', req.name ? { name: req.name } : {})
      model['source'] = source
      model['target'] = target
      insertions.push({ owner: source, field: 'ownedElements', element: model })
      const view = buildGeneralEdgeView('UMLRoleBindingView', { model, tail: req.tail, head: req.head, points })
      const mid = points[points.length - 1] ?? { x: 0, y: 0 }
      view['roleNameLabel'] = addSubView(
        view,
        createElement('EdgeLabelView', {
          model,
          visible: false,
          parentStyle: false,
          left: mid.x,
          top: mid.y,
          height: 13,
          alpha: -Math.PI / 6,
          distance: 30,
          hostEdge: view,
          edgePosition: 0
        })
      )
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
      return { model, view, insertions, refAdditions: [] }
    }

    case 'InformationFlow': {
      const model = createElement('UMLInformationFlow', req.name ? { name: req.name } : {})
      model['source'] = source
      model['target'] = target
      insertions.push({ owner: source, field: 'ownedElements', element: model })
      const view = buildGeneralEdgeView(spec.viewType, { model, tail: req.tail, head: req.head, points })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
      return { model, view, insertions, refAdditions: [] }
    }
  }
}

function planLink(
  req: EdgeRequest,
  spec: StructureEdgeSpec,
  points: Point[],
  insertions: Insertion[]
): { model: Elem; view: EdgeView } {
  const source = req.tail.model as Elem
  const target = req.head.model as Elem
  const model = createElement('UMLLink', req.name ? { name: req.name } : {})
  // A link belongs to its tail instance.
  insertions.push({ owner: source, field: 'ownedElements', element: model })
  const end1 = createElement('UMLLinkEnd', { _parent: model, reference: source, ...spec.end1 })
  const end2 = createElement('UMLLinkEnd', { _parent: model, reference: target, ...spec.end2 })
  model['end1'] = end1
  model['end2'] = end2
  const view = buildUndirectedEdgeView('UMLLinkView', { model, tail: req.tail, head: req.head, points }, end1, end2) as EdgeView
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view })
  return { model, view }
}
