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

/** Parses JSON text, tolerating a leading UTF-8 BOM. */
export function parseJsonText(text: string): Json {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  try {
    return JSON.parse(body) as Json
  } catch (err) {
    throw new FormatError(`Invalid JSON: ${(err as Error).message}`)
  }
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
