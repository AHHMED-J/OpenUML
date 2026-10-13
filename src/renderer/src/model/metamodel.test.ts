import { describe, expect, it } from 'vitest'
import {
  absentValue,
  containmentFields,
  fieldOf,
  formatFont,
  formatPoints,
  generateId,
  getTypeInfo,
  hasDefault,
  instantiate,
  isKindOf,
  isSubtype,
  parseFont,
  parsePoints,
  referenceFields,
  Repository,
  setExtraFields,
  typeDisplayName,
  createDefaultProject,
  type Diagram
} from '.'

describe('metamodel registry', () => {
  it('orders fields root-most superclass first', () => {
    const names = getTypeInfo('UMLClass')?.fields.map((f) => f.name) ?? []
    expect(names.slice(0, 6)).toEqual(['_id', '_parent', 'name', 'ownedElements', 'documentation', 'tags'])
    expect(names.indexOf('stereotype')).toBeLessThan(names.indexOf('attributes'))
    expect(names.at(-1)).toBe('isActive')
  })

  it('overrides re-declared fields in place', () => {
    const names = getTypeInfo('UMLAssociation')?.fields.map((f) => f.name) ?? []
    expect(names.filter((n) => n === 'end1')).toHaveLength(1)
    expect(names.indexOf('end1')).toBeLessThan(names.indexOf('stereotype'))
    expect(fieldOf(instantiate('UMLAssociation'), 'end1')?.type).toBe('UMLAssociationEnd')
  })

  it('distinguishes metamodel defaults from constructor values', () => {
    const info = getTypeInfo('UMLAssociationView')
    const lineStyle = info?.fieldMap.get('lineStyle')
    expect(lineStyle && hasDefault(lineStyle)).toBe(true)
    expect(instantiate('UMLAssociationView')['lineStyle']).toBe(1)
    expect(lineStyle && absentValue(info, lineStyle)).toBe(0)
    const parentStyle = getTypeInfo('LabelView')?.fieldMap.get('parentStyle')
    expect(parentStyle && hasDefault(parentStyle)).toBe(false)
    expect(instantiate('LabelView')['parentStyle']).toBe(true)
    expect(instantiate('UMLClassView')['parentStyle']).toBe(false)
    expect(instantiate('Project')['name']).toBe('Untitled')
    expect(instantiate('Project')['documentVersion']).toBe(1)
    expect(instantiate('UMLCombinedFragment')['interactionOperator']).toBe('seq')
    expect(instantiate('UMLClassView')['font']).toEqual({ face: 'Arial', size: 13, style: 0 })
  })

  it('answers subtype questions', () => {
    expect(isSubtype('UMLInterfaceRealization', 'UMLDependency')).toBe(true)
    expect(isSubtype('UMLAssociation', 'UndirectedRelationship')).toBe(true)
    expect(isSubtype('UMLAssociation', 'UMLModelElement')).toBe(false)
    expect(isSubtype('EdgeLabelView', 'ParasiticView')).toBe(true)
    expect(isSubtype('UMLMadeUp', 'UMLMadeUp')).toBe(true)
    expect(isKindOf(instantiate('UMLUseCaseSubject'), 'UMLClassifier')).toBe(true)
    expect(instantiate('UMLUseCaseSubject')['isIndirectlyInstantiated']).toBe(true)
    expect(typeDisplayName('UMLEnumerationLiteral')).toBe('EnumerationLiteral')
  })
})

describe('values and ids', () => {
  it('encodes fonts and points', () => {
    expect(parseFont('Arial;11.7;1')).toEqual({ face: 'Arial', size: 11.7, style: 1 })
    expect(parseFont('?;20;?', { face: 'Lato', size: 9, style: 2 })).toEqual({ face: 'Lato', size: 20, style: 2 })
    expect(formatFont({ face: 'Arial', size: 13, style: 0 })).toBe('Arial;13;0')
    expect(parsePoints('208:64;300:64;300:120')).toEqual([
      { x: 208, y: 64 },
      { x: 300, y: 64 },
      { x: 300, y: 120 }
    ])
    expect(parsePoints('')).toEqual([])
    expect(formatPoints([{ x: 1.5, y: -2 }])).toBe('1.5:-2')
  })

  it('generates 20-character base64 ids encoding the creation time', () => {
    const id = generateId(0x0190_c766_7569)
    expect(id).toMatch(/^[A-Za-z0-9+/]{19}=$/)
    expect(id.startsWith('AAAAAAGQx2Z1')).toBe(true)
    const many = new Set(Array.from({ length: 2000 }, () => generateId()))
    expect(many.size).toBe(2000)
  })
})

describe('Repository', () => {
  it('indexes the tree and answers containment queries', () => {
    const project = createDefaultProject()
    const repo = new Repository(project)
    const model = project.ownedElements[0]!
    const diagram = repo.defaultDiagram() as Diagram
    expect(repo.size).toBe(3)
    expect(diagram.name).toBe('Main')
    expect(diagram._parent).toBe(model)
    expect(repo.containmentOf(diagram)).toEqual({ owner: model, field: 'ownedElements', index: 0 })
    expect(repo.ancestors(diagram)).toEqual([model, project])
    expect(repo.isAncestor(project, diagram)).toBe(true)
    expect(repo.descendants(project).map((e) => e._type)).toEqual(['UMLModel', 'UMLClassDiagram'])
    expect(() => repo.register({ ...diagram })).toThrow(/Duplicate/)
    const id = repo.generateId()
    expect(repo.has(id)).toBe(false)
  })
})

describe('containment and reference fields', () => {
  it('are the metaclass groups, plus the extra fields of an element that has some', () => {
    const a = instantiate('UMLClass')
    const b = instantiate('UMLClass')
    expect(containmentFields(a).map((f) => f.name)).toContain('attributes')
    expect(referenceFields(a).map((f) => f.name)).not.toContain('_parent')
    expect(containmentFields(b)).toBe(containmentFields(a))
    setExtraFields(b, [
      { name: 'extraChildren', kind: 'objs', type: 'Element' },
      { name: 'extraRef', kind: 'ref', type: 'Element' }
    ])
    expect(containmentFields(b).map((f) => f.name)).toContain('extraChildren')
    expect(referenceFields(b).map((f) => f.name)).toContain('extraRef')
    expect(containmentFields(a).map((f) => f.name)).not.toContain('extraChildren')
    expect(containmentFields(instantiate('NoSuchType'))).toEqual([])
  })
})
