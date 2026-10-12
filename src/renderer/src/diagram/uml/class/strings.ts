/**
 * Textual forms of class-diagram elements (spec 03 §4.1–4.2, §3.6): display strings drawn in
 * compartments and on edges, and the editable quick-edit notation (spec 02 §7.7).
 */
import { isKindOf, type Elem, type UMLAttribute, type UMLOperation, type UMLParameter } from '../../../model'
import { guillemets } from '../../core'
import { nameOf, stereotypeName, tagStrings, visibilitySymbol } from '../../layout/helpers'

export { VISIBILITY_SYMBOLS, visibilitySymbol, nameEditText } from '../../layout/helpers'

/** A type value (`var`): a classifier's name or the free-text type. */
export function typeText(type: unknown): string {
  if (typeof type === 'string') return type
  if (type && typeof type === 'object') return nameOf(type as Elem)
  return ''
}

export interface FeatureFormat {
  readonly showVisibility?: boolean
  readonly showType?: boolean
  readonly showMultiplicity?: boolean
  readonly showProperty?: boolean
  readonly showOperationSignature?: boolean
  /** Show `«stereotype»` prefixes (label-type stereotype display). */
  readonly showStereotype?: boolean
}

const DEFAULT_FORMAT: Required<FeatureFormat> = {
  showVisibility: true,
  showType: true,
  showMultiplicity: true,
  showProperty: true,
  showOperationSignature: true,
  showStereotype: true
}

function fmtOf(f: FeatureFormat): Required<FeatureFormat> {
  return { ...DEFAULT_FORMAT, ...f }
}

function stereoPrefix(el: Elem, f: Required<FeatureFormat>): string {
  const st = stereotypeName(el)
  return f.showStereotype && st ? `${guillemets(st)} ` : ''
}

const tagParts = tagStrings

function braces(parts: readonly string[]): string {
  return parts.length > 0 ? ` {${parts.join(', ')}}` : ''
}

/** Property flags of a structural feature: id, readOnly, ordered, unique. */
function structuralProps(el: Elem): string[] {
  const parts: string[] = []
  if (el['isID']) parts.push('id')
  if (el['isReadOnly']) parts.push('readOnly')
  if (el['isOrdered']) parts.push('ordered')
  if (el['isUnique']) parts.push('unique')
  return parts
}

/** `«st» +/name: Type[mult] = default {props}` */
export function attributeText(attr: Elem, format: FeatureFormat = {}): string {
  const f = fmtOf(format)
  const a = attr as UMLAttribute
  let s = stereoPrefix(attr, f)
  if (f.showVisibility) s += visibilitySymbol(a.visibility)
  if (a.isDerived) s += '/'
  s += nameOf(attr)
  const type = typeText(a.type)
  if (f.showType && type) s += `: ${type}`
  if (f.showMultiplicity && a.multiplicity) s += `[${a.multiplicity}]`
  if (a.defaultValue) s += ` = ${a.defaultValue}`
  if (f.showProperty) s += braces([...structuralProps(attr), ...tagParts(attr)])
  return s
}

function parameterText(p: UMLParameter, f: Required<FeatureFormat>): string {
  let s = p.direction === 'inout' ? 'inout ' : p.direction === 'out' ? 'out ' : ''
  s += nameOf(p)
  const type = typeText(p.type)
  if (f.showType && type) s += `: ${type}`
  if (f.showMultiplicity && p.multiplicity) s += `[${p.multiplicity}]`
  if (p.defaultValue) s += ` = ${p.defaultValue}`
  return s
}

function parametersOf(op: Elem): UMLParameter[] {
  const params = op['parameters']
  return Array.isArray(params) ? (params as UMLParameter[]) : []
}

/** `«st» +name(p: T, out q: U): R[mult] {query}`; `name()` without signature. */
export function operationText(op: Elem, format: FeatureFormat = {}): string {
  const f = fmtOf(format)
  const o = op as UMLOperation
  let s = stereoPrefix(op, f)
  if (f.showVisibility) s += visibilitySymbol(o.visibility)
  s += nameOf(op)
  if (!f.showOperationSignature) return `${s}()`
  const params = parametersOf(op)
  s += `(${params
    .filter((p) => p.direction !== 'return')
    .map((p) => parameterText(p, f))
    .join(', ')})`
  const ret = params.find((p) => p.direction === 'return')
  if (ret) {
    const type = typeText(ret.type)
    if (f.showType && type) s += `: ${type}`
    if (f.showMultiplicity && ret.multiplicity) s += `[${ret.multiplicity}]`
  }
  if (f.showProperty) {
    const parts: string[] = []
    if (o.isQuery) parts.push('query')
    if (ret?.isOrdered) parts.push('ordered')
    if (ret?.isUnique) parts.push('unique')
    s += braces([...parts, ...tagParts(op)])
  }
  return s
}

/** `«st» name {tags}` of an enumeration literal. */
export function literalText(literal: Elem, format: FeatureFormat = {}): string {
  const f = fmtOf(format)
  return `${stereoPrefix(literal, f)}${nameOf(literal)}${f.showProperty ? braces(tagParts(literal)) : ''}`
}

/** Reception row: `«signal» name(params)` (signature like an operation without return). */
export function receptionText(reception: Elem, format: FeatureFormat = {}): string {
  const f = fmtOf(format)
  return `${stereoPrefix(reception, f)}${f.showVisibility ? visibilitySymbol(reception['visibility']) : ''}${nameOf(reception)}()`
}

/** Property string `{leaf, tag=value}` of a classifier name compartment. */
export function classifierPropertyText(el: Elem): string {
  const parts: string[] = []
  if (el['isLeaf']) parts.push('leaf')
  if (el['isFinalSpecialization']) parts.push('final')
  return braces([...parts, ...tagParts(el)]).trim()
}

// ---------------------------------------------------------------------------------------------
// Association ends

/** Role label: `[vis]/name` (visibility only with `showVisibility`). */
export function roleNameText(end: Elem, showVisibility: boolean): string {
  const name = nameOf(end)
  if (!name) return ''
  return `${showVisibility ? visibilitySymbol(end['visibility']) : ''}${end['isDerived'] ? '/' : ''}${name}`
}

/** End property string `{id, readOnly, ordered, unique, tags}`. */
export function endPropertyText(end: Elem): string {
  return braces([...structuralProps(end), ...tagParts(end)]).trim()
}

// ---------------------------------------------------------------------------------------------
// Editable notations (quick edit)

function editStereo(el: Elem): string {
  const st = stereotypeName(el)
  return st ? `<<${st}>> ` : ''
}

/** `<<st>> vis name: Type[mult] = default` */
export function attributeEditText(attr: Elem): string {
  const a = attr as UMLAttribute
  let s = `${editStereo(attr)}${visibilitySymbol(a.visibility)}${nameOf(attr)}`
  const type = typeText(a.type)
  if (type) s += `: ${type}`
  if (a.multiplicity) s += `[${a.multiplicity}]`
  if (a.defaultValue) s += ` = ${a.defaultValue}`
  return s
}

/** `<<st>> vis name(in p: T, ...): R[mult]` */
export function operationEditText(op: Elem): string {
  const params = parametersOf(op)
  const f = fmtOf({})
  let s = `${editStereo(op)}${visibilitySymbol(op['visibility'])}${nameOf(op)}(${params
    .filter((p) => p.direction !== 'return')
    .map((p) => parameterText(p, f))
    .join(', ')})`
  const ret = params.find((p) => p.direction === 'return')
  if (ret) {
    const type = typeText(ret.type)
    if (type) s += `: ${type}`
    if (ret.multiplicity) s += `[${ret.multiplicity}]`
  }
  return s
}

/** Built-in keyword of a classifier kind («interface», «enumeration», ...), '' for plain classes. */
export function classifierKeyword(model: Elem | null | undefined): string {
  if (isKindOf(model, 'UMLEnumeration')) return 'enumeration'
  if (isKindOf(model, 'UMLPrimitiveType')) return 'primitiveType'
  if (isKindOf(model, 'UMLDataType')) return 'dataType'
  if (isKindOf(model, 'UMLInterface')) return 'interface'
  if (isKindOf(model, 'UMLSignal')) return 'signal'
  if (isKindOf(model, 'UMLInformationItem')) return 'information'
  if (isKindOf(model, 'UMLArtifact')) return 'artifact'
  if (isKindOf(model, 'UMLStereotype')) return 'stereotype'
  if (isKindOf(model, 'UMLMetaClass')) return 'metaClass'
  if (isKindOf(model, 'UMLProfile')) return 'profile'
  return ''
}
