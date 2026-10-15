/**
 * Role Activity Diagram factories: diagram creation (process + diagram), the node kinds (roles,
 * activities, interactions, refinements with their branches, markers, waits, role starts) with their
 * views, state lines (with the loop-back flag), interaction links and the optional auto-thread.
 * Called from `factories.ts`. Node kinds other than `RADRole` always live in a role.
 */
import { isKindOf } from './metamodel'
import { ModelRuleError } from './errors'
import type { CreationPlan, DiagramPlan, EdgeRequest, Insertion, NodeRequest, RefAddition } from './factories'
import type { Bounds, Diagram, Elem, NodeView, Point, View } from './types'
import {
  addEmbeddedLabel,
  addFloatingLabels,
  boundsOf,
  buildGeneralEdgeView,
  centerOf,
  createElement,
  defaultName,
  nextName
} from './view-builders'
import { listField, ownedElementsOf } from './fields'

export type RadNodeKind =
  | 'RADRole'
  | 'RADActivity'
  | 'RADInteraction'
  | 'RADUndefinedProcess'
  | 'RADStateMarker'
  | 'RADStartMarker'
  | 'RADEndMarker'
  | 'RADWait'
  | 'RADRoleStart'
  | 'RADExternalRoleStart'
  | 'RADCaseRefinement'
  | 'RADPartRefinement'
  | 'RADCaseBranch'
  | 'RADPartBranch'

export type RadEdgeKind = 'RADStateLine' | 'RADInteractionLink'

/** Structural twin of the node kind spec in `factories.ts`. */
export interface RadNodeSpec {
  readonly modelType: string
  readonly modelInit?: Record<string, unknown>
  readonly viewType: string
  readonly field: string
  readonly size: readonly [number, number]
  readonly behind?: boolean
}

/** Default sizes of the RAD symbols (diagram units). */
export const RAD_SIZES = {
  role: [220, 360],
  square: [24, 24],
  circle: [24, 24],
  triangle: [26, 24],
  ellipse: [44, 26],
  marker: [30, 18],
  pentagon: [26, 26]
} as const

/** Horizontal distance between the circles / triangles of a refinement. */
export const RAD_BRANCH_PITCH = 120

const el = (modelType: string, viewType: string, size: readonly [number, number], modelInit?: Record<string, unknown>): RadNodeSpec => ({
  modelType,
  viewType,
  field: 'elements',
  size,
  ...(modelInit ? { modelInit } : {})
})

export const RAD_NODE_KINDS: Readonly<Record<RadNodeKind, RadNodeSpec>> = {
  RADRole: { modelType: 'RADRole', viewType: 'RADRoleView', field: 'roles', size: RAD_SIZES.role, behind: true },
  RADActivity: el('RADActivity', 'RADActivityView', RAD_SIZES.square),
  RADInteraction: el('RADInteraction', 'RADActivityView', RAD_SIZES.square),
  RADUndefinedProcess: el('RADUndefinedProcess', 'RADUndefinedProcessView', RAD_SIZES.ellipse),
  RADStateMarker: el('RADStateMarker', 'RADStateMarkerView', RAD_SIZES.marker, { name: '', kind: 'state' }),
  RADStartMarker: el('RADStateMarker', 'RADStateMarkerView', RAD_SIZES.marker, { name: 'Start', kind: 'start' }),
  RADEndMarker: el('RADStateMarker', 'RADStateMarkerView', RAD_SIZES.marker, { name: 'End', kind: 'end' }),
  RADWait: el('RADWait', 'RADWaitView', RAD_SIZES.circle),
  RADRoleStart: el('RADRoleStart', 'RADRoleStartView', RAD_SIZES.pentagon, { name: '' }),
  RADExternalRoleStart: el('RADRoleStart', 'RADRoleStartView', RAD_SIZES.pentagon, { name: '', externalRole: 'External role' }),
  RADCaseRefinement: el('RADCaseRefinement', 'RADRefinementView', RAD_SIZES.circle),
  RADPartRefinement: el('RADPartRefinement', 'RADRefinementView', RAD_SIZES.circle),
  RADCaseBranch: el('RADCaseBranch', 'RADBranchView', RAD_SIZES.circle),
  RADPartBranch: el('RADPartBranch', 'RADBranchView', RAD_SIZES.triangle)
}

export const RAD_EDGE_KINDS = {
  RADStateLine: { modelType: 'RADStateLine', viewType: 'RADStateLineView', ownedBy: { field: 'stateLines' } },
  RADInteractionLink: { modelType: 'RADInteractionLink', viewType: 'RADInteractionLinkView', ownedBy: { field: 'interactions' } }
} as const

export function isRadNodeKind(kind: string): kind is RadNodeKind {
  return Object.prototype.hasOwnProperty.call(RAD_NODE_KINDS, kind)
}

export function isRadEdgeKind(kind: string): kind is RadEdgeKind {
  return Object.prototype.hasOwnProperty.call(RAD_EDGE_KINDS, kind)
}

const BASE_NAMES: Readonly<Partial<Record<RadNodeKind, string>>> = {
  RADRole: 'Role',
  RADActivity: 'Activity',
  RADInteraction: 'Interaction',
  RADUndefinedProcess: 'Process',
  RADWait: 'Event',
  RADCaseRefinement: 'Question',
  RADPartRefinement: 'Split',
  RADCaseBranch: 'Alternative',
  RADPartBranch: 'Path'
}

// ---------------------------------------------------------------------------------------------
// Options

let autoThread = true

/** Preference `rad.autoThread`: new elements below an open-ended element get a state line from it. */
export function setRadAutoThread(on: boolean): void {
  autoThread = on
}

export function radAutoThread(): boolean {
  return autoThread
}

// ---------------------------------------------------------------------------------------------
// Diagram

/**
 * Plans a RAD diagram: inside a `RADProcess` it is added directly; otherwise a process
 * (`RADProcess<n>`, no roles yet) is created under `owner` and the diagram goes inside it.
 */
export function planRadDiagram(owner: Elem, name?: string): DiagramPlan {
  const diagram = createElement<Diagram>('RADDiagram')
  let top: Elem = diagram
  let parent: Elem = owner
  if (!isKindOf(owner, 'RADProcess')) {
    top = createElement('RADProcess', { name: defaultName('RADProcess', ownedElementsOf(owner)) })
    parent = top
  }
  diagram.name = name ?? defaultName('RADDiagram', parent === owner ? ownedElementsOf(owner) : [])
  if (top !== diagram) {
    diagram._parent = parent
    ownedElementsOf(parent).push(diagram)
  }
  return { diagram, model: top, view: null, insertions: [{ owner, field: 'ownedElements', element: top }], refAdditions: [] }
}

/** The process behind a diagram. */
export function radProcessOf(diagram: Diagram): Elem | null {
  return isKindOf(diagram._parent, 'RADProcess') ? diagram._parent : null
}

// ---------------------------------------------------------------------------------------------
// Nodes

/** Owner of a new RAD node: the process for a role, else the role the node is placed in. */
export function radNodeOwner(req: NodeRequest): Elem {
  if (req.kind === 'RADRole') {
    const process = radProcessOf(req.diagram)
    if (!process) throw new Error('The diagram has no RAD process')
    return process
  }
  const host = req.owner ?? req.container?.model
  if (!isKindOf(host, 'RADRole')) throw new ModelRuleError('Place this element inside a role')
  return host as Elem
}

function isCaseBranchKind(kind: RadNodeKind): boolean {
  return kind === 'RADCaseBranch'
}

/** The refinement view on the same row (within 6 units) left of a branch dropped at `bounds`. */
function refinementForBranch(kind: RadNodeKind, container: View | undefined, bounds: Bounds): View | null {
  const wanted = isCaseBranchKind(kind) ? 'RADCaseRefinement' : 'RADPartRefinement'
  const cy = bounds.top + bounds.height / 2
  let best: View | null = null
  let bestDx = Infinity
  for (const v of container?.containedViews ?? []) {
    if (!isKindOf(v.model, wanted)) continue
    const c = centerOf(v)
    if (!c || Math.abs(c.y - cy) > 6) continue
    const dx = bounds.left + bounds.width / 2 - c.x
    if (dx > 0 && dx < bestDx) {
      best = v
      bestDx = dx
    }
  }
  return best
}

function nodeViewOf(spec: RadNodeSpec, model: Elem, bounds: Bounds, container: View | undefined): NodeView {
  const view = createElement<NodeView>(spec.viewType, { model, containerChangeable: true, showShadow: false, ...bounds })
  if (spec.viewType === 'RADRoleView') {
    view.fillColor = '#c0c0c0'
    addEmbeddedLabel(view, 'nameLabel', { visible: false })
    return view
  }
  addFloatingLabels(view, model)
  if (container) view.containerView = container
  return view
}

/** Elements reachable from `from` by following the state lines of its role (excluding `from` unless on a cycle). */
export function radReachableFrom(role: Elem, from: Elem): Set<Elem> {
  const lines = listField(role, 'stateLines')
  const seen = new Set<Elem>()
  const queue: Elem[] = [from]
  while (queue.length > 0) {
    const cur = queue.pop() as Elem
    for (const l of lines) {
      const next = l['target'] as Elem | null
      if (l['source'] === cur && next && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/** Whether a path of state lines leads from `from` to `to` inside `role` (always true for `from` itself). */
export function radReaches(role: Elem, from: Elem, to: Elem): boolean {
  return from === to || radReachableFrom(role, from).has(to)
}

function hasOutgoing(role: Elem, element: Elem): boolean {
  return ((role['stateLines'] as Elem[] | undefined) ?? []).some((l) => l['source'] === element)
}

/** The element view an auto-thread line would start from for a new element at `bounds`, or null. */
export function radAutoThreadSource(role: Elem, container: View | undefined, bounds: Bounds): View | null {
  const cx = bounds.left + bounds.width / 2
  let best: View | null = null
  let bestGap = Infinity
  for (const v of container?.containedViews ?? []) {
    const m = v.model
    if (!m || !isKindOf(m, 'RADElement') || m._parent !== role || isKindOf(m, 'RADRefinement')) continue
    if (isKindOf(m, 'RADStateMarker') && m['kind'] === 'end') continue
    const b = boundsOf(v)
    if (!b || Math.abs(b.left + b.width / 2 - cx) > 12) continue
    const gap = bounds.top - (b.top + b.height)
    if (gap < -4 || gap >= 200 || hasOutgoing(role, m)) continue
    if (gap < bestGap) {
      best = v
      bestGap = gap
    }
  }
  return best
}

function radCanStartThread(kind: RadNodeKind): boolean {
  return kind !== 'RADCaseBranch' && kind !== 'RADPartBranch' && kind !== 'RADStartMarker' && kind !== 'RADRole'
}

/** Plans a node of a RAD kind (`null` for kinds of other families). */
export function planRadNode(req: NodeRequest): CreationPlan | null {
  if (!isRadNodeKind(req.kind)) return null
  const kind = req.kind
  const spec = RAD_NODE_KINDS[kind]
  const bounds: Bounds = {
    left: Math.round(req.left),
    top: Math.round(req.top),
    width: Math.round(req.width ?? spec.size[0]),
    height: Math.round(req.height ?? spec.size[1])
  }
  const owner = radNodeOwner(req)
  const field = spec.field
  const siblings = (owner[field] as unknown[] | undefined) ?? []
  const base = BASE_NAMES[kind]
  const initialName = spec.modelInit && 'name' in spec.modelInit ? undefined : base ? nextName(siblings, base) : defaultName(spec.modelType, siblings)
  const container = kind === 'RADRole' ? undefined : req.container
  const model = createElement(spec.modelType, { ...(initialName !== undefined ? { name: initialName } : {}), ...spec.modelInit, ...(req.name !== undefined ? { name: req.name } : {}) })
  const insertions: Insertion[] = [{ owner, field, element: model }]
  const refAdditions: RefAddition[] = []

  let branchOwner: View | null = null
  if (kind === 'RADCaseBranch' || kind === 'RADPartBranch') {
    branchOwner = refinementForBranch(kind, container, bounds)
    if (branchOwner?.model) model['refinement'] = branchOwner.model
  }

  const view = nodeViewOf(spec, model, bounds, container)
  if (container) refAdditions.push({ owner: container, field: 'containedViews', target: view })
  insertions.push({ owner: req.diagram, field: 'ownedViews', element: view, ...(spec.behind ? { index: 0 } : {}) })

  if (kind === 'RADCaseRefinement' || kind === 'RADPartRefinement') {
    const caseKind = kind === 'RADCaseRefinement'
    const names = caseKind ? ['Yes', 'No'] : ['', '']
    names.forEach((name, i) => {
      const bspec = RAD_NODE_KINDS[caseKind ? 'RADCaseBranch' : 'RADPartBranch']
      const branch = createElement(bspec.modelType, { name, refinement: model })
      const bbounds: Bounds = {
        left: bounds.left + RAD_BRANCH_PITCH * (i + 1) + Math.round((bounds.width - bspec.size[0]) / 2),
        top: bounds.top + Math.round((bounds.height - bspec.size[1]) / 2),
        width: bspec.size[0],
        height: bspec.size[1]
      }
      const bview = nodeViewOf(bspec, branch, bbounds, container)
      insertions.push({ owner, field: 'elements', element: branch })
      if (container) refAdditions.push({ owner: container, field: 'containedViews', target: bview })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: bview })
    })
  } else if (autoThread && kind !== 'RADRole' && radCanStartThread(kind)) {
    const source = radAutoThreadSource(owner, container, bounds)
    if (source?.model) {
      const line = createElement('RADStateLine', { source: source.model, target: model })
      const edge = buildGeneralEdgeView('RADStateLineView', {
        model: line,
        tail: source,
        head: view,
        points: [centerOf(source) ?? { x: 0, y: 0 }, centerOf(view) ?? { x: 0, y: 0 }]
      })
      insertions.push({ owner, field: 'stateLines', element: line })
      insertions.push({ owner: req.diagram, field: 'ownedViews', element: edge })
    }
  }
  return { model, view, insertions, refAdditions }
}

// ---------------------------------------------------------------------------------------------
// Edges

function roleOfElement(m: Elem | null | undefined): Elem | null {
  return m && isKindOf(m, 'RADElement') && isKindOf(m._parent, 'RADRole') ? m._parent : null
}

/** Whether an edge of a RAD kind may connect `tail` to `head`. */
export function canConnectRad(kind: RadEdgeKind, tail: View, head: View): boolean {
  const a = tail.model
  const b = head.model
  if (!a || !b || a === b) return false
  if (kind === 'RADStateLine') {
    const role = roleOfElement(a)
    if (!role || roleOfElement(b) !== role) return false
    if (isKindOf(b, 'RADBranch')) return false
    if (isKindOf(a, 'RADStateMarker') && a['kind'] === 'end') return false
    if (isKindOf(b, 'RADStateMarker') && b['kind'] === 'start') return false
    return !((role['stateLines'] as Elem[] | undefined) ?? []).some((l) => l['source'] === a && l['target'] === b)
  }
  if (!isKindOf(a, 'RADInteraction') || !isKindOf(b, 'RADInteraction')) return false
  const ra = roleOfElement(a)
  const rb = roleOfElement(b)
  if (!ra || !rb || ra === rb) return false
  const process = ra._parent
  const links = (process?.['interactions'] as Elem[] | undefined) ?? []
  return !links.some((l) => (l['source'] === a && l['target'] === b) || (l['source'] === b && l['target'] === a))
}

/** Plans a state line in the role of its ends; sets `loopBack` when the target lies upstream. */
export function planRadStateLine(req: EdgeRequest): CreationPlan {
  const source = req.tail.model as Elem
  const target = req.head.model as Elem
  const role = roleOfElement(source) as Elem
  const sc = centerOf(req.tail)
  const tc = centerOf(req.head)
  const loopBack = radReaches(role, target, source) || (sc !== null && tc !== null && tc.y < sc.y)
  const model = createElement('RADStateLine', { source, target, loopBack })
  const points: Point[] = req.points ? [...req.points] : sc && tc ? [sc, tc] : []
  const view = buildGeneralEdgeView('RADStateLineView', { model, tail: req.tail, head: req.head, points })
  return {
    model,
    view,
    insertions: [
      { owner: role, field: 'stateLines', element: model },
      { owner: req.diagram, field: 'ownedViews', element: view }
    ],
    refAdditions: []
  }
}

/** Plans an interaction link owned by the process. */
export function planRadInteractionLink(req: EdgeRequest): CreationPlan {
  const source = req.tail.model as Elem
  const target = req.head.model as Elem
  const process = (roleOfElement(source)?._parent ?? radProcessOf(req.diagram)) as Elem
  const model = createElement('RADInteractionLink', { source, target })
  const sc = centerOf(req.tail)
  const tc = centerOf(req.head)
  const points: Point[] = req.points ? [...req.points] : sc && tc ? [sc, tc] : []
  const view = buildGeneralEdgeView('RADInteractionLinkView', { model, tail: req.tail, head: req.head, points })
  return {
    model,
    view,
    insertions: [
      { owner: process, field: 'interactions', element: model },
      { owner: req.diagram, field: 'ownedViews', element: view }
    ],
    refAdditions: []
  }
}

/** Plans an edge of a RAD kind (`null` for kinds of other families). */
export function planRadEdge(req: EdgeRequest): CreationPlan | null {
  if (!isRadEdgeKind(req.kind)) return null
  return req.kind === 'RADStateLine' ? planRadStateLine(req) : planRadInteractionLink(req)
}
