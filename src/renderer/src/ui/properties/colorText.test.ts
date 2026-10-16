import { describe, expect, it } from 'vitest'
import { parseHexColor } from './colorText'

describe('typed colors', () => {
  it('accepts six- and three-digit hex colors, with or without #, in any case', () => {
    expect(parseHexColor('#C0C0C0')).toBe('#c0c0c0')
    expect(parseHexColor('c0c0c0')).toBe('#c0c0c0')
    expect(parseHexColor('  #fA0 ')).toBe('#ffaa00')
    expect(parseHexColor('abc')).toBe('#aabbcc')
  })

  it('rejects anything else', () => {
    for (const bad of ['', '#', '#12', '#1234', '#12345g', 'red', 'rgb(0,0,0)', '#c0c0c0;', '##c0c0c0']) expect(parseHexColor(bad)).toBeNull()
  })
})
