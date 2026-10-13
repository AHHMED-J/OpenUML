/**
 * State machine (statechart) factories: diagram creation (machine + region), the vertex node
 * kinds with their views (state with compartments and regions, pseudostates, final state,
 * connection point references) and transitions. Called from `factories.ts`.
 */
import { isKindOf } from './metamodel'
import type { CreationPlan, DiagramPlan, EdgeRequest, Insertion, NodeRequest } from './factories'
import type { Bounds, Diagram, Elem, NodeView, View } from './types'
import {
  addFloatingLabels,
  addListCompartment,
  addNameCompartment,
  addSubView,
  buildGeneralEdgeView,
  defaultEdgePoints,
  createElement,
  defaultName
} from './view-builders'

export type StateMachineNodeKind =
  | 'State'
  | 'CompositeState'
  | 'OrthogonalState'
  | 'SubmachineState'
  | 'InitialState'
  | 'Choice'
  | 'Join'
  | 'Fork'
  | 'Junction'
  | 'ShallowHistory'
  | 'DeepHistory'
  | 'EntryPoint'
  | 'ExitPoint'
  | 'Terminate'
  | 'FinalState'
  | 'ConnectionPointReference'

export type StateMachineEdgeKind = 'Transition'

/** Structural twin of the node kind spec in `factories.ts`. */
export interface BehaviorNodeSpec {
  readonly modelType?: string
  readonly modelInit?: Record<string, unknown>
  readonly viewType: string
  readonly field?: string
  readonly size: readonly [number, number]
  readonly behind?: boolean
}

const pseudo = (kind: string, size: readonly [number, number]): BehaviorNodeSpec => ({
  modelType: 'UMLPseudostate',
  modelInit: { name: '', kind },
  viewType: 'UMLPseudostateView',
  field: 'vertices',
  size
})

const state = (size: readonly [number, number]): BehaviorNodeSpec => ({
  modelType: 'UMLState',
  viewType: 'UMLStateView',
  field: 'vertices',
  size
})

export const STATEMACHINE_NODE_KINDS: Readonly<Record<StateMachineNodeKind, BehaviorNodeSpec>> = {
  State: state([100, 50]),
  CompositeState: state([220, 160]),
  OrthogonalState: state([220, 220]),
  SubmachineState: state([120, 70]),
  InitialState: pseudo('initial', [20, 20]),
  Choice: pseudo('choice', [23, 19]),
  Join: pseudo('join', [70, 6]),
  Fork: pseudo('fork', [70, 6]),
  Junction: pseudo('junction', [15, 15]),
  ShallowHistory: pseudo('shallowHistory', [26, 26]),
  DeepHistory: pseudo('deepHistory', [26, 26]),
  EntryPoint: pseudo('entryPoint', [15, 15]),
  ExitPoint: pseudo('exitPoint', [15, 15]),
  Terminate: pseudo('terminate', [26, 26]),
  FinalState: { modelType: 'UMLFinalState', modelInit: { name: '' }, viewType: 'UMLFinalStateView', field: 'vertices', size: [26, 26] },
  ConnectionPointReference: {
    modelType: 'UMLConnectionPointReference',
    modelInit: { name: '' },
    viewType: 'UMLConnectionPointReferenceView',
    field: 'connections',
    size: [14, 14]
  }
}

export const STATEMACHINE_EDGE_KINDS = {
  Transition: { modelType: 'UMLTransition', viewType: 'UMLTransitionView', ownedBy: { field: 'transitions' } }
} as const

export function isStateMachineNodeKind(kind: string): kind is StateMachineNodeKind {
  return Object.prototype.hasOwnProperty.call(STATEMACHINE_NODE_KINDS, kind)
}

function ownedElementsOf(el: Elem): Elem[] {
  const list = el['ownedElements']
  return Array.isArray(list) ? (list as Elem[]) : []
}

/** A new empty region owned by `owner` (a state machine or a state), detached. */
export function newRegion(owner: Elem): Elem {
  const region = createElement('UMLRegion', { _parent: owner })
  ;(owner['regions'] as Elem[]).push(region)
  return region
}

/** A new state machine with its single empty region, detached. */
export function newStateMachine(name: string): Elem {
  const machine = createElement('UMLStateMachine', { name })
  newRegion(machine)
  return machine
}

/**
 * Plans a statechart diagram: under a state machine it is added directly; otherwise a state
 * machine (with one empty region) is created under `owner` and the diagram goes inside it.
 */
export function planStatechartDiagram(owner: Elem, name?: string): DiagramPlan {
  const diagram = createElement<Diagram>('UMLStatechartDiagram')
  let top: Elem = diagram
  let parent: Elem = owner
  if (!isKindOf(owner, 'UMLStateMachine')) {
    top = newStateMachine(defaultName('UMLStateMachine', ownedElementsOf(owner)))
    parent = top
  }
  diagram.name = name ?? defaultName('UMLStatechartDiagram', parent === owner ? ownedElementsOf(owner) : [])
  if (top !== diagram) {
    diagram._parent = parent
    ownedElementsOf(parent).push(diagram)
  }
  return { diagram, model: top, view: null, insertions: [{ owner, field: 'ownedElements', element: top }], refAdditions: [] }
}

/** The state machine behind a diagram. */
function machineOf(diagram: Diagram): Elem | null {
  return isKindOf(diagram._parent, 'UMLStateMachine') ? diagram._parent : null
}

/** Owner for a new vertex (`regions[0]` of the machine) or connection point reference (the state of `container`). */
export function stateMachineNodeOwner(req: NodeRequest): Elem | null {
  if (req.kind === 'ConnectionPointReference') {
    const host = req.container?.model
    if (!isKindOf(host, 'UMLState') || isKindOf(host, 'UMLFinalState')) throw new Error('A connection point reference must be placed on a state')
    return host as Elem
  }
  const machine = machineOf(req.diagram)
  const region = (machine?.['regions'] as Elem[] | undefined)?.[0]
  if (!region) throw new Error('The state machine has no region')
  return region
}

const HEADER_HEIGHT = 25

function regionCountOf(kind: StateMachineNodeKind): number {
  return kind === 'CompositeState' ? 1 : kind === 'OrthogonalState' ? 2 : 0
}

/** Builds the state view: name compartment, internal activity / transition compartments and region views. */
function buildStateView(model: Elem, bounds: Bounds, regionCount: number): NodeView {
  const view = createElement<NodeView>('UMLStateView', { model, containerChangeable: true, ...bounds })
  addNameCompartment(view, model)
  addListCompartment(view, 'UMLInternalActivityCompartmentView', 'internalActivityCompartment', model, false)
  addListCompartment(view, 'UMLInternalTransitionCompartmentView', 'internalTransitionCompartment', model, false)
  const deco = addListCompartment(view, 'UMLDecompositionCompartmentView', 'decompositionCompartment', model, regionCount > 0)
  const each = regionCount > 0 ? Math.round((bounds.height - HEADER_HEIGHT) / regionCount) : 0
  for (let i = 0; i < regionCount; i++) {
    const region = newRegion(model)
    addSubView(
      deco,
      createElement<NodeView>('UMLRegionView', {
        model: region,
        left: bounds.left,
        top: bounds.top + HEADER_HEIGHT + i * each,
        width: bounds.width,
        height: each
      })
    )
  }
  if (regionCount > 0) {
    deco.top = bounds.top + HEADER_HEIGHT
    deco.height = bounds.height - HEADER_HEIGHT
  }
  return view
}

/** Builds the view (and extra model elements such as a submachine) of a state machine node kind. */
export function buildStateMachineNodeView(req: NodeRequest, model: Elem, bounds: Bounds, insertions: Insertion[]): View {
  const kind = req.kind as StateMachineNodeKind
  switch (kind) {
    case 'State':
    case 'CompositeState':
    case 'OrthogonalState':
      return buildStateView(model, bounds, regionCountOf(kind))
    case 'SubmachineState': {
      const machine = machineOf(req.diagram)
      const home = machine?._parent
      if (machine && home) {
        const siblings = ownedElementsOf(home)
        const sub = newStateMachine(defaultName('UMLStateMachine', siblings))
        model['submachine'] = sub
        insertions.push({ owner: home, field: 'ownedElements', element: sub })
      }
      return buildStateView(model, bounds, 0)
    }
    case 'FinalState':
      return createElement<NodeView>('UMLFinalStateView', { model, containerChangeable: true, ...bounds })
    case 'ConnectionPointReference': {
      const view = createElement<NodeView>('UMLConnectionPointReferenceView', { model, ...bounds })
      addFloatingLabels(view, model)
      return view
    }
    default: {
      const view = createElement<NodeView>('UMLPseudostateView', { model, containerChangeable: true, ...bounds })
      addFloatingLabels(view, model)
      // Pseudostate labels are never shown.
      const label = view['nameLabel'] as View | undefined
      if (label) label.visible = false
      return view
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Transitions

/** Regions enclosing `vertex`, innermost first. */
function enclosingRegions(vertex: Elem | null | undefined): Elem[] {
  const out: Elem[] = []
  for (let e = vertex?._parent ?? null; e; e = e._parent) if (isKindOf(e, 'UMLRegion')) out.push(e)
  return out
}

/** The lowest region containing both vertices (the owner of a new transition between them). */
function lowestCommonRegion(a: Elem | null | undefined, b: Elem | null | undefined): Elem | null {
  const chainB = enclosingRegions(b)
  for (const r of enclosingRegions(a)) if (chainB.includes(r)) return r
  return null
}

/**
 * Transitions join vertices, except that a final state or terminate pseudostate has no outgoing
 * transitions and an initial pseudostate has no incoming ones (UML 2.5 §14.5.4, §14.5.6).
 */
export function canConnectStateMachine(tail: View, head: View): boolean {
  const source = tail.model
  const target = head.model
  if (!source || !target || !isKindOf(source, 'UMLVertex') || !isKindOf(target, 'UMLVertex')) return false
  if (isKindOf(source, 'UMLFinalState') || (isKindOf(source, 'UMLPseudostate') && source['kind'] === 'terminate')) return false
  return !(isKindOf(target, 'UMLPseudostate') && target['kind'] === 'initial')
}

/** Plans a transition owned by the lowest region containing both ends. */
export function planTransition(req: EdgeRequest): CreationPlan {
  const source = req.tail.model as Elem
  const target = req.head.model as Elem
  const machine = machineOf(req.diagram)
  const region = lowestCommonRegion(source, target) ?? (machine?.['regions'] as Elem[] | undefined)?.[0]
  if (!region) throw new Error('The state machine has no region')
  const model = createElement('UMLTransition', { ...(req.name ? { name: req.name } : {}), source, target })
  const points = req.points ? [...req.points] : defaultEdgePoints(req.tail, req.head)
  const view = buildGeneralEdgeView('UMLTransitionView', { model, tail: req.tail, head: req.head, points })
  return {
    model,
    view,
    insertions: [
      { owner: region, field: 'transitions', element: model },
      { owner: req.diagram, field: 'ownedViews', element: view }
    ],
    refAdditions: []
  }
}
