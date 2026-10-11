import { describe, expect, it } from 'vitest'
import { associationEndSpec, guillemets, messageNotation, relationshipNotation } from './notation'

describe('association ends', () => {
  it('follows the navigability x aggregation table', () => {
    expect(associationEndSpec()).toEqual({ style: 'flat' })
    expect(associationEndSpec({ navigable: 'navigable' })).toEqual({ style: 'stickArrow' })
    expect(associationEndSpec({ navigable: 'notNavigable' })).toEqual({ style: 'cross' })
    expect(associationEndSpec({ aggregation: 'shared' })).toEqual({ style: 'diamond' })
    expect(associationEndSpec({ aggregation: 'composite' })).toEqual({ style: 'filledDiamond' })
    expect(associationEndSpec({ navigable: 'navigable', aggregation: 'shared' })).toEqual({ style: 'arrowDiamond' })
    expect(associationEndSpec({ navigable: 'navigable', aggregation: 'composite' })).toEqual({ style: 'arrowFilledDiamond' })
    expect(associationEndSpec({ navigable: 'notNavigable', aggregation: 'composite' })).toEqual({ style: 'filledDiamond' })
  })

  it('adds the dot for owned ends', () => {
    expect(associationEndSpec({ ownedByOpposite: true })).toEqual({ style: 'flat', dot: true })
    expect(associationEndSpec({ navigable: 'notNavigable', ownedByOpposite: true })).toEqual({ style: 'cross', dot: true })
  })
})

describe('relationship notation', () => {
  it('maps end1 to the tail and end2 to the head', () => {
    const n = relationshipNotation('association', { end1: { aggregation: 'composite' }, end2: { navigable: 'navigable' } })
    expect(n).toEqual({ dash: 'solid', tail: { style: 'filledDiamond' }, head: { style: 'stickArrow' } })
  })

  it('covers the relationship table', () => {
    expect(relationshipNotation('generalization')).toMatchObject({ dash: 'solid', head: { style: 'triangle' }, tail: { style: 'flat' } })
    expect(relationshipNotation('dependency')).toMatchObject({ dash: 'dot', head: { style: 'stickArrow' } })
    expect(relationshipNotation('realization')).toMatchObject({ dash: 'dot', head: { style: 'triangle' } })
    expect(relationshipNotation('interfaceRealization')).toMatchObject({ dash: 'dot', head: { style: 'triangle' } })
    expect(relationshipNotation('include')).toMatchObject({ dash: 'dot', head: { style: 'stickArrow' }, fixedKeyword: 'include' })
    expect(relationshipNotation('extend')).toMatchObject({ dash: 'dot', head: { style: 'stickArrow' }, fixedKeyword: 'extend' })
    expect(relationshipNotation('controlFlow')).toMatchObject({ dash: 'solid', head: { style: 'stickArrow' } })
    expect(relationshipNotation('objectFlow')).toMatchObject({ dash: 'solid', head: { style: 'stickArrow' } })
    expect(relationshipNotation('noteLink')).toMatchObject({ dash: 'dot', head: { style: 'flat' }, tail: { style: 'flat' } })
    expect(relationshipNotation('associationClassLink')).toMatchObject({ dash: 'dot', head: { style: 'flat' } })
    expect(relationshipNotation('containment')).toMatchObject({ dash: 'solid', head: { style: 'circlePlus' } })
  })

  it('draws lines into a lollipop interface solid without arrowheads', () => {
    expect(relationshipNotation('interfaceRealization', { headIsLollipop: true })).toMatchObject({ dash: 'solid', head: { style: 'flat' } })
    expect(relationshipNotation('dependency', { headIsLollipop: true })).toMatchObject({ dash: 'solid', head: { style: 'flat' } })
  })
})

describe('message notation', () => {
  it('maps message sorts', () => {
    expect(messageNotation('synchCall')).toMatchObject({ dash: 'solid', head: { style: 'solidArrow' }, activation: true })
    expect(messageNotation('asynchCall')).toMatchObject({ dash: 'solid', head: { style: 'stickArrow' }, activation: true })
    expect(messageNotation('asynchSignal')).toMatchObject({ dash: 'solid', head: { style: 'stickArrow' }, activation: false })
    expect(messageNotation('reply')).toMatchObject({ dash: 'dot', head: { style: 'stickArrow' } })
    expect(messageNotation('createMessage')).toMatchObject({ dash: 'dot', fixedKeyword: 'create' })
    expect(messageNotation('deleteMessage')).toMatchObject({ dash: 'solid', head: { style: 'solidArrow' }, fixedKeyword: 'destroy' })
  })

  it('wraps keywords in guillemets', () => {
    expect(guillemets('include')).toBe('«include»')
  })
})
