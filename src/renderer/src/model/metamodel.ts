/**
 * Metamodel registry: resolves type definitions (inheritance, field order, defaults) and
 * answers generic questions about elements (fields, kinds, sub-typing). All serialization,
 * containment traversal and reference handling is driven from here.
 */
import { CORE_ENUMS, CORE_TYPES } from './metamodel-core'
import { hasDefault, type FieldDef, type TypeDef } from './metamodel-dsl'
import { UML_ENUMS, UML_TYPES } from './metamodel-uml'
import { STRUCTURE_ENUMS, STRUCTURE_MODEL_TYPES, STRUCTURE_VIEW_TYPES } from './metamodel-structure'
import { STATEMACHINE_ENUMS, STATEMACHINE_TYPES } from './metamodel-statemachine'
import { RAD_ENUMS, RAD_TYPES } from './metamodel-rad'
import { IDEF0_ENUMS, IDEF0_TYPES } from './metamodel-idef0'
import type { Elem, TypeMap } from './types'
import { DEFAULT_FONT } from './values'

export type { FieldDef, FieldKind, TypeDef } from './metamodel-dsl'
export { hasDefault } from './metamodel-dsl'

export interface TypeInfo {
  readonly name: string
  readonly superName: string | undefined
  readonly abstract: boolean
  /** This type first, then its ancestors up to `Element`. */
  readonly ancestors: readonly string[]
  /** All persistent fields in serialization order (root-most superclass first). */
  readonly fields: readonly FieldDef[]
  readonly fieldMap: ReadonlyMap<string, FieldDef>
  /** Merged constructor values (own and inherited). */
  readonly inits: Readonly<Record<string, unknown>>
}

const typeDefs = new Map<string, TypeDef>()
const typeInfos = new Map<string, TypeInfo>()
const enums = new Map<string, readonly string[]>()

/** Registers additional metaclasses (e.g. from extensions). Must be called before use. */
export function registerTypes(defs: readonly TypeDef[]): void {
  for (const def of defs) typeDefs.set(def.name, def)
  typeInfos.clear()
}

export function registerEnums(defs: Record<string, readonly string[]>): void {
  for (const [name, literals] of Object.entries(defs)) enums.set(name, literals)
}

registerTypes(CORE_TYPES)
registerTypes(UML_TYPES)
registerTypes(STRUCTURE_MODEL_TYPES)
registerTypes(STRUCTURE_VIEW_TYPES)
registerTypes(STATEMACHINE_TYPES)
registerTypes(RAD_TYPES)
registerTypes(IDEF0_TYPES)
registerEnums(CORE_ENUMS)
registerEnums(UML_ENUMS)
registerEnums(STRUCTURE_ENUMS)
registerEnums(STATEMACHINE_ENUMS)
registerEnums(RAD_ENUMS)
registerEnums(IDEF0_ENUMS)

// Called for every `isKindOf`/`fieldOf`: the cache hit must not allocate.
function resolve(name: string): TypeInfo | undefined {
  return typeInfos.get(name) ?? build(name, new Set())
}

function build(name: string, seen: Set<string>): TypeInfo | undefined {
  const cached = typeInfos.get(name)
  if (cached) return cached
  const def = typeDefs.get(name)
  if (!def) return undefined
  if (seen.has(name)) throw new Error(`Metamodel cycle at ${name}`)
  seen.add(name)
  const parent = def.super ? build(def.super, seen) : undefined
  if (def.super && !parent) throw new Error(`Unknown supertype ${def.super} of ${name}`)
  const fields: FieldDef[] = parent ? [...parent.fields] : []
  for (const field of def.fields) {
    const idx = fields.findIndex((f) => f.name === field.name)
    if (idx >= 0) fields[idx] = field
    else fields.push(field)
  }
  const info: TypeInfo = {
    name,
    superName: def.super,
    abstract: def.abstract ?? false,
    ancestors: [name, ...(parent?.ancestors ?? [])],
    fields,
    fieldMap: new Map(fields.map((f) => [f.name, f])),
    inits: { ...(parent?.inits ?? {}), ...(def.inits ?? {}) }
  }
  typeInfos.set(name, info)
  return info
}

export function getTypeInfo(type: string): TypeInfo | undefined {
  return resolve(type)
}

export function getEnumLiterals(name: string): readonly string[] | undefined {
  return enums.get(name)
}

/** True when `type` is `base` or a subtype of it. Unknown types only match themselves. */
export function isSubtype(type: string, base: string): boolean {
  if (type === base) return true
  return resolve(type)?.ancestors.includes(base) ?? false
}

export function isKindOf<K extends keyof TypeMap>(el: Elem | null | undefined, type: K): el is TypeMap[K]
export function isKindOf(el: Elem | null | undefined, type: string): boolean
export function isKindOf(el: Elem | null | undefined, type: string): boolean {
  return el != null && isSubtype(el._type, type)
}

// ---------------------------------------------------------------------------------------------
// Extra fields: fields present on an element that its metaclass does not declare (unknown types,
// newer files). They are kept per element so they round-trip unchanged.

const extraFields = new WeakMap<Elem, FieldDef[]>()

export function setExtraFields(el: Elem, fields: FieldDef[]): void {
  if (fields.length > 0) extraFields.set(el, fields)
  else extraFields.delete(el)
}

const ELEMENT_FIELDS: readonly FieldDef[] = [
  { name: '_id', kind: 'prim', type: 'String' },
  { name: '_parent', kind: 'ref', type: 'Element' }
]

/** All persistent fields of an element in serialization order: metaclass fields, then extras. */
export function fieldsOf(el: Elem): readonly FieldDef[] {
  const base = resolve(el._type)?.fields ?? ELEMENT_FIELDS
  const extras = extraFields.get(el)
  return extras ? [...base, ...extras] : base
}

export function fieldOf(el: Elem, name: string): FieldDef | undefined {
  const known = resolve(el._type)?.fieldMap.get(name)
  if (known) return known
  if (name === '_id' || name === '_parent') return ELEMENT_FIELDS.find((f) => f.name === name)
  return extraFields.get(el)?.find((f) => f.name === name)
}

// ---------------------------------------------------------------------------------------------
// Values

function cloneValue(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value
}

/** Value a field takes in a freshly constructed element. */
export function initialValue(info: TypeInfo | undefined, field: FieldDef): unknown {
  if (info && Object.prototype.hasOwnProperty.call(info.inits, field.name)) return cloneValue(info.inits[field.name])
  if (hasDefault(field)) return cloneValue(field.default)
  return emptyValue(field)
}

/** Value assigned when a file omits the field: the metamodel default, else the constructor value. */
export function absentValue(info: TypeInfo | undefined, field: FieldDef): unknown {
  return hasDefault(field) ? cloneValue(field.default) : initialValue(info, field)
}

function emptyValue(field: FieldDef): unknown {
  switch (field.kind) {
    case 'prim':
      if (field.type === 'Boolean') return false
      if (field.type === 'Integer' || field.type === 'Real') return 0
      return ''
    case 'refs':
    case 'objs':
      return []
    case 'custom':
      return field.type === 'Font' ? DEFAULT_FONT : []
    default:
      return null
  }
}

/**
 * Creates a detached element of `type` with every field at its constructor value.
 * The `_id` is left empty; callers assign one (see `createElement` in factories or the reader).
 */
export function instantiate(type: string): Elem {
  const el: Elem = { _type: type, _id: '', _parent: null }
  const info = resolve(type)
  if (!info) return el
  for (const field of info.fields) {
    if (field.name === '_id' || field.name === '_parent' || field.transient) continue
    el[field.name] = initialValue(info, field)
  }
  return el
}

/** Containment fields (`obj`/`objs`) of an element, including extras. */
export function containmentFields(el: Elem): readonly FieldDef[] {
  return fieldGroups(el).containment
}

/** Non-owning reference fields (`ref`/`refs`/`var`), excluding `_parent`. */
export function referenceFields(el: Elem): readonly FieldDef[] {
  return fieldGroups(el).reference
}

interface FieldGroups {
  readonly containment: readonly FieldDef[]
  readonly reference: readonly FieldDef[]
}

const isContainment = (f: FieldDef): boolean => (f.kind === 'obj' || f.kind === 'objs') && !f.transient
const isReference = (f: FieldDef): boolean =>
  (f.kind === 'ref' || f.kind === 'refs' || f.kind === 'var') && f.name !== '_parent' && !f.transient

/** Field groups per metaclass, computed once (tree walks ask for them for every element). */
const groupsByType = new WeakMap<TypeInfo, FieldGroups>()
const NO_GROUPS: FieldGroups = { containment: [], reference: [] }

function fieldGroups(el: Elem): FieldGroups {
  const info = resolve(el._type)
  if (extraFields.has(el) || !info) {
    const fields = fieldsOf(el)
    return fields.length === 0 ? NO_GROUPS : { containment: fields.filter(isContainment), reference: fields.filter(isReference) }
  }
  let groups = groupsByType.get(info)
  if (!groups) {
    groups = { containment: info.fields.filter(isContainment), reference: info.fields.filter(isReference) }
    groupsByType.set(info, groups)
  }
  return groups
}

/** Human display name of a type: the type name without the `UML` or `IDEF0` prefix. */
export function typeDisplayName(type: string): string {
  if (type.startsWith('IDEF0')) return type.slice(5)
  return type.startsWith('UML') ? type.slice(3) : type
}

/** Type-guard for element-like values held in reference fields. */
export function isElem(value: unknown): value is Elem {
  return typeof value === 'object' && value !== null && typeof (value as { _type?: unknown })._type === 'string'
}
