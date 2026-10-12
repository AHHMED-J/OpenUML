import { describe, expect, it } from 'vitest'
import { cssFont, cssFontFamily, isBold, isItalic, parseFont, parsePoints, scaleFont, serializeFont, serializePoints, withFontStyle } from './formats'
import { DEFAULT_FONT, FontStyle } from './style'

describe('points string', () => {
  it('parses the .mdj format', () => {
    expect(parsePoints('208:64;300:64;300:120')).toEqual([
      { x: 208, y: 64 },
      { x: 300, y: 64 },
      { x: 300, y: 120 }
    ])
  })

  it('treats empty input as no points', () => {
    expect(parsePoints('')).toEqual([])
    expect(parsePoints(undefined)).toEqual([])
    expect(parsePoints(null)).toEqual([])
    expect(parsePoints('  ')).toEqual([])
  })

  it('accepts negatives, decimals, whitespace and a trailing separator; skips malformed parts', () => {
    expect(parsePoints(' -5:2.5 ; 10:-3;')).toEqual([
      { x: -5, y: 2.5 },
      { x: 10, y: -3 }
    ])
    expect(parsePoints('1:2;bad;3:x;:4;5:6')).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 6 }
    ])
  })

  it('round-trips', () => {
    const s = '200:62;360:62;360:-10'
    expect(serializePoints(parsePoints(s))).toBe(s)
    expect(serializePoints([])).toBe('')
    expect(serializePoints([{ x: -0, y: 1.5 }])).toBe('0:1.5')
  })
})

describe('font string', () => {
  it('parses face, size and style', () => {
    expect(parseFont('Arial;13;1')).toEqual({ face: 'Arial', size: 13, style: FontStyle.Bold })
    expect(parseFont('Times New Roman;11.7;3')).toEqual({ face: 'Times New Roman', size: 11.7, style: 3 })
  })

  it('keeps base values for "?" and invalid parts', () => {
    const base = { face: 'Lato', size: 20, style: FontStyle.Italic }
    expect(parseFont('?;?;?', base)).toEqual(base)
    expect(parseFont('?;14;?', base)).toEqual({ face: 'Lato', size: 14, style: 2 })
    expect(parseFont('Arial;abc;9', base)).toEqual({ face: 'Arial', size: 20, style: 2 })
    expect(parseFont('', base)).toEqual(base)
    expect(parseFont(undefined)).toEqual(DEFAULT_FONT)
    expect(parseFont('Inter')).toEqual({ face: 'Inter', size: 13, style: 0 })
  })

  it('round-trips', () => {
    for (const s of ['Arial;13;0', 'Arial;11.7;0', 'Source Code Pro;12;3']) {
      expect(serializeFont(parseFont(s))).toBe(s)
    }
  })

  it('derives styles and sizes', () => {
    const f = parseFont('Arial;13;3')
    expect(isBold(f)).toBe(true)
    expect(isItalic(f)).toBe(true)
    expect(withFontStyle(f, false, true).style).toBe(FontStyle.Italic)
    expect(withFontStyle(f, false, false).style).toBe(FontStyle.Normal)
    expect(scaleFont(f, 0.9).size).toBeCloseTo(11.7)
  })

  it('builds CSS font strings', () => {
    expect(cssFont(parseFont('Arial;13;0'))).toBe('13px Arial, sans-serif')
    expect(cssFont(parseFont('Arial;13;3'), false)).toBe('italic bold 13px Arial')
    expect(cssFont(parseFont('Times New Roman;12;1'))).toBe('bold 12px "Times New Roman", sans-serif')
    expect(cssFontFamily('My "Font"', false)).toBe('"My \\"Font\\""')
  })
})
