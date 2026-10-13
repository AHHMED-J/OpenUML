export type Json = null | boolean | number | string | Json[] | JsonObject
export interface JsonObject {
  [key: string]: Json
}

export class FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormatError'
  }
}

/**
 * Deepest nesting of arrays/objects accepted in a file (about 250 levels of nested elements).
 * Real models stay far below it; it keeps hostile files from overflowing the stack of the
 * recursive reader, serializer and views.
 */
export const MAX_JSON_DEPTH = 512

/**
 * Parses JSON text, tolerating a leading UTF-8 BOM. The text is untrusted (files, clipboard):
 * nesting deeper than `MAX_JSON_DEPTH` is rejected and `__proto__` keys are removed, so no
 * later copy or assignment of the parsed objects can change an object's prototype.
 */
export function parseJsonText(text: string): Json {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  let value: Json
  try {
    value = JSON.parse(body) as Json
  } catch (err) {
    throw new FormatError(`Invalid JSON: ${(err as Error).message.slice(0, 200)}`)
  }
  sanitizeParsedJson(value)
  return value
}

/** Removes own `__proto__` keys and checks the nesting depth, without recursion. */
export function sanitizeParsedJson(root: Json): void {
  const stack: Array<[Json, number]> = [[root, 0]]
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [Json, number]
    if (typeof value !== 'object' || value === null) continue
    if (depth >= MAX_JSON_DEPTH) throw new FormatError(`The file nests data deeper than ${MAX_JSON_DEPTH} levels`)
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'object' && item !== null) stack.push([item, depth + 1])
      continue
    }
    if (Object.prototype.hasOwnProperty.call(value, '__proto__')) delete value['__proto__']
    for (const key in value) {
      const item = value[key]
      if (typeof item === 'object' && item !== null) stack.push([item, depth + 1])
    }
  }
}

/**
 * Names that must not become element fields, IDs or type names: `Object.prototype` members
 * (`__proto__`, `constructor`, `toString`, ...) and `prototype`. Assigning them on plain objects
 * changes the prototype or shadows methods the app relies on.
 */
export function isReservedName(name: string): boolean {
  return name === 'prototype' || name in Object.prototype
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `{"$ref": "<id>"}` */
export function isRefJson(value: unknown): value is { $ref: string } {
  return isJsonObject(value) && typeof value['$ref'] === 'string'
}

/** An element object: has a string `_type`. */
export function isElementJson(value: unknown): value is JsonObject & { _type: string } {
  return isJsonObject(value) && typeof value['_type'] === 'string'
}

/** Pretty-prints with one TAB per level and no trailing newline (the `.mdj` house style). */
export function stringifyJson(value: Json): string {
  return JSON.stringify(value, null, '\t')
}

export function cloneJson<T extends Json>(value: T): T {
  return structuredClone(value)
}
