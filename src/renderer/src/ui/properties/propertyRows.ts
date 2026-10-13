/**
 * Property editor rows generated from the metamodel (`fieldsOf`, `getEnumLiterals`). Pure: the
 * React panel renders one widget per row and commits edits through `commands/`.
 *
 * Rules: fields appear in metamodel order (base type first); containment lists are hidden except
 * the feature collections (attributes, operations, parameters, literals, ...), which come last;
 * association ends are expanded into their own sections; with several elements selected only
 * the fields they all share are shown, with a merged value.
 */
import { fieldOf, fieldsOf, getEnumLiterals, isElem, isKindOf, type Elem, type FeatureKind, type FieldDef } from '../../model'

type WidgetKind =
  | 'text'
  | 'textarea'
  | 'combo'
  | 'number'
  | 'checkbox'
  | 'enum'
  | 'ref'
  | 'refs'
  | 'var'
  | 'collection'

export interface PropertyRow {
  /** Unique key, e.g. `name` or `end1.multiplicity`. */
  readonly key: string
  readonly field: string
  readonly label: string
  readonly widget: WidgetKind
  /** Metamodel field type: `String`, enum name or element type. */
  readonly type: string
  /** Elements whose `field` this row edits (association ends for end sections). */
  readonly targets: readonly Elem[]
  readonly readOnly: boolean
  /** Rarely used rows shown under an "Advanced" disclosure. */
  readonly advanced: boolean
  /** Enum literals, or suggestions for combo rows. */
  readonly options?: readonly string[]
  /** The shared value (the first target's value when `mixed`). */
  readonly value: unknown
  /** Targets disagree on the value. */
  readonly mixed: boolean
  /** Section title for expanded sub-objects (`end1 : UMLAssociationEnd`). */
  readonly section?: string
  /** Collection rows: the feature kind used to add items. */
  readonly featureKind?: FeatureKind
}

const HIDDEN = new Set([
  '_id',
  '_parent',
  'documentation',
  'tags',
  'documentVersion',
  'visible',
  'ownedElements',
  'ownedViews'
])

/** Containment lists editable as collections, with the feature kind that adds an item. */
const COLLECTION_FIELDS: Readonly<Record<string, FeatureKind>> = {
  attributes: 'Attribute',
  operations: 'Operation',
  parameters: 'Parameter',
  literals: 'EnumerationLiteral',
  extensionPoints: 'ExtensionPoint',
  operands: 'Operand'
}

const ADVANCED = new Set(['isFinalSpecialization', 'isLeaf', 'featureDirection', 'isID', 'concurrency', 'ownerAttribute'])
const MULTILINE = new Set(['specification', 'body'])
export const MULTIPLICITY_OPTIONS: readonly string[] = ['0..1', '1', '0..*', '1..*', '*']
const EXPANDED = ['end1', 'end2']

/** `isAbstract` → `Is Abstract`. */
export function fieldLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^_+/, '')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function isReadOnly(el: Elem, field: FieldDef): boolean {
  if ((field.name === 'source' || field.name === 'target') && isKindOf(el, 'DirectedRelationship')) return true
  if (field.name === 'reference' && isKindOf(el, 'RelationshipEnd')) return true
  return false
}

function widgetFor(field: FieldDef): WidgetKind | null {
  switch (field.kind) {
    case 'prim':
      if (field.type === 'Boolean') return 'checkbox'
      if (field.type === 'Integer' || field.type === 'Real') return 'number'
      if (MULTILINE.has(field.name)) return 'textarea'
      if (field.name === 'multiplicity') return 'combo'
      return 'text'
    case 'enum':
      return 'enum'
    case 'ref':
      return field.embedded ? null : 'ref'
    case 'refs':
      return 'refs'
    case 'var':
      return 'var'
    case 'objs':
      return field.name in COLLECTION_FIELDS ? 'collection' : null
    default:
      return null
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i])
  return false
}

/** True when every element declares `field` with the same kind and type. */
function sharedField(elements: readonly Elem[], field: FieldDef): boolean {
  return elements.every((el) => {
    const f = fieldOf(el, field.name)
    return f !== undefined && f.kind === field.kind && f.type === field.type
  })
}

function rowsFor(targets: readonly Elem[], prefix: string, section: string | undefined, single: boolean): PropertyRow[] {
  const first = targets[0]
  if (!first) return []
  const plain: PropertyRow[] = []
  const collections: PropertyRow[] = []
  for (const field of fieldsOf(first)) {
    if (HIDDEN.has(field.name) || field.transient || EXPANDED.includes(field.name)) continue
    const widget = widgetFor(field)
    if (!widget) continue
    if (widget === 'collection' && !single) continue
    if (!sharedField(targets, field)) continue
    const values = targets.map((t) => t[field.name])
    const value = values[0]
    const row: PropertyRow = {
      key: prefix + field.name,
      field: field.name,
      label: fieldLabel(field.name),
      widget,
      type: field.type,
      targets,
      readOnly: isReadOnly(first, field),
      advanced: ADVANCED.has(field.name),
      value,
      mixed: values.some((v) => !sameValue(v, value)),
      ...(section ? { section } : {}),
      ...(widget === 'enum' ? { options: getEnumLiterals(field.type) ?? [] } : {}),
      ...(widget === 'combo' ? { options: MULTIPLICITY_OPTIONS } : {}),
      ...(widget === 'collection' ? { featureKind: COLLECTION_FIELDS[field.name] } : {})
    }
    if (widget === 'collection') collections.push(row)
    else plain.push(row)
  }
  return [...plain, ...collections]
}

/** Rows for the selected model elements (empty when nothing is selected). */
export function propertyRows(elements: readonly Elem[]): PropertyRow[] {
  if (elements.length === 0) return []
  const single = elements.length === 1
  const rows = rowsFor(elements, '', undefined, single)
  const first = elements[0] as Elem
  for (const end of EXPANDED) {
    const def = fieldOf(first, end)
    if (!def || def.kind !== 'obj' || !sharedField(elements, def)) continue
    const ends = elements.map((e) => e[end]).filter(isElem)
    if (ends.length !== elements.length || ends.length === 0) continue
    rows.push(...rowsFor(ends, `${end}.`, `${end} : ${(ends[0] as Elem)._type}`, single))
  }
  return rows
}

// ---------------------------------------------------------------------------------------------
// Variant (`var`) resolution

/**
 * Resolves typed text for a `var` field (e.g. attribute `type`): an element of `type` named
 * `text`, searched from `context`'s namespace outward, else the plain string. Empty text → null.
 */
export function resolveVariant(
  elements: Iterable<Elem>,
  context: Elem,
  type: string,
  text: string
): Elem | string | null {
  const name = text.trim()
  if (!name) return null
  const candidates: Elem[] = []
  for (const el of elements) if (isKindOf(el, type) && el['name'] === name) candidates.push(el)
  if (candidates.length === 0) return name
  for (let scope: Elem | null = context; scope; scope = scope._parent) {
    const local = candidates.find((c) => c._parent === scope)
    if (local) return local
  }
  return candidates[0] as Elem
}

/** Converts widget input to the stored value; returns `undefined` for invalid input (revert). */
export function parseInput(row: Pick<PropertyRow, 'widget' | 'type'>, input: string): unknown {
  if (row.widget === 'number') {
    const n = row.type === 'Integer' ? Number.parseInt(input, 10) : Number.parseFloat(input)
    return Number.isFinite(n) && /^\s*[-+]?\d*\.?\d+(e[-+]?\d+)?\s*$/i.test(input) ? n : undefined
  }
  return input
}
