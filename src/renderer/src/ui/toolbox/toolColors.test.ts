import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EDGE_KINDS } from '../../model'
import { PALETTES } from './palettes'
import { TOOL_COLORS, toolColor } from './toolColors'

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8')
/** Custom properties of the light (`:root`) and dark (`:root[data-theme='dark']`) blocks. */
function tokens(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return new Map([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1] as string, (m[2] as string).toLowerCase()]))
}
const light = tokens(':root')
const dark = new Map([...light, ...tokens(":root[data-theme='dark']")])

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('toolbox colors', () => {
  it('gives every tool of every palette a color, one shared by all relationships', () => {
    for (const group of PALETTES) {
      for (const item of group.items) {
        const color = toolColor(item.kind)
        expect(TOOL_COLORS).toContain(color)
        expect(color === 'connection').toBe(item.kind in EDGE_KINDS)
      }
    }
    expect(toolColor('Class')).toBe('classifier')
    expect(toolColor('Actor')).toBe('usecase')
    expect(toolColor('IDEF0Function')).toBe('behavior')
    expect(toolColor('RADRole')).toBe('package')
    expect(toolColor('Note')).toBe('note')
  })

  it('keeps the tool colors readable on the panels in both themes (3:1)', () => {
    for (const theme of [light, dark]) {
      for (const color of TOOL_COLORS) {
        const value = theme.get(`--tool-${color}`) as string
        expect(value, color).toBeDefined()
        for (const bg of ['--surface', '--surface-alt', '--panel-header', '--hover', '--selection']) {
          expect(contrast(value, theme.get(bg) as string), `${color} on ${bg}`).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('keeps text readable on the lighter dark panels (4.5:1)', () => {
    for (const text of ['--text', '--text-muted']) {
      for (const bg of ['--bg', '--surface', '--surface-alt', '--panel-header']) {
        expect(contrast(dark.get(text) as string, dark.get(bg) as string), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
