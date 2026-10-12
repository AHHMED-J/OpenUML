/** High-level model edits. Each function is one user gesture = one undoable operation. */
import { ElementReader, parseFragment, remapIds } from '../format'
import {
  createItemView,
  fieldOf,
  isKindOf,
  ITEM_BINDINGS,
  planDiagram,
  planEdge,
  planFeature,
  planItemViews,
  planNode,
  typeDisplayName,
  walk,
  type Bounds,
  type CreationPlan,
  type DiagramKind,
  type DiagramPlan,
  type EdgeRequest,
  type Elem,
  type FeatureKind,
  type NodeRequest,
  type NodeView,
  type Point,
  type View
} from '../model'
import type { OperationBuilder } from './builder'
import type { ModelEngine } from './engine'
import { OperationError } from './operation'

/** Applies a factory plan inside a transaction. */
export function applyPlan(b: OperationBuilder, plan: CreationPlan): void {
  for (const ins of plan.insertions) b.insert(ins.owner, ins.field, ins.element, ins.index)
  for (const add of plan.refAdditions) b.addRef(add.owner, add.field, add.target)
  for (const m of plan.moves ?? []) b.move(m.element, m.owner, m.field)
  for (const set of plan.sets ?? []) b.set(set.owner, set.field, set.value)
}

function kindLabel(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2')
}

// ---------------------------------------------------------------------------------------------
// Creation

/** Creates a node (model element + view) on a diagram. Returns the applied plan (live elements). */
export function createNode(engine: ModelEngine, req: NodeRequest): CreationPlan {
  const plan = planNode(req)
  engine.transact(`Create ${kindLabel(req.kind)}`, (b) => applyPlan(b, plan))
  return plan
}

/** Creates a relationship (model element + edge view) between two views. */
export function createEdge(engine: ModelEngine, req: EdgeRequest): CreationPlan {
  const plan = planEdge(req)
  engine.transact(`Create ${kindLabel(req.kind)}`, (b) => applyPlan(b, plan))
  return plan
}

/** Creates a diagram (plus wrapping model/collaboration/interaction/activity as needed). */
export function createDiagram(engine: ModelEngine, kind: DiagramKind, owner: Elem, name?: string): DiagramPlan {
  const plan = planDiagram(kind, owner, name)
  engine.transact(`Create ${kindLabel(kind)}`, (b) => applyPlan(b, plan))
  return plan
}

/** Creates a plain model element (no view) in `owner[field]` (default `ownedElements`). */
export function createModelElement(
  engine: ModelEngine,
  owner: Elem,
  element: Elem,
  field = 'ownedElements'
): Elem {
  engine.transact(`Add ${typeDisplayName(element._type)}`, (b) => b.insert(owner, field, element))
  return element
}

/**
 * Adds a feature (attribute, operation, reception, parameter, literal, extension point, operand)
 * to `owner`, plus an item view in the matching compartment of every view of `owner`.
 */
export function addFeature(
  engine: ModelEngine,
  owner: Elem,
  kind: FeatureKind,
  props: Record<string, unknown> = {}
): Elem {
  const ins = planFeature(owner, kind, props)
  engine.transact(`Add ${kindLabel(kind)}`, (b) => {
    b.insert(ins.owner, ins.field, ins.element)
    for (const item of planItemViews(ins.element, ins.field, engine.repository.viewsOf(owner))) {
      b.insert(item.owner, item.field, item.element)
    }
  })
  return ins.element
}

export const addAttribute = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'Attribute', props)
export const addOperation = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'Operation', props)
export const addParameter = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'Parameter', props)
export const addEnumerationLiteral = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'EnumerationLiteral', props)
export const addExtensionPoint = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'ExtensionPoint', props)
export const addOperand = (engine: ModelEngine, owner: Elem, props?: Record<string, unknown>): Elem =>
  addFeature(engine, owner, 'Operand', props)

// ---------------------------------------------------------------------------------------------
// Properties

/** Sets one or more fields of an element in one operation. */
export function setFields(
  engine: ModelEngine,
  el: Elem,
  values: Readonly<Record<string, unknown>>,
  name = 'Change Properties'
): void {
  engine.transact(name, (b) => b.setAll(el, values))
}

/** Sets the same fields on several elements in one operation (e.g. format changes on a selection). */
export function setFieldsOfAll(
  engine: ModelEngine,
  elements: readonly Elem[],
  values: Readonly<Record<string, unknown>>,
  name = 'Change Properties'
): void {
  engine.transact(name, (b) => {
    for (const el of elements) b.setAll(el, values)
  })
}

export function rename(engine: ModelEngine, el: Elem, name: string): void {
  setFields(engine, el, { name }, 'Rename')
}

// ---------------------------------------------------------------------------------------------
// Structure

/** Moves a model element under a new owner (keeping the containment field when possible). */
export function moveElement(engine: ModelEngine, el: Elem, newOwner: Elem, field?: string, index?: number): void {
  const repo = engine.repository
  const c = repo.containmentOf(el)
  if (!c || c.index < 0) throw new OperationError(`Cannot move ${el._type}`)
  if (newOwner === el || repo.isAncestor(el, newOwner)) throw new OperationError('Cannot move an element into itself')
  const target = field ?? (fieldOf(newOwner, c.field)?.kind === 'objs' ? c.field : 'ownedElements')
  if (newOwner === c.owner && target === c.field) {
    if (index !== undefined) reorderElement(engine, el, index)
    return
  }
  engine.transact('Move', (b) => b.move(el, newOwner, target, index))
}

/** Moves an element to another position in its owner's list (e.g. attribute up/down, bring to front). */
export function reorderElement(engine: ModelEngine, el: Elem, index: number): void {
  const c = engine.repository.containmentOf(el)
  if (!c || c.index < 0) throw new OperationError(`Cannot reorder ${el._type}`)
  engine.transact('Reorder', (b) => b.reorder(c.owner, c.field, el, index))
}

// ---------------------------------------------------------------------------------------------
// Geometry

function shiftNode(b: OperationBuilder, view: View, dx: number, dy: number): void {
  for (const v of walk(view)) {
    if (isKindOf(v, 'NodeView')) b.setAll(v, { left: v.left + dx, top: v.top + dy })
    else if (isKindOf(v, 'EdgeView')) b.set(v, 'points', v.points.map((p) => ({ x: p.x + dx, y: p.y + dy })))
  }
}

/** Top-level view (directly in a diagram) that hosts `view`. */
function hostOf(view: View): View {
  let v: View = view
  while (isKindOf(v._parent, 'View')) v = v._parent
  return v
}

/**
 * Moves views by (dx, dy): node views with their sub-views and visually contained views; edges
 * whose both ends move (or that are selected) are translated too. Other attached edges keep
 * their points and are expected to be re-routed by the diagram layer.
 */
export function moveViews(engine: ModelEngine, views: readonly View[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  const moved = new Set<View>()
  const visit = (v: View): void => {
    if (moved.has(v)) return
    moved.add(v)
    for (const c of v.containedViews) visit(c)
    // Sub-views may contain views too (a state's region holds the vertices dropped into it).
    for (const s of v.subViews ?? []) if (isKindOf(s, 'View')) visitSub(s)
  }
  const visitSub = (v: View): void => {
    for (const c of v.containedViews ?? []) visit(c)
    for (const s of v.subViews ?? []) if (isKindOf(s, 'View')) visitSub(s)
  }
  views.forEach(visit)
  engine.transact('Move Views', (b) => {
    const edges = new Set<View>()
    for (const v of moved) {
      if (isKindOf(v, 'EdgeView')) edges.add(v)
      else shiftNode(b, v, dx, dy)
    }
    const diagrams = new Set([...moved].map((v) => engine.repository.diagramOf(v)))
    for (const d of diagrams) {
      for (const v of d?.ownedViews ?? []) {
        if (isKindOf(v, 'EdgeView') && v.tail && v.head && moved.has(hostOf(v.tail)) && moved.has(hostOf(v.head))) {
          edges.add(v)
        }
      }
    }
    for (const e of edges) shiftNode(b, e, dx, dy)
  })
}

/** Sets a node view's bounds; sub-views follow the move of its top-left corner. */
export function setViewBounds(engine: ModelEngine, view: NodeView, bounds: Partial<Bounds>): void {
  engine.transact('Resize', (b) => {
    const dx = (bounds.left ?? view.left) - view.left
    const dy = (bounds.top ?? view.top) - view.top
    if (dx !== 0 || dy !== 0) for (const sub of view.subViews) shiftNode(b, sub, dx, dy)
    b.setAll(view, Object.fromEntries(Object.entries(bounds).filter(([, v]) => v !== undefined)))
  })
}

export function setEdgePoints(engine: ModelEngine, edge: View, points: readonly Point[]): void {
  engine.transact('Change Edge', (b) => b.set(edge, 'points', [...points]))
}

/** Reconnects an edge end to another view (model ends are not changed). */
export function reconnectEdge(engine: ModelEngine, edge: View, end: 'head' | 'tail', view: View): void {
  engine.transact('Reconnect', (b) => b.set(edge, end, view))
}

// ---------------------------------------------------------------------------------------------
// Housekeeping and import

/**
 * Brings the item views of a view's list compartments in line with its model (adds missing item
 * views, removes stale ones). Applied as a bypass operation, as rendering housekeeping.
 */
export function syncItemViews(engine: ModelEngine, view: View): void {
  const model = view.model
  if (!model) return
  const plans: Array<{ compartment: NodeView; missing: Elem[]; stale: View[] }> = []
  for (const binding of ITEM_BINDINGS) {
    const compartment = view[binding.compartmentField]
    const items = model[binding.modelField]
    if (!isKindOf(compartment as Elem, 'NodeView') || !Array.isArray(items)) continue
    const c = compartment as NodeView
    const shown = new Set(c.subViews.map((v) => v.model))
    const missing = (items as Elem[]).filter((item) => !shown.has(item))
    const stale = c.subViews.filter((v) => !v.model || !(items as Elem[]).includes(v.model))
    if (missing.length > 0 || stale.length > 0) plans.push({ compartment: c, missing, stale })
  }
  if (plans.length === 0) return
  engine.transact(
    'Synchronize Views',
    (b) => {
      for (const { compartment, missing, stale } of plans) {
        for (const v of stale) b.remove(v)
        for (const item of missing) b.insert(compartment, 'subViews', createItemView(compartment, item))
      }
    },
    { bypass: true }
  )
}

/**
 * Imports a `.mfj` fragment under `owner.ownedElements` with fresh IDs. Applied as a bypass
 * operation (not undoable) that marks the project modified. Returns the imported root.
 */
export function importFragment(engine: ModelEngine, text: string, owner: Elem): Elem {
  const repo = engine.repository
  const json = remapIds(parseFragment(text), () => repo.generateId())
  json['_parent'] = { $ref: owner._id }
  const reader = new ElementReader({ generateId: () => repo.generateId() })
  const root = reader.read(json)
  if (!root) throw new OperationError('Fragment has no root element')
  reader.resolve((id) => repo.get(id))
  engine.transact('Import Fragment', (b) => b.insert(owner, 'ownedElements', root), { bypass: true })
  return root
}
