import { describe, expect, it } from 'vitest'
import { isGerundName, parseRadName, parseRoleTitle, roleTitle } from './strings'

describe('role title', () => {
  it('joins agent and name with a hyphen and a space', () => {
    expect(roleTitle({ _type: 'RADRole', _id: 'r', _parent: null, name: 'Dictating a letter', agent: 'Boss' })).toBe('Boss- Dictating a letter')
    expect(roleTitle({ _type: 'RADRole', _id: 'r', _parent: null, name: 'Dictating a letter', agent: '' })).toBe('Dictating a letter')
    expect(roleTitle(null)).toBe('')
  })

  it('splits at the first hyphen and drops the space after it', () => {
    expect(parseRoleTitle('Boss- Dictating a letter')).toEqual({ agent: 'Boss', name: 'Dictating a letter' })
    expect(parseRoleTitle('Insurance agent-Processing an application')).toEqual({ agent: 'Insurance agent', name: 'Processing an application' })
    expect(parseRoleTitle('A- B-C')).toEqual({ agent: 'A', name: 'B-C' })
    expect(parseRoleTitle('-Waiting')).toEqual({ agent: '', name: 'Waiting' })
  })

  it('keeps the agent unchanged when there is no hyphen', () => {
    expect(parseRoleTitle('  Dictating a letter ')).toEqual({ agent: null, name: 'Dictating a letter' })
    expect(parseRoleTitle('Boss-\nDictating')).toEqual({ agent: 'Boss', name: 'Dictating' })
  })

  it('turns line breaks of element names into spaces', () => {
    expect(parseRadName(' Hand over\nthe cassette ')).toBe('Hand over the cassette')
  })
})

describe('gerund heuristic', () => {
  it('accepts a word ending in -ing, -ando, -iendo or -yendo anywhere in the name', () => {
    expect(isGerundName('Dictating a letter')).toBe(true)
    expect(isGerundName('Processing an insurance application')).toBe(true)
    expect(isGerundName('Tramitando poliza de seguro')).toBe(true)
    expect(isGerundName('Escribiendo una carta')).toBe(true)
    expect(isGerundName('Construyendo algo')).toBe(true)
    expect(isGerundName('Letter dictation, then reviewing')).toBe(true)
  })

  it('rejects other names but lets an empty name pass', () => {
    expect(isGerundName('Role1')).toBe(false)
    expect(isGerundName('Dictation of letters')).toBe(false)
    expect(isGerundName('King')).toBe(false)
    expect(isGerundName('')).toBe(true)
    expect(isGerundName('   ')).toBe(true)
  })
})
