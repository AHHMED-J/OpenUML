/**
 * Colors read from files (`fillColor`, `lineColor`, `fontColor`) end up in SVG `fill`/`stroke`
 * attributes, on screen and in exported SVG files. Only plain color syntax is let through, so a
 * file cannot smuggle `url(...)` references to external resources or other CSS into a drawing.
 */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*[0-9.,%\s/+-]*(?:deg)?[0-9.,%\s/+-]*\)$/i
const NAMED = /^[a-z]{3,30}$/i

/** True for `#rgb[a]`, `#rrggbb[aa]`, `rgb()/rgba()/hsl()/hsla()` with numbers, and color keywords. */
export function isCssColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && (HEX.test(value) || NAMED.test(value) || FUNCTIONAL.test(value))
}

/** `value` when it is a plain color (see `isCssColor`), else `fallback`. */
export function cssColorOr(value: unknown, fallback: string): string {
  return isCssColor(value) ? value : fallback
}
