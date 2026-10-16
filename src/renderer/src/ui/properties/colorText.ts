/**
 * Colors typed or pasted as text in the Style editor: `#RRGGBB` or `#RGB`, with or without the
 * `#`, any case. Stored as lowercase `#rrggbb` (the form .mdj files use).
 */

/** The color `text` stands for as `#rrggbb`, or null when it is not a hex color. */
export function parseHexColor(text: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())
  if (!m) return null
  const hex = (m[1] as string).toLowerCase()
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex}`
}
