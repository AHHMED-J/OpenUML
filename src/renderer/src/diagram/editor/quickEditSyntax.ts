/**
 * Quick-edit textual notation parsers (spec 02 §7.7). Whitespace is free everywhere; a
 * stereotype is written `<<name>>` (or `«name»`); visibility is `+` `#` `-` `~`.
 *
 *   name       [«st»] [vis] name
 *   attribute  [«st»] [vis] name [: type] [[mult]] [= default]
 *   operation  [«st»] [vis] name ( [params] ) [: returnType] [[mult]]
 *   parameter  [in|out|inout] name [: type] [[mult]] [= default]
 *
 * Parsers return `null` on a syntax error (the edit is then rejected).
 */

export const VISIBILITY_BY_SYMBOL: Readonly<Record<string, string>> = {
  '+': 'public',
  '#': 'protected',
  '-': 'private',
  '~': 'package'
}

export interface ParsedName {
  /** Stereotype name, null when absent (clears it). */
  readonly stereotype: string | null
  /** Visibility literal, null when absent. */
  readonly visibility: string | null
  readonly name: string
}

export interface ParsedAttribute extends ParsedName {
  /** Type text, null when absent (clears it). */
  readonly type: string | null
  /** Multiplicity ('' when absent or `[]`). */
  readonly multiplicity: string
  readonly defaultValue: string
}

export interface ParsedParameter {
  readonly direction: 'in' | 'out' | 'inout'
  readonly name: string
  readonly type: string | null
  readonly multiplicity: string
  readonly defaultValue: string
}

export interface ParsedOperation extends ParsedName {
  /** Parameters in order; null when the text has no parentheses (parameters are left unchanged). */
  readonly parameters: readonly ParsedParameter[] | null
  readonly returnType: string | null
  readonly returnMultiplicity: string
}

/** Characters a name may not contain. */
const NAME_FORBIDDEN = /[:()=<>]/

export interface QuickEditPrefix {
  readonly stereotype: string | null
  readonly visibility: string | null
  readonly rest: string
}

/**
 * Splits the leading `<<st>>` / `«st»` stereotype and, unless `visibility` is false, the
 * visibility symbol off quick-edit text. Null when a stereotype is left unclosed.
 */
export function parseQuickEditPrefix(text: string, { visibility: withVisibility = true }: { visibility?: boolean } = {}): QuickEditPrefix | null {
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
  const v = rest.charAt(0)
  if (withVisibility && v in VISIBILITY_BY_SYMBOL) {
    visibility = VISIBILITY_BY_SYMBOL[v] ?? null
    rest = rest.slice(1).trim()
  }
  return { stereotype, visibility, rest }
}

/** `[«st»] [vis] name`. The name may be empty (unnamed relationships). */
export function parseName(text: string): ParsedName | null {
  const p = parseQuickEditPrefix(text)
  if (!p || NAME_FORBIDDEN.test(p.rest)) return null
  return { stereotype: p.stereotype, visibility: p.visibility, name: p.rest }
}

const MULT = /^\[\s*([0-9.*\s]*?)\s*\]/

/** Parses the `[: type] [[mult]] [= default]` tail of a feature or parameter. */
function featureTail(text: string): { type: string | null; multiplicity: string; defaultValue: string } | null {
  let rest = text.trim()
  let type: string | null = null
  if (rest.startsWith(':')) {
    const m = /^:\s*([^[=]*)/.exec(rest)
    type = (m?.[1] ?? '').trim() || null
    rest = rest.slice(m?.[0].length ?? 1).trim()
  }
  let multiplicity = ''
  if (rest.startsWith('[')) {
    const m = MULT.exec(rest)
    if (!m) return null
    multiplicity = (m[1] ?? '').replace(/\s+/g, '')
    rest = rest.slice(m[0].length).trim()
  }
  let defaultValue = ''
  if (rest.startsWith('=')) {
    defaultValue = rest.slice(1).trim()
    rest = ''
  }
  if (rest !== '') return null
  return { type, multiplicity, defaultValue }
}

function splitName(text: string): { name: string; rest: string } {
  const m = /^([^:[=(]*)/.exec(text)
  const name = (m?.[1] ?? '').trim()
  return { name, rest: text.slice(m?.[0].length ?? 0) }
}

/** `[«st»] [vis] name [: type] [[mult]] [= default]`; the name is required. */
export function parseAttribute(text: string): ParsedAttribute | null {
  const p = parseQuickEditPrefix(text)
  if (!p) return null
  const { name, rest } = splitName(p.rest)
  if (!name || NAME_FORBIDDEN.test(name)) return null
  const tail = featureTail(rest)
  if (!tail) return null
  return { stereotype: p.stereotype, visibility: p.visibility, name, ...tail }
}

/** `[in|out|inout] name [: type] [[mult]] [= default]` */
export function parseParameter(text: string): ParsedParameter | null {
  let rest = text.trim()
  let direction: ParsedParameter['direction'] = 'in'
  const d = /^(inout|in|out)\s+/.exec(rest)
  if (d) {
    direction = d[1] as ParsedParameter['direction']
    rest = rest.slice(d[0].length)
  }
  const { name, rest: after } = splitName(rest)
  if (!name || NAME_FORBIDDEN.test(name)) return null
  const tail = featureTail(after)
  if (!tail) return null
  return { direction, name, ...tail }
}

/** Splits on commas that are not nested in brackets/parentheses/angle brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '<') depth++
    else if (ch === ')' || ch === ']' || ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** `[«st»] [vis] name ( [params] ) [: returnType] [[mult]]` */
export function parseOperation(text: string): ParsedOperation | null {
  const p = parseQuickEditPrefix(text)
  if (!p) return null
  const open = p.rest.indexOf('(')
  if (open < 0) {
    // No parameter list: name (and optionally a return type) only.
    const { name, rest } = splitName(p.rest)
    if (!name || NAME_FORBIDDEN.test(name)) return null
    const tail = featureTail(rest)
    if (!tail || tail.defaultValue) return null
    return { stereotype: p.stereotype, visibility: p.visibility, name, parameters: null, returnType: tail.type, returnMultiplicity: tail.multiplicity }
  }
  const name = p.rest.slice(0, open).trim()
  if (!name || NAME_FORBIDDEN.test(name)) return null
  const close = p.rest.lastIndexOf(')')
  if (close < open) return null
  const inner = p.rest.slice(open + 1, close).trim()
  const parameters: ParsedParameter[] = []
  if (inner !== '') {
    for (const part of splitTopLevel(inner)) {
      const param = parseParameter(part)
      if (!param) return null
      parameters.push(param)
    }
  }
  const tail = featureTail(p.rest.slice(close + 1))
  if (!tail || tail.defaultValue) return null
  return {
    stereotype: p.stereotype,
    visibility: p.visibility,
    name,
    parameters,
    returnType: tail.type,
    returnMultiplicity: tail.multiplicity
  }
}

/** Input hints (placeholder texts). */
export const QUICK_EDIT_HINTS = {
  name: '<<stereotype>> name',
  attribute: '<<stereotype>> name : type [multiplicity] = value',
  operation: '<<stereotype>> name (param1 : type1 [multiplicity] = default1, param2, ...) : returnType',
  literal: '<<stereotype>> name'
} as const
