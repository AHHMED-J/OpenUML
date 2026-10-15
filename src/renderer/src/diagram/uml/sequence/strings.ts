/**
 * Textual forms of sequence-diagram elements (spec 03 §4.4, spec 02 §7.7): lifeline header text,
 * message labels, and the quick-edit notations of lifelines, messages and operand guards.
 *
 *   lifeline  [«st»] [vis] name [[selector]] [: Type]        e.g. `c[1] : Customer`
 *   message   [«st»] [target =] name [(arguments)]           e.g. `r = getTotal(order)`
 *   guard     [condition] | condition
 *
 * Parsers return null on a syntax error (the edit is then rejected).
 */
import { isKindOf, stringField, type Elem, type UMLParameter } from '../../../model'
import { parseQuickEditPrefix } from '../../editor/quickEditSyntax'
import { nameOf, stereotypeName, visibilitySymbol } from '../../layout/helpers'
import { typeText } from '../class/strings'

// ---------------------------------------------------------------------------------------------
// Lifelines

/** The lifeline's type: the type of the role it represents (an element or a free-text type), else null. */
export function lifelineType(lifeline: Elem | null | undefined): unknown {
  const role = lifeline?.['represent'] as Elem | null | undefined
  const type = role?.['type']
  return type === undefined || type === '' ? null : type
}

/** `name[selector]: Type` as drawn in the lifeline header. */
export function lifelineHeaderText(lifeline: Elem | null | undefined): string {
  if (!lifeline) return ''
  const selector = stringField(lifeline, 'selector')
  const type = typeText(lifelineType(lifeline))
  return `${nameOf(lifeline)}${selector ? `[${selector}]` : ''}${type ? `: ${type}` : ''}`
}

/** Editable notation `<<st>> [vis]name[selector]: Type` (visibility only when not public). */
export function lifelineEditText(lifeline: Elem | null | undefined): string {
  if (!lifeline) return ''
  const st = stereotypeName(lifeline)
  const vis = lifeline['visibility'] && lifeline['visibility'] !== 'public' ? visibilitySymbol(lifeline['visibility']) : ''
  return `${st ? `<<${st}>> ` : ''}${vis}${lifelineHeaderText(lifeline)}`
}

// ---------------------------------------------------------------------------------------------
// Messages

export interface MessageLabelOptions {
  /** Sequence number to show ('' = none). */
  readonly sequenceNumber: string
  /** Show arguments / the signature's parameters and return type. */
  readonly showSignature: boolean
}

function parametersOf(op: Elem): UMLParameter[] {
  const params = op['parameters']
  return Array.isArray(params) ? (params as UMLParameter[]) : []
}

function parameterText(p: UMLParameter): string {
  const dir = p.direction === 'inout' ? 'inout ' : p.direction === 'out' ? 'out ' : ''
  const type = typeText(p.type)
  return `${dir}${nameOf(p)}${type ? `: ${type}` : ''}`
}

/** The name a message shows: its signature's name when it has one, else its own name. */
export function messageDisplayName(message: Elem): string {
  const sig = message['signature'] as Elem | null | undefined
  return sig ? nameOf(sig) : nameOf(message)
}

/**
 * Message label (spec 03 §4.4): `seq [guard] *[iteration] : target = name(args): Return`.
 * The `: ` follows the prefix only when a prefix is present; without a body only the prefix is
 * shown (e.g. `4` on an unnamed reply).
 */
export function messageLabelText(message: Elem | null | undefined, options: MessageLabelOptions): string {
  if (!message) return options.sequenceNumber
  let prefix = ''
  if (options.sequenceNumber) prefix += `${options.sequenceNumber} `
  const guard = stringField(message, 'guard')
  if (guard) prefix += `[${guard}] `
  const iteration = stringField(message, 'iteration')
  if (iteration) prefix += `${message['isConcurrentIteration'] === true ? '*||' : '*'}[${iteration}] `

  let body = ''
  const target = stringField(message, 'assignmentTarget')
  if (target) body += `${target} = `
  body += messageDisplayName(message)
  if (options.showSignature) {
    const sig = message['signature'] as Elem | null | undefined
    const op = isKindOf(sig, 'UMLOperation') ? sig : null
    const args = stringField(message, 'arguments')
    if (args) body += `(${args})`
    else if (op) body += `(${parametersOf(op).filter((p) => p.direction !== 'return').map(parameterText).join(', ')})`
    const ret = op ? parametersOf(op).find((p) => p.direction === 'return') : undefined
    const retType = ret ? typeText(ret.type) : ''
    if (retType) body += `: ${retType}`
  }
  if (!body) return prefix.trimEnd()
  return prefix ? `${prefix}: ${body}` : body
}

/** Editable notation `<<st>> target = name(arguments)`. */
export function messageEditText(message: Elem | null | undefined): string {
  if (!message) return ''
  const st = stereotypeName(message)
  const target = stringField(message, 'assignmentTarget')
  const args = stringField(message, 'arguments')
  return `${st ? `<<${st}>> ` : ''}${target ? `${target} = ` : ''}${messageDisplayName(message)}${args ? `(${args})` : ''}`
}

// ---------------------------------------------------------------------------------------------
// Quick-edit parsers

const NAME_FORBIDDEN = /[:()=<>[\]]/

export interface ParsedLifeline {
  readonly stereotype: string | null
  readonly visibility: string | null
  /** May be empty (anonymous lifeline `: Type`). */
  readonly name: string
  readonly selector: string
  /** Type name, null when absent (clears it). */
  readonly type: string | null
}

/** `[«st»] [vis] name [[selector]] [: Type]` */
export function parseLifeline(text: string): ParsedLifeline | null {
  const p = parseQuickEditPrefix(text)
  if (!p) return null
  let rest = p.rest
  const nameMatch = /^[^[:]*/.exec(rest)
  const name = (nameMatch?.[0] ?? '').trim()
  if (NAME_FORBIDDEN.test(name)) return null
  rest = rest.slice(nameMatch?.[0].length ?? 0).trim()
  let selector = ''
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']')
    if (close < 0) return null
    selector = rest.slice(1, close).trim()
    rest = rest.slice(close + 1).trim()
  }
  let type: string | null = null
  if (rest.startsWith(':')) {
    type = rest.slice(1).trim() || null
    if (type && /[:()=<>[\]]/.test(type)) return null
    rest = ''
  }
  if (rest !== '') return null
  return { stereotype: p.stereotype, visibility: p.visibility, name, selector, type }
}

export interface ParsedMessage {
  readonly stereotype: string | null
  /** '' when absent. */
  readonly assignmentTarget: string
  /** May be empty (replies). */
  readonly name: string
  /** Free text between the parentheses ('' when absent). */
  readonly arguments: string
}

/** `[«st»] [target =] name [(arguments)]` */
export function parseMessage(text: string): ParsedMessage | null {
  const p = parseQuickEditPrefix(text, { visibility: false })
  if (!p) return null
  let rest = p.rest
  const open = rest.indexOf('(')
  const eq = rest.indexOf('=')
  let assignmentTarget = ''
  if (eq >= 0 && (open < 0 || eq < open)) {
    assignmentTarget = rest.slice(0, eq).trim()
    if (!assignmentTarget || NAME_FORBIDDEN.test(assignmentTarget)) return null
    rest = rest.slice(eq + 1).trim()
  }
  let name = rest
  let args = ''
  const o = rest.indexOf('(')
  if (o >= 0) {
    const close = rest.lastIndexOf(')')
    if (close < o || rest.slice(close + 1).trim() !== '') return null
    name = rest.slice(0, o)
    args = rest.slice(o + 1, close).trim()
  }
  name = name.trim()
  if (NAME_FORBIDDEN.test(name)) return null
  return { stereotype: p.stereotype, assignmentTarget, name, arguments: args }
}

/** Guard text without its brackets: `[x > 0]` and `x > 0` both give `x > 0`. */
export function parseGuard(text: string): string {
  const t = text.trim()
  return t.startsWith('[') && t.endsWith(']') ? t.slice(1, -1).trim() : t
}

export const SEQUENCE_EDIT_HINTS = {
  lifeline: '<<stereotype>> name [selector] : type',
  message: '<<stereotype>> target = name (arguments)',
  guard: '[condition]'
} as const
