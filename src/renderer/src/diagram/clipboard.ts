/**
 * Clipboard of diagram views (spec 02 §8.1) and Duplicate.
 *
 * - Copy serializes the selected top-level views (with sub-views). Edges are copied only with
 *   both of their ends; references to views outside the copied set (containers) are dropped.
 *   The payload records the model elements the views show (`outerRefs`).
 * - Paste creates new views (fresh IDs, internal references remapped) that show the *same*
 *   model elements; it is refused when one of them no longer exists. The pasted views are
 *   centered on a target point and become the selection.
 * - Duplicate deep-copies the models of the selected nodes (and the relationships drawn between
 *   them) and creates views for the copies, offset from the originals.
 *
 * The payload is JSON text so it can travel through the system clipboard.
 */
import type { ModelEngine } from '../commands'
import { ElementReader, isJsonObject, serializeElement, type Json, type JsonObject } from '../format'
import {
  findContainment,
  formatPoints,
  isKindOf,
  isSubtype,
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

export interface ViewClipboardPayload {
  readonly format: typeof VIEW_CLIPBOARD_FORMAT
  readonly version: 1
  readonly diagramType: string
  readonly views: readonly JsonObject[]
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

/** The copyable subset of `ids`: top-level views; edges only with both ends. */
export function copyableViews(repo: Repository, diagram: Diagram, ids: readonly string[]): View[] {
  const views = ids.map((id) => repo.get(id)).filter((v): v is View => isKindOf(v, 'View') && v._parent === diagram)
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
  const inside = collectIds(json)
  dropOuterViewRefs(json, inside, repo)
  const boxes = layout ? views.map((v) => layout.nodes.get(v._id)?.box).filter((b): b is Rect => b !== undefined) : []
  return {
    format: VIEW_CLIPBOARD_FORMAT,
    version: 1,
    diagramType: diagram._type,
    views: json,
    outerRefs: outerRefIds(json, inside),
    bounds: unionRects(boxes) ?? jsonBounds(json)
  }
}

export function serializeClipboard(payload: ViewClipboardPayload): string {
  return JSON.stringify(payload)
}

/** Parses clipboard text; null when it is not an OpenUML view payload. */
export function parseClipboard(text: string): ViewClipboardPayload | null {
  try {
    const value = JSON.parse(text) as unknown
    if (isJsonObject(value) && value['format'] === VIEW_CLIPBOARD_FORMAT && Array.isArray(value['views'])) {
      return value as unknown as ViewClipboardPayload
    }
  } catch {
    // Not JSON.
  }
  return null
}

/** Rewrites every element ID (and every `$ref` to one) in the JSON trees; returns old → new. */
export function remapAll(roots: readonly JsonObject[], newId: () => string): { roots: JsonObject[]; ids: Map<string, string> } {
  const ids = new Map<string, string>()
  for (const id of collectIds(roots)) ids.set(id, newId())
  const rewrite = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(rewrite)
    if (!isJsonObject(value)) return value
    const out: JsonObject = {}
    for (const [key, v] of Object.entries(value)) {
      if ((key === '_id' || key === '$ref') && typeof v === 'string') out[key] = ids.get(v) ?? v
      else out[key] = rewrite(v)
    }
    return out
  }
  return { roots: roots.map((r) => rewrite(r) as JsonObject), ids }
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

/**
 * Pastes views into `diagram` as one operation. `center` is where the pasted bounding box is
 * centered (default: 20 units offset from the copied position). Returns the new top-level view IDs.
 */
export function pasteViews(engine: ModelEngine, diagram: Diagram, payload: ViewClipboardPayload, center?: Point): string[] {
  const repo = engine.repository
  const missing = payload.outerRefs.filter((id) => !repo.has(id))
  if (missing.length > 0) throw new PasteError('Some copied elements no longer exist')
  if (NOT_COPYABLE_DIAGRAMS.has(diagram._type)) throw new PasteError('Views cannot be pasted into this diagram')
  const { roots } = remapAll(payload.views, () => repo.generateId())
  const b = payload.bounds
  const dx = center && b ? Math.round(center.x - (b.left + b.width / 2)) : 20
  const dy = center && b ? Math.round(center.y - (b.top + b.height / 2)) : 20
  // Keep the pasted views inside the positive quadrant.
  shiftViewJson(roots, b ? Math.max(dx, -b.left) : dx, b ? Math.max(dy, -b.top) : dy)
  const views = readAll(repo, roots)
  engine.transact('Paste', (builder) => {
    for (const v of views) builder.insert(diagram, 'ownedViews', v)
  })
  return views.map((v) => v._id)
}

// ---------------------------------------------------------------------------------------------
// Duplicate

function isRelationshipType(type: unknown): boolean {
  return typeof type === 'string' && (isSubtype(type, 'DirectedRelationship') || isSubtype(type, 'UndirectedRelationship'))
}

/** Removes owned relationships and diagrams from a model subtree JSON (they are not duplicated). */
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

/**
 * Duplicates the selected node views' model elements (deep copy with fresh IDs) and relationships
 * drawn between them, plus views of the copies offset by `offset`. One operation; returns the new
 * top-level view IDs.
 */
export function duplicateViews(engine: ModelEngine, diagram: Diagram, ids: readonly string[], offset: Point = { x: 20, y: 20 }): string[] {
  const repo = engine.repository
  const views = copyableViews(repo, diagram, ids)
  const nodes = views.filter((v) => !isKindOf(v, 'EdgeView'))
  const nodeModels = new Set(nodes.map((v) => v.model).filter((m): m is Elem => m !== null))
  const edges = views.filter((v) => isKindOf(v, 'EdgeView') && v.model && isRelationshipType(v.model._type))
  const models: Array<{ json: JsonObject; owner: Elem; field: string }> = []
  for (const m of nodeModels) {
    const c = findContainment(m)
    if (!c || c.index < 0) continue
    const json = serializeElement(m)
    delete json['_parent']
    stripOwned(json)
    models.push({ json, owner: c.owner, field: c.field })
  }
  const relationships: Array<{ json: JsonObject; owner: Elem; field: string }> = []
  for (const e of edges) {
    const rel = e.model as Elem
    const c = findContainment(rel)
    if (!c || c.index < 0) continue
    const json = serializeElement(rel)
    delete json['_parent']
    relationships.push({ json, owner: c.owner, field: c.field })
  }
  const keptEdges = edges.concat(views.filter((v) => isKindOf(v, 'EdgeView') && !v.model))
  const viewJson = [...nodes, ...keptEdges].map((v) => {
    const j = serializeElement(v)
    delete j['_parent']
    return j
  })
  dropOuterViewRefs(viewJson, collectIds(viewJson), repo)
  shiftViewJson(viewJson, offset.x, offset.y)
  const all = [...models.map((m) => m.json), ...relationships.map((r) => r.json), ...viewJson]
  const { roots, ids: mapping } = remapAll(all, () => repo.generateId())
  const elements = readAll(repo, roots)
  const modelCount = models.length
  const relCount = relationships.length
  const ownerOf = (owner: Elem): Elem => repo.get(mapping.get(owner._id) ?? '') ?? elements.find((e) => e._id === mapping.get(owner._id)) ?? owner
  engine.transact('Duplicate', (b) => {
    models.forEach((m, i) => b.insert(m.owner, m.field, elements[i] as Elem))
    relationships.forEach((r, i) => b.insert(ownerOf(r.owner), r.field, elements[modelCount + i] as Elem))
    for (const v of elements.slice(modelCount + relCount)) b.insert(diagram, 'ownedViews', v)
  })
  return elements.slice(modelCount + relCount).map((v) => v._id)
}
