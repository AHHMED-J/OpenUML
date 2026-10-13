/**
 * Soft validation of a RAD process (spec 10 section 4.6). Warnings never block saving or editing
 * and nothing is corrected automatically. Pure: reads the model, plus element positions through the
 * optional `position` callback (the checks that depend on the drawing are skipped without it).
 */
import { isKindOf, type Elem } from '../../model'
import { isGerundName } from './strings'

export type RadWarningCode =
  | 'role-gerund'
  | 'main-flow-left'
  | 'interaction-unlinked'
  | 'interaction-same-role'
  | 'branch-unattached'
  | 'refinement-lonely'
  | 'dead-end'
  | 'part-no-merge'
  | 'case-unconditional'

type RadWarningLevel = 'soft' | 'hint' | 'blocked'

export interface RadWarning {
  readonly code: RadWarningCode
  readonly level: RadWarningLevel
  /** The element the warning is about (a role, an element or an interaction link). */
  readonly elementId: string
  readonly message: string
}

/** Centre of an element's symbol in the diagram, when it is drawn. */
type RadPositionOf = (element: Elem) => { readonly x: number; readonly y: number } | null

export interface RadValidationOptions {
  readonly position?: RadPositionOf
}

const MESSAGES: Readonly<Record<RadWarningCode, string>> = {
  'role-gerund': 'A role name usually describes an action (for example "processing an order").',
  'main-flow-left': 'The main flow of a role is expected on its left side.',
  'interaction-unlinked': 'This interaction is not linked to another role or to an outside party.',
  'interaction-same-role': 'An interaction link must join two different roles.',
  'branch-unattached': 'This path is not attached to a matching refinement.',
  'refinement-lonely': 'A refinement needs at least two paths.',
  'dead-end': 'The thread stops here although other elements follow below.',
  'part-no-merge': 'The parallel paths never meet again, but all of them must finish.',
  'case-unconditional': 'This alternative has no condition.'
}

const LEVELS: Readonly<Record<RadWarningCode, RadWarningLevel>> = {
  'role-gerund': 'soft',
  'main-flow-left': 'soft',
  'interaction-unlinked': 'soft',
  'interaction-same-role': 'blocked',
  'branch-unattached': 'soft',
  'refinement-lonely': 'soft',
  'dead-end': 'hint',
  'part-no-merge': 'soft',
  'case-unconditional': 'soft'
}

function warn(code: RadWarningCode, element: Elem): RadWarning {
  return { code, level: LEVELS[code], elementId: element._id, message: MESSAGES[code] }
}

function list(el: Elem, field: string): Elem[] {
  const value = el[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

function roleOf(el: Elem | null | undefined): Elem | null {
  return el && isKindOf(el._parent, 'RADRole') ? el._parent : null
}

/** Elements reachable from `from` by following the state lines of its role (excluding `from`). */
function reachableFrom(role: Elem, from: Elem): Set<Elem> {
  const lines = list(role, 'stateLines')
  const seen = new Set<Elem>()
  const queue: Elem[] = [from]
  while (queue.length > 0) {
    const cur = queue.pop() as Elem
    for (const l of lines) {
      const next = l['target'] as Elem | null
      if (l['source'] === cur && next && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

function branchesOf(role: Elem, refinement: Elem): Elem[] {
  return list(role, 'elements').filter((e) => isKindOf(e, 'RADBranch') && e['refinement'] === refinement)
}

function roleWarnings(role: Elem, options: RadValidationOptions, out: RadWarning[]): void {
  const name = typeof role['name'] === 'string' ? role['name'].trim() : ''
  if (name !== '' && !isGerundName(name)) out.push(warn('role-gerund', role))

  const elements = list(role, 'elements')
  const lines = list(role, 'stateLines')
  const position = options.position
  if (position) {
    // The first element of the thread (no incoming line, not a branch) is expected in the leftmost column.
    const placed = elements.map((e) => ({ e, p: position(e) })).filter((x): x is { e: Elem; p: { x: number; y: number } } => x.p !== null)
    const starts = placed.filter((x) => !isKindOf(x.e, 'RADBranch') && !lines.some((l) => l['target'] === x.e))
    const first = starts.sort((a, b) => a.p.y - b.p.y)[0]
    if (first && placed.length > 0) {
      const leftmost = Math.min(...placed.map((x) => x.p.x))
      if (first.p.x > leftmost + 8) out.push(warn('main-flow-left', first.e))
    }
  }

  for (const e of elements) {
    if (isKindOf(e, 'RADInteraction')) {
      const process = role._parent
      const linked = list(process ?? role, 'interactions').some((l) => l['source'] === e || l['target'] === e)
      const external = typeof e['externalParty'] === 'string' && e['externalParty'].trim() !== ''
      if (!linked && !external) out.push(warn('interaction-unlinked', e))
    }
    if (isKindOf(e, 'RADBranch')) {
      const r = e['refinement'] as Elem | null
      const wanted = isKindOf(e, 'RADCaseBranch') ? 'RADCaseRefinement' : 'RADPartRefinement'
      if (!r || !isKindOf(r, wanted) || r._parent !== role) out.push(warn('branch-unattached', e))
      if (isKindOf(e, 'RADCaseBranch') && (typeof e['name'] !== 'string' || e['name'].trim() === '')) out.push(warn('case-unconditional', e))
    }
    if (isKindOf(e, 'RADRefinement')) {
      const branches = branchesOf(role, e)
      if (branches.length < 2) out.push(warn('refinement-lonely', e))
      if (isKindOf(e, 'RADPartRefinement') && branches.length >= 2) {
        const reaches = branches.map((b) => reachableFrom(role, b))
        const [firstReach, ...restReach] = reaches as [Set<Elem>, ...Set<Elem>[]]
        const common = [...firstReach].filter((x) => restReach.every((r) => r.has(x)))
        if (common.length === 0) out.push(warn('part-no-merge', e))
      }
    }
    if (position && !isKindOf(e, 'RADRefinement') && !(isKindOf(e, 'RADStateMarker') && e['kind'] === 'end')) {
      const p = position(e)
      if (p && !lines.some((l) => l['source'] === e)) {
        const below = elements.some((o) => {
          if (o === e) return false
          const q = position(o)
          return q !== null && Math.abs(q.x - p.x) <= 12 && q.y > p.y + 4
        })
        if (below) out.push(warn('dead-end', e))
      }
    }
  }
}

/** All warnings of a process, roles first. */
export function radWarnings(process: Elem, options: RadValidationOptions = {}): RadWarning[] {
  const out: RadWarning[] = []
  for (const role of list(process, 'roles')) roleWarnings(role, options, out)
  for (const link of list(process, 'interactions')) {
    const a = roleOf(link['source'] as Elem | null)
    const b = roleOf(link['target'] as Elem | null)
    if (a && a === b) out.push(warn('interaction-same-role', link))
  }
  return out
}

/** The warnings of `radWarnings` grouped by the element they are about. */
export function radWarningsByElement(process: Elem, options: RadValidationOptions = {}): Map<string, RadWarning[]> {
  const map = new Map<string, RadWarning[]>()
  for (const w of radWarnings(process, options)) {
    const list = map.get(w.elementId)
    if (list) list.push(w)
    else map.set(w.elementId, [w])
  }
  return map
}
