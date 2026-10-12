/**
 * Text helpers of the RAD notation: the role header (`Agent- Role name`), its parser and the
 * gerund check behind the soft `role-gerund` warning.
 */
import { nameOf } from '../layout/helpers'
import type { Elem } from '../../model'

/** Header text of a role: `agent- name` (just the name when there is no agent). */
export function roleTitle(role: Elem | null | undefined): string {
  const name = nameOf(role)
  const agent = typeof role?.['agent'] === 'string' ? role['agent'].trim() : ''
  return agent ? `${agent}- ${name}` : name
}

export interface ParsedRoleTitle {
  /** `null` when the text has no hyphen: the agent stays as it is. */
  readonly agent: string | null
  readonly name: string
}

/** Placeholder text of the role title editor. */
export const ROLE_TITLE_HINT = 'Agent- Role name'

/** Splits `Agent- Role name` at the first hyphen (an optional space after it is dropped). */
export function parseRoleTitle(text: string): ParsedRoleTitle {
  const oneLine = text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  const i = oneLine.indexOf('-')
  if (i < 0) return { agent: null, name: oneLine }
  return { agent: oneLine.slice(0, i).trim(), name: oneLine.slice(i + 1).trim() }
}

/** Placeholder text of the single-line name editor of elements. */
export const RAD_NAME_HINT = 'Name'

/** Single-line value of an element name edit (line breaks become spaces). */
export function parseRadName(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

const GERUND_WORD = /(ando|iendo|yendo|ing)$/i

/**
 * Whether a role name looks like a gerund phrase: any word ending in Spanish `-ando`, `-iendo`,
 * `-yendo` or English `-ing`. An empty name passes (nothing to warn about yet). Heuristic only.
 */
export function isGerundName(name: string): boolean {
  const words = name.split(/[^\p{L}]+/u).filter((w) => w !== '')
  if (words.length === 0) return true
  return words.some((w) => w.length >= 5 && GERUND_WORD.test(w))
}
