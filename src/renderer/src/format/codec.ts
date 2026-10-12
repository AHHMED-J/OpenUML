/**
 * Generic, metamodel-driven conversion between elements and their JSON form.
 * Used for files (.mdj/.mfj) and for the element snapshots recorded in undo operations.
 */
import {
  absentValue,
  DEFAULT_FONT,
  fieldsOf,
  formatFont,
  formatPoints,
  generateId,
  getTypeInfo,
  hasDefault,
  instantiate,
  isElem,
  parseFont,
  parsePoints,
  setExtraFields,
  type Elem,
  type FieldDef,
  type Font,
  type Points
} from '../model'
import { cloneJson, isElementJson, isRefJson, type Json, type JsonObject } from './json'

export interface WriteOptions {
  /**
   * Write every primitive/enum field, including defaults and empty strings (the older "all fields"
   * writer style). Default false: the compact style that omits metamodel defaults.
   */
  readonly verbose?: boolean
}

// =============================================================================================
// Writing

/** Serializes `el` and its contained subtree. `_type` first, then fields in metamodel order. */
export function serializeElement(el: Elem, options: WriteOptions = {}): JsonObject {
  const out: JsonObject = { _type: el._type }
  for (const field of fieldsOf(el)) {
    if (field.transient) continue
    const json = writeField(field, el[field.name], options)
    if (json !== undefined) out[field.name] = json
  }
  return out
}

function refJson(target: Elem): JsonObject {
  return { $ref: target._id }
}

function writeField(field: FieldDef, value: unknown, options: WriteOptions): Json | undefined {
  if (value === undefined) return undefined
  switch (field.kind) {
    case 'prim':
      if (value === null) return undefined
      if (options.verbose) return value as Json
      if (value === '') return undefined
      if (hasDefault(field) && value === field.default) return undefined
      return value as Json
    case 'enum':
      if (value === null) return undefined
      if (!options.verbose && hasDefault(field) && value === field.default) return undefined
      return value as Json
    case 'ref':
      return isElem(value) ? refJson(value) : undefined
    case 'refs': {
      const list = Array.isArray(value) ? value.filter(isElem).map(refJson) : []
      return list.length > 0 ? list : undefined
    }
    case 'obj':
      return isElem(value) ? serializeElement(value, options) : undefined
    case 'objs': {
      const list = Array.isArray(value) ? value.filter(isElem).map((c) => serializeElement(c, options)) : []
      return list.length > 0 ? list : undefined
    }
    case 'var':
      if (value === null) return undefined
      return isElem(value) ? refJson(value) : (value as Json)
    case 'custom':
      if (value === null) return undefined
      return field.type === 'Font' ? formatFont(value as Font) : formatPoints(value as Points)
    case 'raw':
      return cloneJson(value as Json)
  }
}

/**
 * Encodes a field value for an undo step. Unlike file writing nothing is omitted;
 * references become `{"$ref": id}` (lists: arrays of them), custom values their string form.
 */
export function encodeFieldValue(field: FieldDef, value: unknown): Json {
  switch (field.kind) {
    case 'ref':
    case 'obj':
      return isElem(value) ? refJson(value) : null
    case 'refs':
    case 'objs':
      return Array.isArray(value) ? value.filter(isElem).map(refJson) : []
    case 'var':
      return isElem(value) ? refJson(value) : ((value ?? null) as Json)
    case 'custom':
      if (value == null) return null
      return field.type === 'Font' ? formatFont(value as Font) : formatPoints(value as Points)
    default:
      return value === undefined ? null : cloneJson(value as Json)
  }
}

/** Inverse of `encodeFieldValue`, resolving references through `lookup`. */
export function decodeFieldValue(field: FieldDef, json: Json, lookup: (id: string) => Elem | undefined): unknown {
  const deref = (j: Json): Elem | null => (isRefJson(j) ? (lookup(j.$ref) ?? null) : null)
  switch (field.kind) {
    case 'ref':
    case 'obj':
      return deref(json)
    case 'refs':
    case 'objs':
      return Array.isArray(json) ? json.map(deref).filter((e): e is Elem => e !== null) : []
    case 'var':
      return isRefJson(json) ? deref(json) : json
    case 'custom':
      if (typeof json !== 'string') return null
      return field.type === 'Font' ? parseFont(json, DEFAULT_FONT) : parsePoints(json)
    default:
      return cloneJson(json)
  }
}

// =============================================================================================
// Reading

interface PendingRef {
  readonly el: Elem
  readonly field: string
  readonly ids: string | readonly string[]
}

export interface ReaderOptions {
  /** ID generator for elements whose ID is missing or duplicated. */
  readonly generateId?: () => string
}

/**
 * Reads element JSON into detached elements. Call `read` for each root, then `resolve` once to
 * turn `{"$ref"}` values into element references.
 *
 * Unknown types and unknown fields are kept: their fields' kinds are inferred from the JSON
 * shape (`$ref` → reference, nested `_type` objects → contained elements, anything else verbatim)
 * and written back unchanged.
 */
export class ElementReader {
  /** Every element read, by ID. */
  readonly elements = new Map<string, Elem>()
  readonly warnings: string[] = []
  /** IDs of nested elements whose JSON had no `_parent` key (a load-repair criterion). */
  readonly missingParent = new Set<string>()
  private readonly pending: PendingRef[] = []
  private readonly unknownTypes = new Set<string>()
  private readonly newId: () => string

  constructor(options: ReaderOptions = {}) {
    this.newId = options.generateId ?? generateId
  }

  /** Reads one element subtree. `parent` is the containing element (forced as `_parent`). */
  read(json: Json, parent: Elem | null = null): Elem | null {
    if (!isElementJson(json)) {
      this.warnings.push(`Skipped a non-element value${parent ? ` inside ${parent._id}` : ''}`)
      return null
    }
    const type = json._type
    const info = getTypeInfo(type)
    if (!info && !this.unknownTypes.has(type)) {
      this.unknownTypes.add(type)
      this.warnings.push(`Unknown element type "${type}" kept as-is`)
    }
    const el = instantiate(type)

    let id = json['_id']
    if (typeof id !== 'string' || id === '') {
      id = this.newId()
      this.warnings.push(`Element of type ${type} had no _id; assigned ${id}`)
    } else if (this.elements.has(id)) {
      const fresh = this.newId()
      this.warnings.push(`Duplicate _id ${id} (${type}); reassigned ${fresh}`)
      id = fresh
    }
    el._id = id
    this.elements.set(id, el)

    if (parent) {
      el._parent = parent
      if (json['_parent'] == null) this.missingParent.add(id)
    } else if (isRefJson(json['_parent'])) {
      this.pending.push({ el, field: '_parent', ids: json['_parent'].$ref })
    }

    const extras: FieldDef[] = []
    for (const [key, value] of Object.entries(json)) {
      if (key === '_type' || key === '_id' || key === '_parent') continue
      let field = info?.fieldMap.get(key)
      if (!field) {
        field = inferField(key, value)
        extras.push(field)
      }
      if (!field.transient) this.readField(el, field, value)
    }
    if (info) {
      for (const field of info.fields) {
        if (field.name === '_id' || field.name === '_parent' || field.transient || field.name in json) continue
        el[field.name] = absentValue(info, field)
      }
    }
    setExtraFields(el, extras)
    return el
  }

  private readField(el: Elem, field: FieldDef, value: Json): void {
    const info = getTypeInfo(el._type)
    const name = field.name
    switch (field.kind) {
      case 'prim':
        el[name] = value === null ? absentValue(info, field) : value
        return
      case 'enum':
        if (value === null) el[name] = absentValue(info, field)
        // Legacy files store navigability as a boolean.
        else if (typeof value === 'boolean' && name === 'navigable') el[name] = value ? 'navigable' : 'unspecified'
        else el[name] = value
        return
      case 'ref':
        el[name] = null
        if (isRefJson(value)) this.pending.push({ el, field: name, ids: value.$ref })
        else if (value !== null) this.warnings.push(`Ignored malformed reference ${el._id}.${name}`)
        return
      case 'refs': {
        el[name] = []
        const ids = Array.isArray(value) ? value.filter(isRefJson).map((r) => r.$ref) : []
        if (ids.length > 0) this.pending.push({ el, field: name, ids })
        return
      }
      case 'obj':
        el[name] = value === null ? null : this.read(value, el)
        return
      case 'objs':
        el[name] = Array.isArray(value)
          ? value.map((v) => this.read(v, el)).filter((c): c is Elem => c !== null)
          : []
        return
      case 'var':
        if (isRefJson(value)) {
          el[name] = null
          this.pending.push({ el, field: name, ids: value.$ref })
        } else {
          el[name] = value
        }
        return
      case 'custom':
        if (typeof value === 'string') el[name] = field.type === 'Font' ? parseFont(value) : parsePoints(value)
        else el[name] = absentValue(info, field)
        return
      case 'raw':
        el[name] = cloneJson(value)
        return
    }
  }

  /**
   * Resolves pending references against the elements read so far, then `fallback` (e.g. the
   * repository). Unresolvable references become null / are dropped from lists, with a warning.
   */
  resolve(fallback?: (id: string) => Elem | undefined): void {
    const lookup = (id: string): Elem | undefined => this.elements.get(id) ?? fallback?.(id)
    for (const p of this.pending) {
      if (typeof p.ids === 'string') {
        const target = lookup(p.ids)
        if (!target) this.warnings.push(`Unresolved reference ${p.el._id}.${p.field} → ${p.ids}`)
        p.el[p.field] = target ?? null
      } else {
        const targets: Elem[] = []
        for (const id of p.ids) {
          const target = lookup(id)
          if (target) targets.push(target)
          else this.warnings.push(`Unresolved reference ${p.el._id}.${p.field} → ${id}`)
        }
        p.el[p.field] = targets
      }
    }
    this.pending.length = 0
  }
}

/** Infers the kind of a field the metamodel does not declare from its JSON value. */
function inferField(name: string, value: Json): FieldDef {
  if (isRefJson(value)) return { name, kind: 'ref', type: 'Element' }
  if (isElementJson(value)) return { name, kind: 'obj', type: 'Element' }
  if (Array.isArray(value) && value.length > 0) {
    if (value.every(isRefJson)) return { name, kind: 'refs', type: 'Element' }
    if (value.every(isElementJson)) return { name, kind: 'objs', type: 'Element' }
  }
  return { name, kind: 'raw', type: 'Json' }
}
