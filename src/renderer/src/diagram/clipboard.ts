/**
 * Clipboard of diagram views (spec 02 §8.1) and Duplicate.
 *
 * - Copy serializes the selected top-level views (with sub-views). Edges are copied only with
 *   both of their ends; references to views outside the copied set (containers) are dropped.
 *   The payload records the model elements the views show (`outerRefs`).
 * - Copy also records the model elements of the copied nodes (with their owned elements) and the
 *   relationships drawn between them (`models`).
 * - Paste creates *new, independent* elements from those copies (same names, fresh IDs) and views
 *   for them, so editing the pasted elements never changes the originals. The copies go to the
 *   owners of the originals; it is refused when one of them no longer exists. The pasted views are
 *   centered on a target point and become the selection. A payload without `models` (written by
 *   an older version) pastes views of the same elements, as before.
 * - Duplicate is a paste of the selection, offset from the originals.
 *
 * The payload is JSON text so it can travel through the system clipboard.
 */
import type { ModelEngine } from '../commands'
import { ElementReader, isJsonObject, parseJsonText, remapTreeIds, serializeElement, type Json, type JsonObject } from '../format'
import {
  findContainment,
  formatPoints,
  isKindOf,
  isSubtype,
  listField,
  nextFreeBoxNumber,
  parsePoints,
  type Diagram,
  type Elem,
  type Point,
  type Repository,
  type View
} from '../model'
import { unionRects, type Rect } from './core'
import type { DiagramLayout } from './layout/types'

export const VIEW_CLIPBOARD_FORMAT = 'openuml/views'

/** A copied model element: its JSON (subtree), and where the original is owned. */
interface ModelCopy {
  readonly json: JsonObject
  readonly owner: string
  readonly field: string
}

export interface ViewClipboardPayload {
  readonly format: typeof VIEW_CLIPBOARD_FORMAT
  readonly version: 1
  readonly diagramType: string
  readonly views: readonly JsonObject[]
  /** Models the copied views show, pasted as new elements (absent in older payloads). */
  readonly models?: readonly ModelCopy[]
  /** IDs of elements outside the copied views that they reference (their models). */
  readonly outerRefs: readonly string[]
  /** Bounds of the copied views when copied (for placement). */
  readonly bounds: Rect | null
}

/** Diagram types whose views cannot be copied (copy the owning interaction instead). */
const NOT_COPYABLE_DIAGRAMS = new Set(['UMLSequenceDiagram', 'UMLCommunicationDiagram'])

export function canCopyViewsOf(diagram: Diagram): boolean {
  return !NOT_COPYABLE_DIAGRAMS.has(diagram._type)
}

function hostOf(view: View): View {
  let v = view
  while (isKindOf(v._parent, 'View')) v = v._parent
  return v
}

/**
 * An IDEF0 boundary port standing for an arrow of the parent box: there is one per parent arrow,
 * so it is never copied (a copy would be a second, duplicate stand-in for the same arrow).
 */
function isLinkedBoundaryPort(view: View): boolean {
  const model = view.model as Elem | null | undefined
  return !!model && model._type === 'IDEF0Port' && !!model['corresponds']
}

/** The copyable subset of `ids`: top-level views, except linked IDEF0 boundary ports; edges only with both ends. */
export function copyableViews(repo: Repository, diagram: Diagram, ids: readonly string[]): View[] {
  const views = ids.map((id) => repo.get(id)).filter((v): v is View => isKindOf(v, 'View') && v._parent === diagram && !isLinkedBoundaryPort(v))
  const set = new Set<View>(views)
  return views.filter((v) => {
    if (!isKindOf(v, 'EdgeView')) return true
    return v.tail !== null && v.head !== null && set.has(hostOf(v.tail)) && set.has(hostOf(v.head))
  })
}

/** Visits every object in a JSON tree. */
function visitJson(value: Json, fn: (obj: JsonObject) => void): void {
  if (Array.isArray(value)) value.forEach((v) => visitJson(v, fn))
  else if (isJsonObject(value)) {
    fn(value)
    for (const v of Object.values(value)) visitJson(v, fn)
  }
}

function collectIds(roots: readonly Json[]): Set<string> {
  const ids = new Set<string>()
  roots.forEach((r) =>
    visitJson(r, (o) => {
      if (typeof o['_type'] === 'string' && typeof o['_id'] === 'string') ids.add(o['_id'])
    })
  )
  return ids
}

/** Removes references to views outside `inside` (container links) from view JSON. */
function dropOuterViewRefs(roots: readonly JsonObject[], inside: Set<string>, repo: Repository): void {
  const isOuterView = (ref: Json): boolean => isJsonObject(ref) && typeof ref['$ref'] === 'string' && !inside.has(ref['$ref']) && isKindOf(repo.get(ref['$ref']), 'View')
  roots.forEach((r) =>
    visitJson(r, (o) => {
      for (const [key, value] of Object.entries(o)) {
        if (key === '_parent') continue
        if (Array.isArray(value) && value.some(isOuterView)) {
          const kept = value.filter((v) => !isOuterView(v))
          if (kept.length > 0) o[key] = kept
          else delete o[key]
        } else if (isOuterView(value)) delete o[key]
      }
    })
  )
}

function outerRefIds(roots: readonly JsonObject[], inside: Set<string>): string[] {
  const out = new Set<string>()
  roots.forEach((r) =>
    visitJson(r, (o) => {
      for (const [key, value] of Object.entries(o)) {
        if (key === '_parent') continue
        const refs = Array.isArray(value) ? value : [value]
        for (const ref of refs) if (isJsonObject(ref) && typeof ref['$ref'] === 'string' && !inside.has(ref['$ref'])) out.add(ref['$ref'])
      }
    })
  )
  return [...out]
}

/** Builds the clipboard payload for the given views, or null when nothing can be copied. */
export function copyViews(repo: Repository, diagram: Diagram, ids: readonly string[], layout?: DiagramLayout | null): ViewClipboardPayload | null {
  if (!canCopyViewsOf(diagram)) return null
  const views = copyableViews(repo, diagram, ids)
  if (views.length === 0) return null
  const json = views.map((v) => {
    const j = serializeElement(v)
    delete j['_parent']
    return j
  })
  dropOuterViewRefs(json, collectIds(json), repo)
  const models = modelCopies(views)
  const inside = collectIds([...json, ...models.map((m) => m.json)])
  const boxes = layout ? views.map((v) => layout.nodes.get(v._id)?.box).filter((b): b is Rect => b !== undefined) : []
  return {
    format: VIEW_CLIPBOARD_FORMAT,
    version: 1,
    diagramType: diagram._type,
    views: json,
    models,
    outerRefs: [...new Set([...outerRefIds(json, inside), ...outerRefIds(models.map((m) => m.json), inside), ...models.map((m) => m.owner).filter((id) => !inside.has(id))])],
    bounds: unionRects(boxes) ?? jsonBounds(json)
  }
}

export function serializeClipboard(payload: ViewClipboardPayload): string {
  return JSON.stringify(payload)
}

/** Parses clipboard text; null when it is not an OpenUML view payload. */
export function parseClipboard(text: string): ViewClipboardPayload | null {
  try {
    // Clipboard text is untrusted: parse it with the same depth and `__proto__` guards as files.
    const value = parseJsonText(text) as unknown
    if (
      isJsonObject(value) &&
      value['format'] === VIEW_CLIPBOARD_FORMAT &&
      typeof value['diagramType'] === 'string' &&
      Array.isArray(value['views']) &&
      value['views'].every(isJsonObject) &&
      Array.isArray(value['outerRefs']) &&
      value['outerRefs'].every((id) => typeof id === 'string') &&
      (value['models'] === undefined || (Array.isArray(value['models']) && value['models'].every(isModelCopy)))
    ) {
      return value as unknown as ViewClipboardPayload
    }
  } catch {
    // Not JSON.
  }
  return null
}

function isModelCopy(value: Json): boolean {
  return isJsonObject(value) && isJsonObject(value['json']) && typeof value['owner'] === 'string' && typeof value['field'] === 'string'
}

/** Translates every node box (`left`/`top`) and edge polyline (`points`) in view JSON. */
export function shiftViewJson(roots: readonly JsonObject[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  roots.forEach((r) =>
    visitJson(r, (o) => {
      // Compact JSON omits zero coordinates, so node views without them sit at 0.
      if (isNodeJson(o)) {
        o['left'] = num(o['left']) + dx
        o['top'] = num(o['top']) + dy
      }
      if (typeof o['points'] === 'string') o['points'] = formatPoints(parsePoints(o['points']).map((p) => ({ x: p.x + dx, y: p.y + dy })))
    })
  )
}

function num(value: Json | undefined): number {
  return typeof value === 'number' ? value : 0
}

function isNodeJson(o: JsonObject): boolean {
  return typeof o['_type'] === 'string' && isSubtype(o['_type'], 'NodeView')
}

function jsonBounds(roots: readonly JsonObject[]): Rect | null {
  const boxes: Rect[] = []
  for (const r of roots) {
    if (isNodeJson(r)) {
      boxes.push({ left: num(r['left']), top: num(r['top']), width: num(r['width']), height: num(r['height']) })
    } else if (typeof r['points'] === 'string') {
      const pts = parsePoints(r['points'])
      for (const p of pts) boxes.push({ left: p.x, top: p.y, width: 0, height: 0 })
    }
  }
  return unionRects(boxes)
}

function readAll(repo: Repository, roots: readonly JsonObject[]): Elem[] {
  const reader = new ElementReader({ generateId: () => repo.generateId() })
  const elements = roots.map((r) => reader.read(r)).filter((e): e is Elem => e !== null)
  reader.resolve((id) => repo.get(id))
  return elements
}

export class PasteError extends Error {}

/** Whether a diagram of type `diagramType` may hold a top-level view of type `viewType`. */
export type ViewHostPredicate = (diagramType: string, viewType: string) => boolean

export interface PasteOptions {
  /** Undo label (default "Paste"). */
  readonly name?: string
  /** Shift when no `center` is given (default 20, 20). */
  readonly offset?: Point
}

/**
 * Pastes `payload` into `diagram` as one operation: new elements copied from `payload.models`
 * (inserted where the originals are owned) and new views of them. `center` is where the pasted
 * bounding box is centered (default: `offset` from the copied position). Views copied from another
 * diagram type are pasted only when `canHost` accepts every one of them (without `canHost`, only
 * into the same diagram type). Returns the new top-level view IDs.
 */
export function pasteViews(
  engine: ModelEngine,
  diagram: Diagram,
  payload: ViewClipboardPayload,
  center?: Point,
  canHost?: ViewHostPredicate,
  options: PasteOptions = {}
): string[] {
  const repo = engine.repository
  const missing = payload.outerRefs.filter((id) => !repo.has(id))
  if (missing.length > 0) throw new PasteError('Some copied elements no longer exist')
  if (NOT_COPYABLE_DIAGRAMS.has(diagram._type)) throw new PasteError('Views cannot be pasted into this diagram')
  if (payload.diagramType !== diagram._type) {
    const hostable = (v: JsonObject): boolean => canHost !== undefined && typeof v['_type'] === 'string' && canHost(diagram._type, v['_type'])
    if (!payload.views.every(hostable)) throw new PasteError('The copied views cannot be pasted into this kind of diagram')
  }
  const models = payload.models ?? []
  // The payload passed `parseClipboard` (parsed with the file guards); `remapTreeIds` copies it.
  // Models and views are remapped together, so the new views show the new elements.
  const { roots, ids: mapping } = remapTreeIds([...models.map((m) => m.json), ...payload.views], () => repo.generateId())
  const viewRoots = roots.slice(models.length)
  const b = payload.bounds
  const offset = options.offset ?? { x: 20, y: 20 }
  const dx = center && b ? Math.round(center.x - (b.left + b.width / 2)) : offset.x
  const dy = center && b ? Math.round(center.y - (b.top + b.height / 2)) : offset.y
  // Keep the pasted views inside the positive quadrant.
  shiftViewJson(viewRoots, b ? Math.max(dx, -b.left) : dx, b ? Math.max(dy, -b.top) : dy)
  const elements = readAll(repo, roots)
  const copies = elements.slice(0, models.length)
  const views = elements.slice(models.length)
  const byId = new Map(elements.map((e) => [e._id, e]))
  const ownerOf = (id: string): Elem | undefined => byId.get(mapping.get(id) ?? '') ?? repo.get(id)
  engine.transact(options.name ?? 'Paste', (builder) => {
    models.forEach((m, i) => {
      const owner = ownerOf(m.owner)
      const copy = copies[i] as Elem
      if (!owner) throw new PasteError('Some copied elements no longer exist')
      // A pasted IDEF0 box takes the next free box number on its diagram.
      if (copy._type === 'IDEF0Function') copy['boxNumber'] = nextFreeBoxNumber(listField(owner, 'functions'))
      builder.insert(owner, m.field, copy)
    })
    for (const v of views) builder.insert(diagram, 'ownedViews', v)
  })
  return views.map((v) => v._id)
}

// ---------------------------------------------------------------------------------------------
// Duplicate

function isRelationshipType(type: unknown): boolean {
  return typeof type === 'string' && (isSubtype(type, 'DirectedRelationship') || isSubtype(type, 'UndirectedRelationship'))
}

/** Removes owned relationships and diagrams from a model subtree JSON (they are not copied). */
function stripOwned(json: JsonObject): void {
  visitJson(json, (o) => {
    const owned = o['ownedElements']
    if (Array.isArray(owned)) {
      const kept = owned.filter((e) => !(isJsonObject(e) && (isRelationshipType(e['_type']) || (typeof e['_type'] === 'string' && isSubtype(e['_type'], 'Diagram')))))
      if (kept.length > 0) o['ownedElements'] = kept
      else delete o['ownedElements']
    }
  })
}

function hasAncestorIn(el: Elem, set: ReadonlySet<Elem>): boolean {
  for (let p = el._parent; p; p = p._parent) if (set.has(p)) return true
  return false
}

/**
 * An IDEF0 box is copied as a plain box: not its decomposition (child boxes, their arrows, the
 * boundary ports and the child diagram), which belong to the original.
 */
function stripDecomposition(json: JsonObject): void {
  if (json['_type'] !== 'IDEF0Function') return
  for (const field of ['functions', 'arrows', 'ports', 'childDiagram']) delete json[field]
}

function copyOf(el: Elem): ModelCopy | null {
  const c = findContainment(el)
  if (!c || c.index < 0) return null
  const json = serializeElement(el)
  delete json['_parent']
  return { json, owner: c.owner._id, field: c.field }
}

/**
 * The model elements to copy with `views`: the models of the node views (each with its owned
 * elements, minus owned relationships and diagrams; a model inside another copied one comes with
 * its owner), then the relationships drawn between them. Diagrams shown as nodes are not copied.
 */
function modelCopies(views: readonly View[]): ModelCopy[] {
  const nodeModels = new Set(
    views.filter((v) => !isKindOf(v, 'EdgeView')).map((v) => v.model).filter((m): m is Elem => m !== null && !isKindOf(m, 'Diagram'))
  )
  const out: ModelCopy[] = []
  for (const m of nodeModels) {
    if (hasAncestorIn(m, nodeModels)) continue
    const copy = copyOf(m)
    if (!copy) continue
    stripOwned(copy.json)
    stripDecomposition(copy.json)
    out.push(copy)
  }
  for (const v of views) {
    const rel = isKindOf(v, 'EdgeView') ? v.model : null
    if (!rel || !isRelationshipType(rel._type)) continue
    const copy = copyOf(rel)
    if (copy) out.push(copy)
  }
  return out
}

/**
 * Duplicates the selected views: new elements copied from their models (and the relationships
 * drawn between them) with views offset by `offset`. One operation; returns the new top-level
 * view IDs.
 */
export function duplicateViews(engine: ModelEngine, diagram: Diagram, ids: readonly string[], offset: Point = { x: 20, y: 20 }): string[] {
  const payload = copyViews(engine.repository, diagram, ids)
  return payload ? pasteViews(engine, diagram, payload, undefined, () => true, { name: 'Duplicate', offset }) : []
}
