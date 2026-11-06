import { describe, expect, it } from 'vitest'
import { IDEF0_ROLE_COLORS } from '../idef0/colors'
import { COLORS } from './style'
import { DARK_CANVAS, LIGHT_CANVAS, canvasPalette, contrastRatio, hueOf, readableOn, toCanvasColor, type CanvasColorRole } from './canvasPalette'

const dark = (color: string, role: CanvasColorRole): string => toCanvasColor(color, role, 'dark')

describe('toCanvasColor', () => {
  it('leaves every color alone on the light canvas', () => {
    for (const c of ['#000000', '#ffffff', '#123456', 'none', 'rebeccapurple']) expect(toCanvasColor(c, 'fill', 'light')).toBe(c)
  })

  it('turns the defaults into the palette, near black and near white instead of pure ones', () => {
    expect(dark(COLORS.fill, 'fill')).toBe('#1b1f27')
    expect(dark(COLORS.edgeBackground, 'background')).toBe('#0f1115')
    expect(dark(COLORS.line, 'line')).toBe('#e8e8e8')
    expect(dark(COLORS.font, 'font')).toBe('#e8e8e8')
    expect(dark('white', 'fill')).toBe('#1b1f27')
    expect(dark('rgb(0, 0, 0)', 'line')).toBe('#e8e8e8')
  })

  it('keeps the default pairs readable', () => {
    const text = dark(COLORS.font, 'font')
    expect(contrastRatio(text, dark(COLORS.fill, 'fill'))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(text, DARK_CANVAS.background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(dark(COLORS.line, 'line'), DARK_CANVAS.grid)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(DARK_CANVAS.grid, DARK_CANVAS.background)).toBeLessThan(1.5)
  })

  it('inverts lightness and keeps the hue of painted colors', () => {
    for (const color of ['#ffcc00', '#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#fde2e4', '#003049', '#e67e22', '#00ffff']) {
      for (const role of ['fill', 'line', 'font'] as const) {
        const hue = hueOf(color) as number
        const out = hueOf(dark(color, role))
        if (out === null) continue
        const gap = Math.abs(hue - out)
        expect(Math.min(gap, 360 - gap), `${color} as ${role}`).toBeLessThan(6)
      }
    }
    // A pale box turns dark, a dark box light.
    expect(contrastRatio(dark('#fff3b0', 'fill'), '#000000')).toBeLessThan(contrastRatio('#fff3b0', '#000000'))
    expect(contrastRatio(dark('#14213d', 'fill'), '#000000')).toBeGreaterThan(contrastRatio('#14213d', '#000000'))
  })

  it('lifts dark ink until it reads on a box, like the IDEF0 role colors', () => {
    for (const color of Object.values(IDEF0_ROLE_COLORS)) {
      expect(contrastRatio(dark(color, 'line'), dark(COLORS.fill, 'fill')), color).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reads the color syntaxes files may hold and keeps their transparency', () => {
    expect(dark('#fff', 'fill')).toBe('#1b1f27')
    expect(dark('#00000080', 'line')).toMatch(/^#[0-9a-f]{6}80$/)
    expect(dark('hsl(0, 0%, 100%)', 'fill')).toBe('#1b1f27')
    expect(dark('rgba(255, 0, 0, 0.5)', 'fill')).toMatch(/^#[0-9a-f]{6}80$/)
  })

  it('returns what it cannot read as it is', () => {
    expect(dark('none', 'fill')).toBe('none')
    expect(dark('transparent', 'fill')).toBe('transparent')
    expect(dark('#00000000', 'line')).toBe('#00000000')
  })
})

describe('readableOn', () => {
  it('keeps text that reads and moves text that does not, either way', () => {
    expect(readableOn('#e8e8e8', '#1b1f27')).toBe('#e8e8e8')
    expect(contrastRatio(readableOn('#555555', '#1b1f27'), '#1b1f27')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(readableOn('#aaaaaa', '#e8e8e8'), '#e8e8e8')).toBeGreaterThanOrEqual(4.5)
    expect(readableOn('#123456', 'none')).toBe('#123456')
  })
})

describe('canvasPalette', () => {
  it('gives the light canvas the colors it always had', () => {
    expect(canvasPalette('light')).toBe(LIGHT_CANVAS)
    expect(LIGHT_CANVAS).toMatchObject({ background: '#ffffff', grid: '#e0e0e0', glow: null })
    expect(canvasPalette('dark')).toBe(DARK_CANVAS)
  })
})
