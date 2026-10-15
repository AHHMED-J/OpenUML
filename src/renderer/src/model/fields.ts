/**
 * Defensive field reads: a field may be missing or hold another shape in files written by other
 * tools, so readers fall back to an empty list or string instead of failing.
 */
import type { Elem } from './types'

/** The element list in `el[field]` (empty when absent or not a list). */
export function listField(el: Elem | null | undefined, field: string): Elem[] {
  const value = el?.[field]
  return Array.isArray(value) ? (value as Elem[]) : []
}

/** The string in `el[field]` (empty when absent or not a string). */
export function stringField(el: Elem | null | undefined, field: string): string {
  const value = el?.[field]
  return typeof value === 'string' ? value : ''
}

/** The elements `el` owns through `ownedElements`. */
export function ownedElementsOf(el: Elem | null | undefined): Elem[] {
  return listField(el, 'ownedElements')
}
