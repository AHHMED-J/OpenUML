/**
 * Model changes made by the diagram editor. Every function is one user gesture = one undoable
 * operation (via `commands/`), and writes the measured geometry back (node sizes grown to their
 * minimum, re-routed edge points) in the same operation so saved files match the drawing.
 */
import {
  createEdge,
  createNode,
  deleteFromView,
  moveViews,
  setViewBounds,
  type ModelEngine,
  type OperationBuilder
} from '../../commands'
import {
  canConnect,
  childrenOf,
  DEFAULT_FONT,
  fieldOf,
  fontWith,
  findContainment,
  isKindOf,
  NODE_KINDS,
  type Diagram,
  type EdgeKind,
  type EdgeView,
  type Elem,
  type Font,
  type NodeKind,
  type NodeView,
  type Point,
  type View
} from '../../model'
import {
  LineStyle,
  distancePointToPolyline,
  edgeLabelParamsFromBox,
  routeEdge,
  simplifyOblique,
  type EdgePosition,
  type Rect,
  type TextMeasurer
} from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout, NodeLayout } from '../layout/types'
import { edgeNotationFor, nodeNotationFor, type ContainerBehavior } from '../render/registry'
import { connectionRefusal, placementRefusal, readableName, reconnectRefusal, refusalReason, withArticle, type RefusalHandler } from './feedback'

export interface DiagramEnv {
  readonly engine: ModelEngine
  readonly diagram: Diagram
  readonly measurer: TextMeasurer
  /**
   * Font size of the views the editor creates where they would take the default font
   * (`DEFAULT_FONT.size`); unset = the default. Views with another size keep it.
   */
  readonly defaultFontSize?: number
}

/** A palette tool: a `NODE_KINDS` / `EDGE_KINDS` key plus optional message presets. */
export interface ToolSpec {
  readonly kind: string
  readonly messageSort?: string
  readonly selfConnection?: boolean
  readonly freeEnd?: 'tail' | 'head'
}

/**
 * Per-diagram-type extension points of the editor. A notation family registers them for its
 * diagram type with `registerDiagramHooks`; every hook is optional and the default behavior applies
 * where a hook is missing (or, for `createEdge`/`reconnect`, returns `undefined`).
 */
export interface DiagramHooks {
  /** Runs inside every geometry operation of the diagram before the geometry write-back (e.g. auto-numbering). */
  normalize?(b: OperationBuilder, diagram: Diagram): void
  /** Handles the delete gesture; returns the views it left to the default deletion. */
  deleteViews?(env: DiagramEnv, views: readonly View[]): View[]
  /** Reconnects an edge end (`at`: where it was released); `undefined` = use the default. */
  reconnect?(env: DiagramEnv, edge: EdgeView, end: 'tail' | 'head', view: View, at: Point | undefined): boolean | undefined
  /** Creates an edge from a line gesture whose ends may be null (empty canvas); `undefined` = use the default. */
  createEdge?(env: DiagramEnv, layout: DiagramLayout, tool: ToolSpec, tailId: string | null, headId: string | null, press: Point, release: Point): string | null | undefined
  /** The view a line gesture picks at `p` as an end (nodes by default); null = none. */
  pickEnd?(layout: DiagramLayout, p: Point, tool: ToolSpec): string | null
  /** Whether the line tool may start on empty canvas. */
  freeEnds?(tool: ToolSpec): boolean
  /**
   * A segment of a selected edge the Select tool drags as a whole across its direction (e.g. the
   * runs of IDEF0 routes): `null` = the segment cannot be dragged, `undefined` = default bend editing.
   */
  segmentDrag?(env: DiagramEnv, layout: DiagramLayout, edgeId: string, index: number): SegmentDrag | null | undefined
  /** Dragging an edge end shows the reconnected edge live (the reconnect hook runs as a dry run). */
  liveReconnect?: boolean
  /** The view a dragged edge end is dropped on at `p` (default: the node under `p`). */
  pickReconnect?(layout: DiagramLayout, p: Point): string | null
  /**
   * Views that move along with `views` (e.g. the circle and branches of a RAD refinement), unless
   * the move asks to move the views alone (Option/Alt while dragging).
   */
  moveGroup?(env: DiagramEnv, views: readonly View[]): View[]
}

/** A segment dragged as a whole: `y` moves a horizontal segment, `x` a vertical one. */
export interface SegmentDrag {
  readonly axis: 'x' | 'y'
  /** Current coordinate of the segment. */
  readonly value: number
  /** Moves the segment to `value` (one undo step; the hook keeps it valid). */
  commit(value: number): void
}

const diagramHooks = new Map<string, DiagramHooks>()

/** Registers the editor hooks of a diagram type (e.g. `'IDEF0Diagram'`). */
export function registerDiagramHooks(diagramType: string, hooks: DiagramHooks): void {
  diagramHooks.set(diagramType, hooks)
}

export function hooksFor(diagram: Diagram): DiagramHooks | undefined {
  return diagramHooks.get(diagram._type)
}

export function isNodeKind(kind: string): kind is NodeKind {
  return Object.prototype.hasOwnProperty.call(NODE_KINDS, kind)
}

export function layoutOf(env: DiagramEnv): DiagramLayout {
  return computeDiagramLayout(env.diagram, env.engine.repository, env.measurer)
}

function samePoints(a: readonly Point[] | undefined, b: readonly Point[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y)
}

/** Writes measured node sizes and routed edge points of the whole diagram into the model. */
export function syncGeometry(env: DiagramEnv, b: OperationBuilder): void {
  const repo = env.engine.repository
  const layout = layoutOf(env)
  for (const [id, node] of layout.nodes) {
    const view = repo.get(id) as NodeView | undefined
    if (!view) continue
    if (view.width !== node.box.width || view.height !== node.box.height) {
      b.setAll(view, { width: node.box.width, height: node.box.height })
    }
    if (node.derivedPosition && (view.left !== node.box.left || view.top !== node.box.top)) {
      b.setAll(view, { left: node.box.left, top: node.box.top })
    }
  }
  for (const [id, edge] of layout.edges) {
    const view = repo.get(id) as EdgeView | undefined
    if (!view) continue
    if (!samePoints(view.points, edge.points)) b.set(view, 'points', edge.points.map((p) => ({ x: p.x, y: p.y })))
    if (view.lineStyle !== edge.lineStyle) b.set(view, 'lineStyle', edge.lineStyle)
  }
}

/**
 * The layout the diagram would have after `change` (an editor action such as `moveSelection`),
 * without changing the model: the change runs as a dry run and is reverted. Null when it fails.
 * `previous` lets unchanged views keep their layout objects (memoized rendering).
 */
export function previewLayout(env: DiagramEnv, change: () => void, previous?: DiagramLayout | null): DiagramLayout | null {
  try {
    return env.engine.simulate(() => {
      change()
      return computeDiagramLayout(env.diagram, env.engine.repository, env.measurer, { previous: previous ?? null })
    })
  } catch {
    return null
  }
}

/**
 * Gives the views inserted by the steps from `from` on the editor's default font size, where
 * they took the default font.
 */
function applyDefaultFontSize(b: OperationBuilder, env: DiagramEnv, from: number): void {
  const size = env.defaultFontSize
  if (size === undefined || size === DEFAULT_FONT.size || !(size > 0)) return
  const repo = env.engine.repository
  const visit = (el: Elem): void => {
    const font = el['font'] as Font | undefined
    if (isKindOf(el, 'View') && font && font.size === DEFAULT_FONT.size && fieldOf(el, 'font')) b.set(el, 'font', fontWith(font, { size }))
    for (const child of childrenOf(el)) visit(child)
  }
  for (const step of b.steps.slice(from)) {
    if (step.op !== 'I') continue
    const el = repo.get(step.json['_id'] as string)
    if (el) visit(el)
  }
}

/**
 * Runs `change` and the geometry write-back as one operation. Views the change creates take the
 * editor's default font size (`env.defaultFontSize`).
 */
export function withGeometry<T>(env: DiagramEnv, name: string, change: (b: OperationBuilder) => T): T {
  return env.engine.transact(name, (b) => {
    const from = b.steps.length
    const result = change(b)
    applyDefaultFontSize(b, env, from)
    hooksFor(env.diagram)?.normalize?.(b, env.diagram)
    syncGeometry(env, b)
    return result
  })
}

function viewsById(env: DiagramEnv, ids: readonly string[]): View[] {
  const repo = env.engine.repository
  return ids.map((id) => repo.get(id)).filter((v): v is View => isKindOf(v, 'View'))
}

// ---------------------------------------------------------------------------------------------
// Containment

/** Views visually contained by `view`, recursively. */
function containedClosure(view: View, into: Set<View> = new Set()): Set<View> {
  for (const c of view.containedViews ?? []) {
    if (!into.has(c)) {
      into.add(c)
      containedClosure(c, into)
    }
  }
  return into
}

/**
 * The container view to drop `moving` node views into at `p`: the topmost container under `p`
 * that accepts all of them (excluding the moving views and what they contain), else null (the
 * diagram itself).
 */
export function findDropContainer(env: DiagramEnv, layout: DiagramLayout, p: Point, moving: readonly View[]): View | null {
  const repo = env.engine.repository
  const excluded = new Set<View>(moving)
  for (const v of moving) containedClosure(v, excluded)
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const node = layout.nodes.get(layout.order[i] as string)
    if (!node || !rectHas(node.box, p)) continue
    const view = repo.get(node.viewId) as View | undefined
    if (!view || excluded.has(view)) continue
    const nested = subContainerAt(env, node, p, (behavior, host) => moving.every((m) => behavior.accepts(host, m.model ?? null)))
    if (nested) return nested
    const behavior = nodeNotationFor(view).container
    if (behavior && moving.every((m) => behavior.accepts(view, m.model ?? null))) return view
  }
  return null
}

/**
 * The container under `p` that refuses `moving` when they were dropped entirely inside it
 * (`boxes`: where they were dropped), else null. The topmost view under `p` with a container
 * behavior (or a nested container of it) decides; views without one are looked through, as in
 * `findDropContainer`.
 */
export function refusedDropHost(env: DiagramEnv, layout: DiagramLayout, p: Point, moving: readonly View[], boxes: readonly Rect[]): View | null {
  const repo = env.engine.repository
  const excluded = new Set<View>(moving)
  for (const v of moving) containedClosure(v, excluded)
  // Views already in a container may stay there whatever it accepts now.
  const accepts = (behavior: ContainerBehavior, host: View): boolean =>
    moving.every((m) => m.containerView === host) || moving.every((m) => behavior.accepts(host, m.model ?? null))
  const inside = (box: Rect): boolean => boxes.length > 0 && boxes.every((b) => rectHas(box, { x: b.left, y: b.top }) && rectHas(box, { x: b.left + b.width, y: b.top + b.height }))
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const node = layout.nodes.get(layout.order[i] as string)
    if (!node || !rectHas(node.box, p)) continue
    const view = repo.get(node.viewId) as View | undefined
    if (!view || excluded.has(view)) continue
    for (const sub of [...(node.subContainers ?? [])].reverse()) {
      if (!rectHas(sub.box, p)) continue
      const host = repo.get(sub.viewId) as View | undefined
      const behavior = host ? nodeNotationFor(host).container : undefined
      if (host && behavior) return accepts(behavior, host) || !inside(sub.box) ? null : host
    }
    const behavior = nodeNotationFor(view).container
    if (behavior) return accepts(behavior, view) || !inside(node.box) ? null : view
  }
  return null
}

/** The nested container view (e.g. a state's region) of `node` under `p` that satisfies `accepts`. */
function subContainerAt(
  env: DiagramEnv,
  node: NodeLayout,
  p: Point,
  accepts: (behavior: ContainerBehavior, host: View) => boolean
): View | null {
  const subs = node.subContainers ?? []
  for (let j = subs.length - 1; j >= 0; j--) {
    const sub = subs[j]
    if (!sub || !rectHas(sub.box, p)) continue
    const host = env.engine.repository.get(sub.viewId) as View | undefined
    const behavior = host ? nodeNotationFor(host).container : undefined
    if (host && behavior && accepts(behavior, host)) return host
  }
  return null
}

/** How far outside an action's border a click still creates a pin on it. */
const PIN_BORDER_TOLERANCE = 12

function inflate(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, width: r.width + 2 * by, height: r.height + 2 * by }
}

function rectHas(r: Rect, p: Point): boolean {
  return p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height
}

/** Whether moving `nodes` into `container` (null = out to the diagram) changes their containment. */
export function isContainmentChange(nodes: readonly View[], container: View | null): boolean {
  if (nodes.length === 0) return false
  const current = nodes[0]?.containerView ?? null
  // Multi-selections re-contain only when all views share the same current container.
  if (!nodes.every((n) => (n.containerView ?? null) === current)) return false
  return current !== container
}

function moveModel(b: OperationBuilder, env: DiagramEnv, model: Elem, target: { owner: Elem; field: string }): void {
  const repo = env.engine.repository
  const c = findContainment(model)
  if (!c || c.index < 0 || c.field !== 'ownedElements') return
  if (c.owner === target.owner || target.owner === model || repo.isAncestor(model, target.owner)) return
  if (fieldOf(target.owner, target.field)?.kind !== 'objs') return
  b.move(model, target.owner, target.field)
}

function recontain(b: OperationBuilder, env: DiagramEnv, nodes: readonly View[], container: View | null): void {
  for (const v of nodes) {
    const old = v.containerView ?? null
    if (old === container) continue
    if (old) b.removeRef(old, 'containedViews', v)
    b.set(v, 'containerView', container)
    if (container) b.addRef(container, 'containedViews', v)
    const handler = container ?? old
    if (handler && nodeNotationFor(handler).container?.reparent?.({ builder: b, diagram: env.diagram, child: v, container, previous: old })) continue
    const model = v.model
    if (!model) continue
    if (container) {
      const target = nodeNotationFor(container).container?.ownerFor?.(container, model)
      if (target) moveModel(b, env, model, target)
    } else if (old?.model && model._parent === old.model && env.diagram._parent) {
      moveModel(b, env, model, { owner: env.diagram._parent, field: 'ownedElements' })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry gestures

/** Moves views (with their contained views and attached edges); optionally re-contains the nodes. */
/**
 * Moves views by `(dx, dy)`, optionally dropping them into `drop.container`. `current` is the
 * diagram's layout before the move when the caller has it (the editor does), which saves a
 * layout pass.
 */
export function moveSelection(
  env: DiagramEnv,
  ids: readonly string[],
  dx: number,
  dy: number,
  drop?: { container: View | null },
  current?: DiagramLayout,
  options: { readonly alone?: boolean } = {}
): void {
  // Locked views (a locked RAD role) never move.
  const selected = viewsById(env, ids).filter((v) => v['locked'] !== true)
  const group = options.alone ? [] : (hooksFor(env.diagram)?.moveGroup?.(env, selected) ?? [])
  const views = [...selected, ...group.filter((v) => !selected.includes(v))]
  if (views.length === 0) return
  const nodes = views.filter((v) => isKindOf(v, 'NodeView'))
  const recontaining = drop !== undefined && isContainmentChange(nodes, drop.container)
  // Axis-restricted views (sequence lifelines) constrain the whole group.
  if (nodes.length > 0 && (dx !== 0 || dy !== 0)) {
    const axis = moveAxisOf(current ?? layoutOf(env), nodes.map((v) => v._id))
    if (axis === 'horz') dy = 0
    else if (axis === 'vert') dx = 0
  }
  if (dx === 0 && dy === 0 && !recontaining) return
  withGeometry(env, 'Move', (b) => {
    // Views inside another moved view move with it.
    const moved = new Set<View>(views)
    const roots = views.filter((v) => {
      for (let c = v.containerView; c; c = c.containerView) {
        // A region is a sub-view of its state: the state moving takes its contents along.
        for (let a: Elem | null = c; a && isKindOf(a, 'View'); a = a._parent) if (moved.has(a)) return false
      }
      return true
    })
    moveViews(env.engine, roots, dx, dy)
    if (recontaining && drop) recontain(b, env, nodes, drop.container)
  })
}

/** The axis a group of nodes may move along: restricted when any of them is (horizontal wins). */
export function moveAxisOf(layout: DiagramLayout, ids: readonly string[]): 'horz' | 'vert' | null {
  const axes = new Set(ids.map((id) => layout.nodes.get(id)?.moveAxis))
  return axes.has('horz') ? 'horz' : axes.has('vert') ? 'vert' : null
}

/** Sets the height of a node's sub-view from a dragged divider (e.g. a combined-fragment operand). */
export function resizeSubView(env: DiagramEnv, viewId: string, height: number): void {
  const view = env.engine.repository.get(viewId)
  if (!isKindOf(view, 'NodeView') || view.height === Math.round(height)) return
  withGeometry(env, 'Resize', (b) => b.set(view, 'height', Math.round(height)))
}

/** Sets a node's bounds (handles enforce the minimum size before calling). */
export function resizeNode(env: DiagramEnv, id: string, rect: Rect): void {
  const view = env.engine.repository.get(id)
  if (!isKindOf(view, 'NodeView')) return
  withGeometry(env, 'Resize', () => setViewBounds(env.engine, view, rect))
}

/** Replaces the points of an edge (oblique edges are simplified); ends are re-attached. */
export function setEdgeVertices(env: DiagramEnv, id: string, points: readonly Point[]): void {
  const edge = env.engine.repository.get(id)
  if (!isKindOf(edge, 'EdgeView')) return
  const pts = edge.lineStyle === LineStyle.Rectilinear || edge.lineStyle === LineStyle.RoundedRectilinear ? [...points] : simplifyOblique(points)
  withGeometry(env, 'Change Edge', (b) => b.set(edge, 'points', pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))))
}

/**
 * Reconnects one end of an edge to another view; the relationship's source/target (or
 * association end) is updated too. Returns false when the connection is not allowed.
 */
export function reconnectEnd(env: DiagramEnv, edgeId: string, end: 'tail' | 'head', viewId: string, at?: Point, onRefused?: RefusalHandler): boolean {
  const repo = env.engine.repository
  const edge = repo.get(edgeId)
  const view = repo.get(viewId)
  if (!isKindOf(edge, 'EdgeView') || !isKindOf(view, 'View')) return false
  const unchanged = (end === 'tail' ? edge.tail : edge.head) === view
  const kind = edgeNotationFor(edge).connectKind
  if (!kind) {
    if (!unchanged) onRefused?.(reconnectRefusal(edge))
    return false
  }
  const tail = end === 'tail' ? view : edge.tail
  const head = end === 'head' ? view : edge.head
  if (!tail || !head) return false
  if (!canConnect(kind, tail, head)) {
    onRefused?.(connectionRefusal(kind, tail, head))
    return false
  }
  const hooked = hooksFor(env.diagram)?.reconnect?.(env, edge, end, view, at)
  if (hooked !== undefined) {
    if (!hooked && !unchanged) onRefused?.(connectionRefusal(kind, tail, head))
    return hooked
  }
  if (unchanged) return false
  withGeometry(env, 'Reconnect', (b) => {
    b.set(edge, end, view)
    const model = edge.model
    if (isKindOf(model, 'DirectedRelationship')) b.set(model, end === 'tail' ? 'source' : 'target', view.model)
    else if (isKindOf(model, 'UndirectedRelationship')) {
      const relEnd = end === 'tail' ? model.end1 : model.end2
      if (relEnd) b.set(relEnd, 'reference', view.model)
    }
  })
  return true
}

/** Stores a dragged edge label's new polar position. */
export function moveEdgeLabel(env: DiagramEnv, layout: DiagramLayout, edgeId: string, labelViewId: string, box: Rect): void {
  const label = env.engine.repository.get(labelViewId)
  const edge = layout.edges.get(edgeId)
  const points = edge?.labelPoints ?? edge?.points
  if (!isKindOf(label, 'EdgeParasiticView') || !points || points.length === 0) return
  const params = edgeLabelParamsFromBox(points, label.edgePosition as EdgePosition, box)
  env.engine.transact('Move Label', (b) =>
    b.setAll(label, {
      alpha: Math.round(params.alpha * 1e6) / 1e6,
      distance: Math.round(params.distance * 100) / 100,
      left: Math.round(box.left),
      top: Math.round(box.top)
    })
  )
}

/** Delete (views only). */
export function deleteViews(env: DiagramEnv, ids: readonly string[]): void {
  let views = viewsById(env, ids)
  const hook = hooksFor(env.diagram)?.deleteViews
  if (hook) views = hook(env, views)
  if (views.length > 0) deleteFromView(env.engine, views)
}

// ---------------------------------------------------------------------------------------------
// Creation

/** Container under `p` that accepts a new element of `kind` (null = the diagram). */
export function creationContainer(env: DiagramEnv, layout: DiagramLayout, kind: NodeKind, p: Point): View | null {
  const spec = NODE_KINDS[kind]
  const probe: Elem | null = spec.modelType ? { _type: spec.modelType, _id: '', _parent: null } : null
  const repo = env.engine.repository
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const node = layout.nodes.get(layout.order[i] as string)
    const pin = kind === 'InputPin' || kind === 'OutputPin' || kind === 'ConnectionPointReference'
    // Pins straddle the action's border, so clicks within a small tolerance outside it count too.
    if (!node || !rectHas(pin ? inflate(node.box, PIN_BORDER_TOLERANCE) : node.box, p)) continue
    const view = repo.get(node.viewId) as View | undefined
    if (!view) continue
    if (pin) {
      if (isKindOf(view.model, kind === 'ConnectionPointReference' ? 'UMLState' : 'UMLAction')) return view
      continue
    }
    const nested = subContainerAt(env, node, p, (b, host) => b.accepts(host, probe))
    if (nested) return nested
    const behavior = nodeNotationFor(view).container
    if (behavior?.accepts(view, probe)) return view
  }
  return null
}

/** The message or time segment under `p` that a new time constraint attaches to. */
function timeConstraintHost(env: DiagramEnv, layout: DiagramLayout, p: Point): View | null {
  const repo = env.engine.repository
  for (const edge of layout.edges.values()) {
    if ((edge.viewType === 'UMLTimingMessageView' || edge.viewType === 'UMLSeqMessageView') && distancePointToPolyline(p, edge.points) <= 6) {
      return (repo.get(edge.viewId) as View | undefined) ?? null
    }
  }
  for (let i = layout.order.length - 1; i >= 0; i--) {
    const node = layout.nodes.get(layout.order[i] as string)
    if (node && node.viewType === 'UMLTimeSegmentView' && rectHas(node.box, p)) return (repo.get(node.viewId) as View | undefined) ?? null
  }
  return null
}

/**
 * Creates a node of `kind` in `rect` (a zero-size rect = click: default size). Returns the new
 * view's ID, or null when the element cannot be placed there; `onRefused` then gets the reason
 * (live previews pass none and stay silent).
 */
export function createNodeAt(env: DiagramEnv, layout: DiagramLayout, kind: NodeKind, rect: Rect, options: { readonly onRefused?: RefusalHandler } = {}): string | null {
  const refuse = (reason: string): null => {
    options.onRefused?.(reason)
    return null
  }
  const click = rect.width < 4 && rect.height < 4
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const at = click ? { x: rect.left, y: rect.top } : center
  // A time constraint annotates a message or a time segment: that view is its host.
  const host = kind === 'TimeConstraint' ? timeConstraintHost(env, layout, at) : null
  if (kind === 'TimeConstraint' && !host) return refuse('A time constraint must be placed on a message or a time segment')
  const container = host ?? creationContainer(env, layout, kind, at)
  if ((kind === 'InputPin' || kind === 'OutputPin' || kind === 'ConnectionPointReference') && !container) {
    return refuse(kind === 'ConnectionPointReference' ? 'A connection point reference must be placed on a state' : 'A pin must be placed on an action')
  }
  const spec = NODE_KINDS[kind]
  const probe: Elem | null = spec.modelType ? { _type: spec.modelType, _id: '', _parent: null } : null
  // A state invariant constrains the lifeline it is dropped on, and is centered on its line.
  let covered: Elem | undefined
  let left = rect.left
  if (kind === 'StateInvariant') {
    const hit = [...layout.order].reverse().map((id) => layout.nodes.get(id)).find((n) => n && n.viewType === 'UMLSeqLifelineView' && rectHas(n.box, at))
    const model = hit ? (env.engine.repository.get(hit.viewId) as View | undefined)?.model : null
    if (hit && model) {
      covered = model
      left = (hit.data as { lineX: number }).lineX - (click ? NODE_KINDS.StateInvariant.size[0] : rect.width) / 2
    }
  }
  const ownerTarget = container && kind !== 'InputPin' && kind !== 'OutputPin' ? nodeNotationFor(container).container?.ownerFor?.(container, probe) : null
  try {
    const plan = withGeometry(env, `Create ${kind}`, () =>
      createNode(env.engine, {
        kind,
        diagram: env.diagram,
        left,
        top: rect.top,
        ...(click ? {} : { width: rect.width, height: rect.height }),
        ...(covered ? { covered } : {}),
        ...(container ? { container } : {}),
        ...(ownerTarget ? { owner: ownerTarget.owner } : {})
      })
    )
    return plan.view?._id ?? null
  } catch (err) {
    if (options.onRefused) options.onRefused(refusalReason(err, placementRefusal(kind, container)))
    return null
  }
}

/** The name of a line tool in messages: `Found Message`, `Lost Message`, or its kind. */
export function toolName(tool: ToolSpec): string {
  if (tool.freeEnd) return tool.freeEnd === 'tail' ? 'Found Message' : 'Lost Message'
  return tool.kind
}

/**
 * Creates an edge of `tool.kind` from `tailId` to `headId` (validated with `canConnect`). Returns
 * the new edge view's ID or null when the connection is invalid (`onRefused` gets the reason).
 */
export function createEdgeBetween(
  env: DiagramEnv,
  layout: DiagramLayout,
  tool: ToolSpec,
  tailId: string,
  headId: string,
  press: Point,
  onRefused?: RefusalHandler
): string | null {
  const repo = env.engine.repository
  const tail = repo.get(tailId) as View | undefined
  const head = repo.get(headId) as View | undefined
  const kind = tool.kind as EdgeKind
  if (!tail || !head) return null
  if (!canConnect(kind, tail, head)) {
    onRefused?.(connectionRefusal(toolName(tool), tail, head))
    return null
  }
  let points: Point[] | undefined
  // Messages route themselves (sequence: horizontal at the press y; timing: between the segments).
  if (kind !== 'Message' && kind !== 'TimingMessage') {
    const t = layout.nodes.get(tailId)
    const h = layout.nodes.get(headId)
    if (t && h) {
      const r = routeEdge({
        lineStyle: LineStyle.Oblique,
        points: [],
        tail: t.endpoint ?? { box: t.box, outline: t.outline },
        head: h.endpoint ?? { box: h.box, outline: h.outline },
        selfLoop: tail === head
      })
      points = r.points
    }
  }
  try {
    const plan = withGeometry(env, `Create ${kind}`, () =>
      createEdge(env.engine, {
        kind,
        diagram: env.diagram,
        tail,
        head,
        ...(points ? { points } : {}),
        ...(tool.messageSort ? { messageSort: tool.messageSort } : {}),
        ...(kind === 'Message' ? { y: Math.round(press.y) } : {})
      })
    )
    return plan.view?._id ?? null
  } catch (err) {
    const reason = refusalReason(err, `Couldn't create ${withArticle(readableName(kind))}`)
    onRefused?.(reason)
    return null
  }
}

/**
 * Found/lost message: creates a message endpoint at `free` and a message between it and the
 * lifeline `lifelineId` (the endpoint is the tail for a found message, the head for a lost one),
 * as one operation. Returns the message view's ID or null when `lifelineId` is not a lifeline.
 */
export function createEndpointMessage(
  env: DiagramEnv,
  layout: DiagramLayout,
  tool: ToolSpec,
  lifelineId: string,
  free: Point,
  y: number,
  onRefused?: RefusalHandler
): string | null {
  const lifeline = env.engine.repository.get(lifelineId) as View | undefined
  if (!tool.freeEnd) return null
  if (!lifeline || !isKindOf(lifeline, 'UMLSeqLifelineView')) {
    onRefused?.(tool.freeEnd === 'tail' ? 'A found message must end on a lifeline' : 'A lost message must start on a lifeline')
    return null
  }
  const size = NODE_KINDS.Endpoint.size
  try {
    const plan = withGeometry(env, tool.freeEnd === 'tail' ? 'Create Found Message' : 'Create Lost Message', () => {
      const end = createNode(env.engine, {
        kind: 'Endpoint',
        diagram: env.diagram,
        left: Math.round(free.x - size[0] / 2),
        top: Math.round(y - size[1] / 2)
      }).view as View
      return createEdge(env.engine, {
        kind: 'Message',
        diagram: env.diagram,
        tail: tool.freeEnd === 'tail' ? end : lifeline,
        head: tool.freeEnd === 'tail' ? lifeline : end,
        y: Math.round(y),
        ...(tool.messageSort ? { messageSort: tool.messageSort } : {})
      })
    })
    void layout
    return plan.view?._id ?? null
  } catch (err) {
    const reason = refusalReason(err, `Couldn't create ${withArticle(readableName(toolName(tool)))}`)
    onRefused?.(reason)
    return null
  }
}

/** Double-click on empty canvas: a free text annotation ("Text", 100 wide) at `p`. */
export function createTextAt(env: DiagramEnv, p: Point): string | null {
  const plan = withGeometry(env, 'Create Text', (b) => {
    const plan = createNode(env.engine, { kind: 'Text', diagram: env.diagram, left: p.x, top: p.y, width: 100, height: 25 })
    if (plan.view) b.set(plan.view, 'text', 'Text')
    return plan
  })
  return plan.view?._id ?? null
}
