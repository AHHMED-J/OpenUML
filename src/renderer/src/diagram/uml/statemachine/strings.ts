/**
 * Textual notation of state machines (spec 20 §5, §6): the transition string
 * `trigger1, trigger2 [guard] / effect`, internal activity rows (`entry/Name`) and the quick-edit
 * grammar of transitions. Pure; no React or DOM.
 */
import type { OperationBuilder } from '../../../commands'
import { createElement, isKindOf, type Elem } from '../../../model'

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function namesOf(list: unknown): string[] {
  return Array.isArray(list) ? (list as Elem[]).map((e) => str(e['name'])).filter((n) => n !== '') : []
}

/** `trigger1, trigger2 [guard] / effect1, effect2` built from the parts present ('' when none). */
export function transitionText(transition: Elem | null | undefined): string {
  if (!transition) return ''
  const triggers = namesOf(transition['triggers'])
  const guard = str(transition['guard'])
  const effects = namesOf(transition['effects'])
  const parts: string[] = []
  if (triggers.length > 0) parts.push(triggers.join(', '))
  if (guard) parts.push(`[${guard}]`)
  if (effects.length > 0) parts.push(`/ ${effects.join(', ')}`)
  return parts.join(' ')
}

/** Label of a transition: `name : string`, just the string, or just the name. */
export function transitionLabel(transition: Elem | null | undefined): string {
  const text = transitionText(transition)
  const name = str(transition?.['name'])
  if (text && name) return `${name} : ${text}`
  return text || name
}

/** Internal activity rows of a state: entry, do, exit (in that order) as `entry/Name`. */
export function internalActivityRows(state: Elem | null | undefined): Array<{ readonly text: string; readonly element: Elem }> {
  const rows: Array<{ text: string; element: Elem }> = []
  const groups: ReadonlyArray<readonly [string, string]> = [
    ['entry', 'entryActivities'],
    ['do', 'doActivities'],
    ['exit', 'exitActivities']
  ]
  for (const [keyword, field] of groups) {
    const list = state?.[field]
    if (!Array.isArray(list)) continue
    for (const behavior of list as Elem[]) rows.push({ text: `${keyword}/${str(behavior['name'])}`, element: behavior })
  }
  return rows
}

/**
 * Internal transitions of a state: `kind = internal` transitions whose source is the state, kept
 * in the state's own regions or in the region containing it.
 */
export function internalTransitions(state: Elem | null | undefined): Elem[] {
  if (!state) return []
  const regions: Elem[] = Array.isArray(state['regions']) ? [...(state['regions'] as Elem[])] : []
  if (state._parent && isKindOf(state._parent, 'UMLRegion')) regions.push(state._parent)
  const out: Elem[] = []
  for (const region of regions) {
    const list = region['transitions']
    if (!Array.isArray(list)) continue
    for (const t of list as Elem[]) if (t['kind'] === 'internal' && t['source'] === state && !out.includes(t)) out.push(t)
  }
  return out
}

/** Name text of a state: `name`, or `name: Submachine` when it refers to a submachine. */
export function stateNameText(state: Elem | null | undefined, showType: boolean): string {
  const name = str(state?.['name'])
  const sub = state?.['submachine'] as Elem | null | undefined
  return showType && sub && typeof sub === 'object' ? `${name}: ${str(sub['name'])}` : name
}

// ---------------------------------------------------------------------------------------------
// Quick edit

export interface ParsedTransition {
  readonly triggers: readonly string[]
  readonly guard: string
  /** Effect name; null when the text has no `/ effect` clause. */
  readonly effect: string | null
}

export const TRANSITION_EDIT_HINT = 'trigger1, trigger2 [guard] / effect'

/**
 * Parses `trigger1, trigger2 [guard] / effect`: optional comma-separated triggers, optional
 * `[guard]`, optional `/ effect`. Tokens may not contain `[`, `]` or `/` (nor `,` in triggers).
 * Returns null on a syntax error.
 */
export function parseTransition(text: string): ParsedTransition | null {
  const slash = text.indexOf('/')
  const head = slash >= 0 ? text.slice(0, slash) : text
  const effect = slash >= 0 ? text.slice(slash + 1).trim() : null
  if (effect !== null && /[[\]/]/.test(effect)) return null
  let triggerText = head
  let guard = ''
  const open = head.indexOf('[')
  const close = head.indexOf(']')
  if (open >= 0 || close >= 0) {
    if (open < 0 || close < open) return null
    guard = head.slice(open + 1, close).trim()
    if (/[[\]]/.test(guard) || head.slice(close + 1).trim() !== '') return null
    triggerText = head.slice(0, open)
  }
  const triggers = triggerText
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
  return { triggers, guard, effect: effect === '' ? null : effect }
}

/**
 * Applies a parsed transition string: triggers are updated by position (renamed, appended,
 * surplus removed), the guard is replaced (cleared when absent), and the first effect is renamed
 * or created as an opaque behavior while surplus effects are removed.
 */
export function applyTransition(b: OperationBuilder, transition: Elem, parsed: ParsedTransition): void {
  const events = Array.isArray(transition['triggers']) ? [...(transition['triggers'] as Elem[])] : []
  parsed.triggers.forEach((name, i) => {
    const existing = events[i]
    if (existing) {
      if (existing['name'] !== name) b.set(existing, 'name', name)
    } else b.insert(transition, 'triggers', createElement('UMLEvent', { name }))
  })
  for (const surplus of events.slice(parsed.triggers.length)) b.remove(surplus)

  b.set(transition, 'guard', parsed.guard)

  const effects = Array.isArray(transition['effects']) ? [...(transition['effects'] as Elem[])] : []
  if (parsed.effect === null) {
    for (const e of effects) b.remove(e)
    return
  }
  const first = effects[0]
  if (first) {
    if (first['name'] !== parsed.effect) b.set(first, 'name', parsed.effect)
  } else b.insert(transition, 'effects', createElement('UMLOpaqueBehavior', { name: parsed.effect }))
  for (const surplus of effects.slice(1)) b.remove(surplus)
}
