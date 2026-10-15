import { describe, expect, it } from 'vitest'
import { nextSheetNumber } from './idef0-titleblock'

describe('nextSheetNumber', () => {
  it('is empty when the parent has no number or no numeric suffix', () => {
    expect(nextSheetNumber('', ['1', '2'])).toBe('')
    expect(nextSheetNumber('A', ['A', 'B'])).toBe('')
    expect(nextSheetNumber('   ', [])).toBe('')
  })

  it('counts up from the parent, keeping prefix and zero padding', () => {
    expect(nextSheetNumber('1', ['1'])).toBe('2')
    expect(nextSheetNumber('009', ['009'])).toBe('010')
    expect(nextSheetNumber('JD-001', ['JD-001'])).toBe('JD-002')
    expect(nextSheetNumber('C-12', ['C-12'])).toBe('C-13')
    expect(nextSheetNumber('99', [])).toBe('100')
  })

  it('takes the next free number among the sheets sharing the prefix', () => {
    expect(nextSheetNumber('1', ['1', '2', '3', ''])).toBe('4')
    expect(nextSheetNumber('JD-001', ['JD-001', 'JD-004', 'JD-002'])).toBe('JD-005')
    // Other prefixes (and numbers without digits) do not count.
    expect(nextSheetNumber('JD-001', ['JD-001', 'C-12', '40', 'X', 'jd-009'])).toBe('JD-002')
    expect(nextSheetNumber('C-12', ['JD-030', 'C-12', 'C-3'])).toBe('C-13')
    expect(nextSheetNumber('3', ['JD-030', '3', '7'])).toBe('8')
  })
})
