/** `.mfj` model fragments: a single element subtree exported from / imported into a project. */
import { generateId, type Elem } from '../model'
import { serializeElement } from './codec'
import { FormatError, isElementJson, isJsonObject, parseJsonText, stringifyJson, type Json, type JsonObject } from './json'

/** Serializes `el` and its subtree as a fragment. Its `_parent` ref points at the original owner. */
export function writeFragment(el: Elem): string {
  return stringifyJson(serializeElement(el))
}

/** Parses fragment text and returns the root element JSON. Throws `FormatError` when invalid. */
export function parseFragment(text: string): JsonObject {
  const json = parseJsonText(text)
  if (!isElementJson(json)) throw new FormatError('Not a model fragment: the root must be an element')
  return json
}

/** Element trees with fresh IDs, and the old to new ID of every element in them. */
export interface RemappedTrees {
  readonly roots: JsonObject[]
  readonly ids: ReadonlyMap<string, string>
}

/**
 * Returns deep copies of element trees in which every `_id` is replaced by a fresh one and every
 * `{"$ref"}` to an element inside any of the trees is rewritten, plus the old to new ID map.
 * References to elements outside the trees (including the roots' `_parent`) are left unchanged.
 * The input may come from untrusted text: run it through `parseJsonText` first (depth limit, no
 * `__proto__` keys); keys that would change an object's prototype are dropped here as well.
 */
export function remapTreeIds(roots: readonly JsonObject[], newId: () => string = generateId): RemappedTrees {
  const ids = new Map<string, string>()
  const collect = (value: Json): void => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (isJsonObject(value)) {
      if (typeof value['_type'] === 'string' && typeof value['_id'] === 'string' && !ids.has(value['_id'])) {
        ids.set(value['_id'], newId())
      }
      Object.values(value).forEach(collect)
    }
  }
  const rewrite = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(rewrite)
    if (!isJsonObject(value)) return value
    const out: JsonObject = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === '__proto__') continue
      if ((key === '_id' || key === '$ref') && typeof v === 'string') out[key] = ids.get(v) ?? v
      else out[key] = rewrite(v)
    }
    return out
  }
  roots.forEach(collect)
  return { roots: roots.map((r) => rewrite(r) as JsonObject), ids }
}

/** `remapTreeIds` for a single element subtree (a fragment); returns the copy. */
export function remapIds(root: JsonObject, newId: () => string = generateId): JsonObject {
  return remapTreeIds([root], newId).roots[0] as JsonObject
}
