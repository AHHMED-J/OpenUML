/**
 * Declarative description of metaclasses (types, fields, kinds, defaults) and small builders
 * used by the metamodel tables.
 */

/**
 * How a field is stored and serialized:
 * - `prim`: String / Integer / Real / Boolean
 * - `enum`: enumeration literal name (string)
 * - `ref` / `refs`: non-owning reference(s), `{"$ref": id}` in files
 * - `obj` / `objs`: owned (contained) child element(s), nested objects in files
 * - `var`: primitive value or reference
 * - `custom`: value object with its own string encoding (`Font`, `Points`)
 * - `raw`: opaque JSON kept verbatim (only for fields the metamodel does not know)
 */
export type FieldKind = 'prim' | 'enum' | 'ref' | 'refs' | 'obj' | 'objs' | 'var' | 'custom' | 'raw'

export interface FieldDef {
  readonly name: string
  readonly kind: FieldKind
  /** `String` | `Integer` | `Real` | `Boolean` | enum name | element type name | `Font` | `Points` | `Json`. */
  readonly type: string
  /**
   * Metamodel default. Present only when the metamodel declares one: values equal to it are
   * omitted on write, and absent keys read as it. Check with `hasDefault(field)`.
   */
  readonly default?: unknown
  /** Never read or written. */
  readonly transient?: boolean
  /** For `ref` fields that point to a child stored in the named owned list (always `subViews`). */
  readonly embedded?: string
}

export interface TypeDef {
  readonly name: string
  readonly super?: string
  readonly abstract?: boolean
  /** Own fields in declaration order. Re-declaring an inherited field overrides it in place. */
  readonly fields: readonly FieldDef[]
  /** Constructor values for new instances (own or inherited fields) when they differ from defaults. */
  readonly inits?: Readonly<Record<string, unknown>>
}

export function hasDefault(field: FieldDef): boolean {
  return Object.prototype.hasOwnProperty.call(field, 'default')
}

function prim(type: string, name: string, def: unknown[]): FieldDef {
  return def.length > 0 ? { name, kind: 'prim', type, default: def[0] } : { name, kind: 'prim', type }
}

/** String field; pass a second argument to declare a metamodel default. */
export const str = (name: string, ...def: [string?]): FieldDef => prim('String', name, def)
export const int = (name: string, ...def: [number?]): FieldDef => prim('Integer', name, def)
export const real = (name: string, ...def: [number?]): FieldDef => prim('Real', name, def)
export const bool = (name: string, ...def: [boolean?]): FieldDef => prim('Boolean', name, def)
export const enm = (name: string, enumType: string, ...def: [string?]): FieldDef =>
  def.length > 0 ? { name, kind: 'enum', type: enumType, default: def[0] } : { name, kind: 'enum', type: enumType }
export const ref = (name: string, type: string): FieldDef => ({ name, kind: 'ref', type })
/** Named reference to a sub-view stored in `subViews`. */
export const emb = (name: string, type: string): FieldDef => ({ name, kind: 'ref', type, embedded: 'subViews' })
export const refs = (name: string, type: string): FieldDef => ({ name, kind: 'refs', type })
export const obj = (name: string, type: string): FieldDef => ({ name, kind: 'obj', type })
export const objs = (name: string, type: string): FieldDef => ({ name, kind: 'objs', type })
export const vari = (name: string, type: string): FieldDef => ({ name, kind: 'var', type })
export const custom = (name: string, type: 'Font' | 'Points'): FieldDef => ({ name, kind: 'custom', type })

export function t(
  name: string,
  superName: string | undefined,
  fields: FieldDef[] = [],
  options: { abstract?: boolean; inits?: Record<string, unknown> } = {}
): TypeDef {
  return { name, super: superName, fields, ...options }
}
