/**
 * Textual forms of object-diagram elements (spec 23 §5, §6): the instance label `name: Type`,
 * slot rows, and the quick-edit notations of instances and slots.
 *
 *   object  [«st»] [vis] name [: type]
 *   slot    [«st»] [vis] name [: type] [= value]
 *
 * Parsers return null on a syntax error (the edit is then rejected).
 */
import type { Elem } from '../../../model'
import { guillemets } from '../../core'
import { nameOf, stereotypeName, visibilitySymbol } from '../../layout/helpers'
import { typeText } from '../class/strings'

function str(el: Elem | null | undefined, field: string): string {
  const v = el?.[field]
  return typeof v === 'string' ? v : ''
}

/** The classifier of an instance: its name, or the raw string stored as `classifier`. */
function instanceTypeText(instance: Elem | null | undefined): string {
  return typeText(instance?.['classifier'])
}

/** `name: Type` (or just `name`, or `: Type` for an anonymous instance). */
export function instanceLabelText(instance: Elem | null | undefined, showType = true): string {
  if (!instance) return ''
  const name = nameOf(instance)
  const type = showType ? instanceTypeText(instance) : ''
  return type ? `${name}: ${type}` : name
}

/** Editable notation `<<st>> [vis]name: Type` (visibility only when not public). */
export function instanceEditText(instance: Elem | null | undefined): string {
  if (!instance) return ''
  const st = stereotypeName(instance)
  const vis = instance['visibility'] && instance['visibility'] !== 'public' ? visibilitySymbol(instance['visibility']) : ''
  return `${st ? `<<${st}>> ` : ''}${vis}${instanceLabelText(instance)}`
}

export interface SlotFormat {
  readonly showVisibility?: boolean
  readonly showType?: boolean
  readonly showProperty?: boolean
  readonly showStereotype?: boolean
}

/** Name, type and multiplicity of a slot: from its defining attribute when set, else its own fields. */
function slotParts(slot: Elem): { name: string; type: string; multiplicity: string } {
  const feature = slot['definingFeature'] as Elem | null | undefined
  if (feature) return { name: nameOf(feature), type: typeText(feature['type']), multiplicity: str(feature, 'multiplicity') }
  return { name: nameOf(slot), type: typeText(slot['type']), multiplicity: '' }
}

function tagParts(el: Elem): string[] {
  const tags = el['tags']
  if (!Array.isArray(tags)) return []
  return (tags as Elem[]).filter((t) => !t['hidden']).map((t) => `${nameOf(t)}=${String(t['value'] ?? '')}`)
}

/** `«st» +name: Type[mult] = value {tags}` */
export function slotText(slot: Elem, format: SlotFormat = {}): string {
  const f = { showVisibility: true, showType: true, showProperty: true, showStereotype: true, ...format }
  const st = stereotypeName(slot)
  const { name, type, multiplicity } = slotParts(slot)
  let s = f.showStereotype && st ? `${guillemets(st)} ` : ''
  if (f.showVisibility) s += visibilitySymbol(slot['visibility'])
  s += name
  if (f.showType && type) s += `: ${type}${multiplicity ? `[${multiplicity}]` : ''}`
  const value = str(slot, 'value')
  if (value) s += ` = ${value}`
  if (f.showProperty) {
    const tags = tagParts(slot)
    if (tags.length > 0) s += ` {${tags.join(', ')}}`
  }
  return s
}

/** Editable notation of a slot: `<<st>> vis name: type = value` (own fields). */
export function slotEditText(slot: Elem): string {
  const st = stereotypeName(slot)
  const vis = slot['visibility'] && slot['visibility'] !== 'public' ? visibilitySymbol(slot['visibility']) : ''
  const { name, type } = slotParts(slot)
  const value = str(slot, 'value')
  return `${st ? `<<${st}>> ` : ''}${vis}${name}${type ? `: ${type}` : ''}${value ? ` = ${value}` : ''}`
}

// ---------------------------------------------------------------------------------------------
// Parsers

const VISIBILITY: Readonly<Record<string, string>> = { '+': 'public', '#': 'protected', '-': 'private', '~': 'package' }
const NAME_FORBIDDEN = /[:=<>[\]()]/

function prefix(text: string): { stereotype: string | null; visibility: string | null; rest: string } | null {
  let rest = text.trim()
  let stereotype: string | null = null
  const st = /^(?:<<([^>]*)>>|«([^»]*)»)/.exec(rest)
  if (st) {
    stereotype = (st[1] ?? st[2] ?? '').trim() || null
    rest = rest.slice(st[0].length).trim()
  } else if (rest.startsWith('<<') || rest.startsWith('«')) {
    return null
  }
  let visibility: string | null = null
  const v = VISIBILITY[rest.charAt(0)]
  if (v) {
    visibility = v
    rest = rest.slice(1).trim()
  }
  return { stereotype, visibility, rest }
}

export interface ParsedObject {
  readonly stereotype: string | null
  readonly visibility: string | null
  /** May be empty (anonymous instance `: Type`). */
  readonly name: string
  /** Classifier name, null when absent (clears it). */
  readonly type: string | null
}

/** `[«st»] [vis] name [: type]` */
export function parseObject(text: string): ParsedObject | null {
  const p = prefix(text)
  if (!p) return null
  const colon = p.rest.indexOf(':')
  const name = (colon < 0 ? p.rest : p.rest.slice(0, colon)).trim()
  if (NAME_FORBIDDEN.test(name)) return null
  const type = colon < 0 ? null : p.rest.slice(colon + 1).trim() || null
  if (type && NAME_FORBIDDEN.test(type)) return null
  return { stereotype: p.stereotype, visibility: p.visibility, name, type }
}

export interface ParsedSlot extends ParsedObject {
  /** '' when absent (clears it). */
  readonly value: string
}

/** `[«st»] [vis] name [: type] [= value]` */
export function parseSlot(text: string): ParsedSlot | null {
  const p = prefix(text)
  if (!p) return null
  let rest = p.rest
  let value = ''
  const eq = rest.indexOf('=')
  if (eq >= 0) {
    value = rest.slice(eq + 1).trim()
    rest = rest.slice(0, eq)
  }
  const colon = rest.indexOf(':')
  const name = (colon < 0 ? rest : rest.slice(0, colon)).trim()
  if (!name || NAME_FORBIDDEN.test(name)) return null
  const type = colon < 0 ? null : rest.slice(colon + 1).trim() || null
  if (type && NAME_FORBIDDEN.test(type)) return null
  return { stereotype: p.stereotype, visibility: p.visibility, name, type, value }
}

export const OBJECT_EDIT_HINTS = {
  object: '<<stereotype>> name : type',
  slot: '<<stereotype>> name : type = value'
} as const
