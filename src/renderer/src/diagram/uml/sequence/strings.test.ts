import { describe, expect, it } from 'vitest'
import { createElement } from '../../../model'
import { messageLabelText, parseGuard, parseLifeline, parseMessage } from './strings'

describe('sequence quick-edit parsers', () => {
  it('parse lifelines', () => {
    expect(parseLifeline('c[1] : Customer')).toEqual({ stereotype: null, visibility: null, name: 'c', selector: '1', type: 'Customer' })
    expect(parseLifeline('<<boundary>> -ui')).toEqual({ stereotype: 'boundary', visibility: 'private', name: 'ui', selector: '', type: null })
    expect(parseLifeline(': Server')).toMatchObject({ name: '', type: 'Server' })
    expect(parseLifeline('a[1')).toBeNull()
    expect(parseLifeline('a(b)')).toBeNull()
    expect(parseLifeline('a : B : C')).toBeNull()
  })

  it('parse messages', () => {
    expect(parseMessage('r = getTotal(order)')).toEqual({ stereotype: null, assignmentTarget: 'r', name: 'getTotal', arguments: 'order' })
    expect(parseMessage('<<async>> notify')).toEqual({ stereotype: 'async', assignmentTarget: '', name: 'notify', arguments: '' })
    expect(parseMessage('set(a = 1, f(x))')).toEqual({ stereotype: null, assignmentTarget: '', name: 'set', arguments: 'a = 1, f(x)' })
    expect(parseMessage('')).toMatchObject({ name: '' })
    expect(parseMessage('call(x) y')).toBeNull()
    expect(parseMessage('= call')).toBeNull()
  })

  it('parse guards', () => {
    expect(parseGuard(' [x > 0] ')).toBe('x > 0')
    expect(parseGuard('else')).toBe('else')
  })
})

describe('message labels', () => {
  it('prefix guard and iteration before the colon', () => {
    const m = createElement('UMLMessage', { name: 'poll', guard: 'ready', iteration: 'i < 3' })
    expect(messageLabelText(m, { sequenceNumber: '2', showSignature: true })).toBe('2 [ready] *[i < 3] : poll')
    m['isConcurrentIteration'] = true
    expect(messageLabelText(m, { sequenceNumber: '', showSignature: true })).toBe('[ready] *||[i < 3] : poll')
    const reply = createElement('UMLMessage', { name: '', messageSort: 'reply' })
    expect(messageLabelText(reply, { sequenceNumber: '4', showSignature: true })).toBe('4')
  })
})
