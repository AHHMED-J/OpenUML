/**
 * Plain-language reasons for refused editor gestures (a connection the rules do not allow, an
 * element that cannot be placed where it was drawn or dropped). The editor hands them to its
 * `onNotify` callback, which the shell shows as a toast.
 */
import { ModelRuleError, type Elem, type View } from '../../model'

/** Receives the reason a gesture was refused. */
export type RefusalHandler = (reason: string) => void

const PREFIXES = ['IDEF0', 'UML', 'RAD']

/** Readable name of a type or tool kind: `UMLInterfaceRealization` → `Interface Realization`. */
export function readableName(typeOrKind: string): string {
  let name = typeOrKind
  for (const prefix of PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length && /[A-Z]/.test(name.charAt(prefix.length))) {
      name = name.slice(prefix.length)
      break
    }
  }
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

/** What a view shows, by name: its model's type, else the view type without `View`. */
function viewName(view: View): string {
  const model = view.model as Elem | null | undefined
  if (model) return readableName(model._type)
  return readableName(view._type.replace(/View$/, ''))
}

/** `name` with its indefinite article: `an Actor`, `a Use Case`. */
export function withArticle(name: string): string {
  const an = /^[AEIOU]/i.test(name) && !/^(Use|Uni|Usa|One|Eu)/i.test(name)
  return `${an ? 'an' : 'a'} ${name}`
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Why an edge of `kind` cannot join `tail` to `head` (either may be missing: empty canvas). */
export function connectionRefusal(kind: string, tail: View | null, head: View | null): string {
  const what = capitalized(withArticle(readableName(kind)))
  if (!tail || !head) return `${what} can't start or end there`
  if (tail === head) return `${what} can't connect ${withArticle(viewName(tail))} to itself`
  return `${what} can't connect ${withArticle(viewName(tail))} to ${withArticle(viewName(head))}`
}

/** Why the ends of `edge` cannot be moved to other views. */
export function reconnectRefusal(edge: View): string {
  return `${capitalized(withArticle(viewName(edge)))} can't be reconnected`
}

/** Why a new element of `kind` cannot be created inside `host` (null: on the diagram there). */
export function placementRefusal(kind: string, host: View | null): string {
  const what = capitalized(withArticle(readableName(kind)))
  return host ? `${what} can't be placed inside ${withArticle(viewName(host))}` : `${what} can't be placed here`
}

/** Why the moved views cannot go into `host`. */
export function dropRefusal(moving: readonly View[], host: View): string {
  const what = moving.length === 1 && moving[0] ? capitalized(withArticle(viewName(moving[0]))) : 'These elements'
  return `${what} can't be placed inside ${withArticle(viewName(host))}`
}

/**
 * The reason to show for an error thrown by a refused gesture: the message of a modeling rule,
 * else `fallback`. Anything else is unexpected and is also logged.
 */
export function refusalReason(err: unknown, fallback: string): string {
  if (err instanceof ModelRuleError) return err.message
  console.error(err)
  return fallback
}
