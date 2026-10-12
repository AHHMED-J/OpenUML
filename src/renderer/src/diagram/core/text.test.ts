import { describe, expect, it } from 'vitest'
import { CanvasTextMeasurer, FixedWidthTextMeasurer, createTextMeasurer, layoutText, measureLines, splitLines, wrapText } from './text'
import { FontStyle, type Font } from './style'

const font: Font = { face: 'Arial', size: 10, style: FontStyle.Normal }
const m = new FixedWidthTextMeasurer() // 6 units per character at size 10

describe('FixedWidthTextMeasurer', () => {
  it('is deterministic, with height = font size', () => {
    expect(m.measure('abcde', font)).toEqual({ width: 30, height: 10 })
    expect(m.measure('', font)).toEqual({ width: 0, height: 10 })
    expect(m.measure('ab', { ...font, style: FontStyle.Bold }).width).toBeCloseTo(13.2)
  })
})

describe('CanvasTextMeasurer', () => {
  it('measures with the CSS font and caches results', () => {
    let calls = 0
    const ctx = {
      font: '',
      measureText(text: string) {
        calls++
        return { width: text.length * 7 }
      }
    }
    const cm = new CanvasTextMeasurer(ctx)
    expect(cm.measure('abc', { face: 'Arial', size: 13, style: FontStyle.Bold })).toEqual({ width: 21, height: 13 })
    expect(ctx.font).toBe('bold 13px Arial, sans-serif')
    cm.measure('abc', { face: 'Arial', size: 13, style: FontStyle.Bold })
    expect(calls).toBe(1)
    cm.clearCache()
    cm.measure('abc', { face: 'Arial', size: 13, style: FontStyle.Bold })
    expect(calls).toBe(2)
  })

  it('falls back to the fixed-width measurer without a canvas', () => {
    expect(createTextMeasurer()).toBeInstanceOf(FixedWidthTextMeasurer)
  })
})

describe('wrapText', () => {
  it('fills lines greedily on single spaces', () => {
    expect(wrapText('aaa bbb ccc', 45, font, m)).toEqual(['aaa bbb', 'ccc'])
    expect(wrapText('aaa bbb ccc', 66, font, m)).toEqual(['aaa bbb ccc'])
    expect(wrapText('aaa bbb ccc', 10, font, m)).toEqual(['aaa', 'bbb', 'ccc'])
  })

  it('keeps over-long words whole', () => {
    expect(wrapText('abcdefghij x', 30, font, m)).toEqual(['abcdefghij', 'x'])
  })

  it('respects newlines and empty lines', () => {
    expect(wrapText('a\n\nb c', 1000, font, m)).toEqual(['a', '', 'b c'])
    expect(splitLines('a\r\nb\rc')).toEqual(['a', 'b', 'c'])
  })
})

describe('measureLines / layoutText', () => {
  it('uses the widest line and lineHeight per line', () => {
    expect(measureLines(['ab', 'abcd'], font, m)).toEqual({ width: 24, height: 20 })
    expect(measureLines(['ab', 'abcd'], font, m, 12)).toEqual({ width: 24, height: 24 })
  })

  it('wraps only when a width is given', () => {
    expect(layoutText('aaa bbb', font, m).lines).toEqual(['aaa bbb'])
    const r = layoutText('aaa bbb', font, m, { maxWidth: 30 })
    expect(r).toEqual({ lines: ['aaa', 'bbb'], size: { width: 18, height: 20 } })
    expect(layoutText('aaa bbb', font, m, { maxWidth: 30, wrap: false }).lines).toEqual(['aaa bbb'])
  })
})
