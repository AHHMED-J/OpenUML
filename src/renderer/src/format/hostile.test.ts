/**
 * Hostile `.mdj` / clipboard input: files come from other people, so loading one must never
 * change prototypes, hang the app in a containment cycle or overflow the stack.
 */
import { describe, expect, it } from 'vitest'
import { parseClipboard } from '../diagram/clipboard'
import { importFragment, ModelEngine } from '../commands'
import { walk, type Elem } from '../model'
import { FormatError, MAX_JSON_DEPTH, parseJsonText, readMdj, writeMdj } from '.'

const PROTO_KEYS = '"__proto__":{"_type":"UMLInterface","_id":"X","polluted":true,"isAbstract":true}'

function ownerChainLength(el: Elem): number {
  let n = 0
  for (let p: Elem | null = el; p; p = p._parent) if (++n > 1000) return Infinity
  return n
}

describe('hostile .mdj files', () => {
  it('ignores a _parent on the project, so owner chains end (no infinite loops)', () => {
    const text = JSON.stringify({
      _type: 'Project',
      _id: 'P',
      _parent: { $ref: 'M' },
      ownedElements: [{ _type: 'UMLModel', _id: 'M', _parent: { $ref: 'P' }, ownedElements: [{ _type: 'UMLClass', _id: 'C', _parent: { $ref: 'M' } }] }]
    })
    const { project, warnings, repository } = readMdj(text)
    expect(project._parent).toBeNull()
    expect(ownerChainLength(repository.get('C') as Elem)).toBe(3)
    expect(warnings).toContain('Ignored the _parent of the project')
    expect(writeMdj(project)).not.toContain('"_parent": {\n\t\t"$ref": "M"')
  })

  it('drops __proto__ keys: no prototype change on elements and no global pollution', () => {
    const text = `{"_type":"Project","_id":"P",${PROTO_KEYS},"ownedElements":[{"_type":"UMLClass","_id":"C","_parent":{"$ref":"P"},${PROTO_KEYS},"attributes":[{"_type":"UMLAttribute","_id":"A","_parent":{"$ref":"C"},"extra":{${PROTO_KEYS}}}]}]}`
    const { project } = readMdj(text)
    for (const el of walk(project)) expect(Object.getPrototypeOf(el)).toBe(Object.prototype)
    const cls = project.ownedElements[0] as Elem
    expect(cls['polluted']).toBeUndefined()
    expect(cls['isAbstract']).toBe(false)
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
    expect(writeMdj(project)).not.toContain('__proto__')
  })

  it('ignores Object.prototype member names as fields, IDs and types', () => {
    const text = JSON.stringify({
      _type: 'Project',
      _id: 'P',
      ownedElements: [
        { _type: 'UMLClass', _id: 'constructor', _parent: { $ref: 'P' }, toString: 'x', hasOwnProperty: 1, valueOf: { $ref: 'P' }, prototype: {} },
        { _type: 'toString', _id: 'T', _parent: { $ref: 'P' } },
        { _type: 'UMLClass', _id: 'D', _parent: { $ref: 'P' }, superclass: { $ref: 'constructor' } }
      ]
    })
    const { project, repository } = readMdj(text)
    const [cls, other] = project.ownedElements as Elem[]
    expect(cls?._id).not.toBe('constructor')
    expect(`${String(cls?.toString())}`).toBe('[object Object]')
    expect(Object.prototype.hasOwnProperty.call(cls, 'hasOwnProperty')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(cls, 'prototype')).toBe(false)
    expect(other?._id).toBe('D')
    expect(repository.get('T')).toBeUndefined()
    expect(project.ownedElements).toHaveLength(2)
  })

  it('rejects data nested deeper than the limit with a FormatError (no stack overflow)', () => {
    const deep = (n: number): string => `{"_type":"Project","_id":"P","x":${'['.repeat(n)}${']'.repeat(n)}}`
    expect(() => readMdj(deep(100_000))).toThrow(FormatError)
    expect(() => readMdj(deep(MAX_JSON_DEPTH - 5))).not.toThrow()
    let el = '{"_type":"UMLPackage","_id":"leaf"}'
    for (let i = 0; i < 5000; i++) el = `{"_type":"UMLPackage","_id":"p${i}","ownedElements":[${el}]}`
    expect(() => readMdj(`{"_type":"Project","_id":"P","ownedElements":[${el}]}`)).toThrow(/deeper than/)
  })

  it('keeps hostile strings as plain data', () => {
    const name = '<script>alert(1)</script><img src=x onerror=alert(1)> javascript:alert(1)'
    const text = JSON.stringify({ _type: 'Project', _id: 'P', ownedElements: [{ _type: 'UMLClass', _id: 'C', _parent: { $ref: 'P' }, name, documentation: name }] })
    const { project } = readMdj(text)
    expect((project.ownedElements[0] as Elem)['name']).toBe(name)
  })

  it('treats $ref values named like prototype members as unresolved references', () => {
    const text = JSON.stringify({
      _type: 'Project',
      _id: 'P',
      ownedElements: [{ _type: 'UMLClass', _id: 'C', _parent: { $ref: 'P' }, superclass: { $ref: '__proto__' }, owner: { $ref: 'hasOwnProperty' } }]
    })
    const { project } = readMdj(text)
    const cls = project.ownedElements[0] as Elem
    expect(cls['superclass'] ?? null).toBeNull()
  })
})

describe('parseJsonText', () => {
  it('removes __proto__ keys at every level and keeps other data', () => {
    const value = parseJsonText('{"a":[{"__proto__":{"x":1},"b":2}],"__proto__":{"y":1}}') as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(false)
    const inner = (value['a'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>
    expect(Object.keys(inner)).toEqual(['b'])
    expect(inner['x']).toBeUndefined()
  })

  it('reports invalid JSON as a FormatError with a bounded message', () => {
    expect(() => parseJsonText(`{"a": ${'x'.repeat(10_000)}`)).toThrow(FormatError)
    try {
      parseJsonText(`{"a": ${'x'.repeat(10_000)}`)
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(250)
    }
  })
})

describe('hostile clipboard and fragments', () => {
  it('rejects deeply nested clipboard text and strips __proto__ from accepted payloads', () => {
    expect(parseClipboard(`{"format":"x","v":${'['.repeat(100_000)}${']'.repeat(100_000)}}`)).toBeNull()
    const payload = parseClipboard(
      JSON.stringify({ format: 'openuml/views', version: 1, diagramType: 'UMLClassDiagram', views: [{ _type: 'UMLClassView', _id: 'v' }], outerRefs: [], bounds: null }).replace(
        '"_id":"v"',
        `"_id":"v",${PROTO_KEYS}`
      )
    )
    if (payload) for (const v of payload.views) expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
  })

  it('imports a fragment whose root claims a descendant as its parent under the chosen owner', () => {
    const engine = new ModelEngine(readMdj(JSON.stringify({ _type: 'Project', _id: 'P', ownedElements: [{ _type: 'UMLModel', _id: 'M', _parent: { $ref: 'P' } }] })).repository)
    const owner = engine.repository.get('M') as Elem
    const fragment = JSON.stringify({ _type: 'UMLPackage', _id: 'F', _parent: { $ref: 'G' }, ownedElements: [{ _type: 'UMLPackage', _id: 'G', _parent: { $ref: 'F' } }] })
    const root = importFragment(engine, fragment, owner)
    expect(root._parent).toBe(owner)
    expect(ownerChainLength(root)).toBe(3)
  })
})
