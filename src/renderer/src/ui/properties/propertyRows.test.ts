import { describe, expect, it } from 'vitest'
import { createElement, type Elem } from '../../model'
import { fieldLabel, MULTIPLICITY_OPTIONS, parseInput, propertyRows, resolveVariant, type PropertyRow } from './propertyRows'

function row(rows: readonly PropertyRow[], key: string): PropertyRow {
  const r = rows.find((x) => x.key === key)
  if (!r) throw new Error(`missing row ${key}; have ${rows.map((x) => x.key).join(', ')}`)
  return r
}

describe('propertyRows', () => {
  it('generates UMLClass rows from the metamodel', () => {
    const cls = createElement('UMLClass', { name: 'Order', isAbstract: true })
    const rows = propertyRows([cls])
    const keys = rows.map((r) => r.key)
    expect(keys.slice(0, 3)).toEqual(['name', 'stereotype', 'visibility'])
    expect(keys).toEqual(expect.arrayContaining(['isAbstract', 'isFinalSpecialization', 'isLeaf', 'isActive']))
    // Hidden fields never appear.
    for (const hidden of ['_id', '_parent', 'documentation', 'tags', 'ownedElements', 'templateParameters', 'behaviors']) {
      expect(keys).not.toContain(hidden)
    }
    // Feature collections come last.
    const widgets = rows.map((r) => r.widget)
    expect(widgets.lastIndexOf('checkbox')).toBeLessThan(widgets.indexOf('collection'))
    expect(row(rows, 'name')).toMatchObject({ widget: 'text', value: 'Order', mixed: false, label: 'Name' })
    expect(row(rows, 'stereotype').widget).toBe('var')
    expect(row(rows, 'visibility')).toMatchObject({ widget: 'enum', options: ['public', 'protected', 'private', 'package'] })
    expect(row(rows, 'isAbstract')).toMatchObject({ widget: 'checkbox', value: true, label: 'Is Abstract' })
    expect(row(rows, 'isLeaf').advanced).toBe(true)
    expect(row(rows, 'attributes')).toMatchObject({ widget: 'collection', featureKind: 'Attribute' })
    expect(row(rows, 'operations')).toMatchObject({ widget: 'collection', featureKind: 'Operation' })
  })

  it('generates UMLAttribute rows', () => {
    const attr = createElement('UMLAttribute', { name: 'count', multiplicity: '0..1' })
    const rows = propertyRows([attr])
    expect(row(rows, 'type')).toMatchObject({ widget: 'var', type: 'UMLClassifier' })
    expect(row(rows, 'multiplicity')).toMatchObject({ widget: 'combo', value: '0..1', options: MULTIPLICITY_OPTIONS })
    expect(row(rows, 'aggregation')).toMatchObject({ widget: 'enum', options: ['none', 'shared', 'composite'] })
    expect(row(rows, 'featureDirection').advanced).toBe(true)
    expect(row(rows, 'isID').advanced).toBe(true)
    expect(row(rows, 'defaultValue').widget).toBe('text')
    expect(row(rows, 'isStatic').widget).toBe('checkbox')
  })

  it('generates UMLOperation rows', () => {
    const op = createElement('UMLOperation', { name: 'run' })
    const rows = propertyRows([op])
    expect(row(rows, 'parameters')).toMatchObject({ widget: 'collection', featureKind: 'Parameter' })
    expect(row(rows, 'raisedExceptions')).toMatchObject({ widget: 'refs', type: 'UMLClassifier' })
    expect(row(rows, 'concurrency')).toMatchObject({ widget: 'enum', advanced: true })
    expect(row(rows, 'specification').widget).toBe('textarea')
    expect(row(rows, 'isQuery').widget).toBe('checkbox')
    expect(rows.map((r) => r.key)).not.toContain('preconditions')
    expect(rows.at(-1)?.key).toBe('parameters')
  })

  it('marks relationship ends read-only and expands association ends', () => {
    const a = createElement('UMLClass', { name: 'A' })
    const b = createElement('UMLClass', { name: 'B' })
    const gen = createElement('UMLGeneralization', { source: a, target: b })
    const genRows = propertyRows([gen])
    expect(row(genRows, 'source')).toMatchObject({ widget: 'ref', readOnly: true, value: a })
    expect(row(genRows, 'discriminator').readOnly).toBe(false)

    const assoc = createElement('UMLAssociation')
    assoc['end1'] = createElement('UMLAssociationEnd', { reference: a, _parent: assoc })
    assoc['end2'] = createElement('UMLAssociationEnd', { reference: b, _parent: assoc, aggregation: 'composite' })
    const rows = propertyRows([assoc])
    expect(row(rows, 'end1.reference')).toMatchObject({ readOnly: true, section: 'end1 : UMLAssociationEnd' })
    expect(row(rows, 'end2.aggregation')).toMatchObject({ value: 'composite', targets: [assoc['end2']] })
    expect(row(rows, 'end2.multiplicity').widget).toBe('combo')
  })

  it('merges values across a multi-selection of the shared fields only', () => {
    const c1 = createElement('UMLClass', { name: 'A', isAbstract: true })
    const c2 = createElement('UMLClass', { name: 'B', isAbstract: true })
    const i1 = createElement('UMLInterface', { name: 'C', isAbstract: false })
    const rows = propertyRows([c1, c2, i1])
    expect(row(rows, 'name')).toMatchObject({ mixed: true })
    expect(row(rows, 'isAbstract')).toMatchObject({ mixed: true })
    expect(row(rows, 'visibility')).toMatchObject({ mixed: false, value: 'public' })
    expect(rows.map((r) => r.key)).not.toContain('isActive')
    expect(rows.some((r) => r.widget === 'collection')).toBe(false)
    expect(propertyRows([c1, c2]).find((r) => r.key === 'isAbstract')).toMatchObject({ mixed: false, value: true })
  })

  it('shows project and diagram rows', () => {
    const project = createElement('Project', { name: 'P' })
    expect(propertyRows([project]).map((r) => r.key)).toEqual(['name', 'author', 'company', 'copyright', 'version'])
    const diagram = createElement('UMLClassDiagram', { name: 'Main' })
    expect(propertyRows([diagram]).map((r) => r.key)).toEqual(['name', 'defaultDiagram'])
  })

  it('returns no rows for an empty selection', () => {
    expect(propertyRows([])).toEqual([])
  })
})

describe('resolveVariant', () => {
  const pkg = createElement('UMLPackage', { name: 'pkg' })
  const local = createElement('UMLClass', { name: 'Item', _parent: pkg })
  const other = createElement('UMLClass', { name: 'Item' })
  const owner = createElement('UMLClass', { name: 'Owner', _parent: pkg })
  const attr = createElement('UMLAttribute', { name: 'x', _parent: owner })
  const all: Elem[] = [pkg, other, local, owner, attr]

  it('prefers the element closest to the context namespace', () => {
    expect(resolveVariant(all, attr, 'UMLClassifier', 'Item')).toBe(local)
  })

  it('falls back to plain text, and empty text to null', () => {
    expect(resolveVariant(all, attr, 'UMLClassifier', 'int')).toBe('int')
    expect(resolveVariant(all, attr, 'UMLClassifier', '  ')).toBeNull()
  })
})

describe('helpers', () => {
  it('labels fields', () => {
    expect(fieldLabel('isAbstract')).toBe('Is Abstract')
    expect(fieldLabel('name')).toBe('Name')
  })

  it('parses numbers strictly', () => {
    expect(parseInput({ widget: 'number', type: 'Integer' }, '42')).toBe(42)
    expect(parseInput({ widget: 'number', type: 'Real' }, '1.5')).toBe(1.5)
    expect(parseInput({ widget: 'number', type: 'Integer' }, '4x')).toBeUndefined()
    expect(parseInput({ widget: 'text', type: 'String' }, 'abc')).toBe('abc')
  })
})
