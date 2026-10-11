import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isKindOf, type Elem, type UMLAttribute, type UMLClassifierView, type UMLGeneralEdgeView } from '../model'
import { FormatError, readMdj, remapIds, validateModel, writeMdj, type JsonObject } from '.'

const exampleText = readFileSync(new URL('./fixtures/example.mdj', import.meta.url), 'utf8')

/** Re-serializes parsed JSON so comparisons include key order but not whitespace. */
const canonical = (text: string): string => JSON.stringify(JSON.parse(text))

function project(ownedElements: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ _type: 'Project', _id: 'p', name: 'P', ownedElements, documentVersion: 1, ...extra })
}

describe('readMdj / writeMdj', () => {
  it('round-trips the spec example exactly (keys, order, values)', () => {
    const { project: root, warnings } = readMdj(exampleText)
    expect(warnings).toEqual([])
    const written = writeMdj(root)
    expect(canonical(written)).toBe(canonical(exampleText))
  })

  it('writes TAB indentation, no trailing newline, literal non-ASCII', () => {
    const { project: root } = readMdj(exampleText)
    root.name = 'Ex «sample»'
    const written = writeMdj(root)
    expect(written.split('\n')[1]).toBe('\t"_type": "Project",')
    expect(written.endsWith('}')).toBe(true)
    expect(written).toContain('«sample»')
  })

  it('tolerates a leading BOM', () => {
    const { project: root } = readMdj('﻿' + exampleText)
    expect(root.name).toBe('Example')
  })

  it('assigns metamodel defaults to omitted fields (compact files)', () => {
    const { repository } = readMdj(exampleText)
    const view = repository.get('ex-v-customer') as UMLClassifierView
    expect(view.visible).toBe(true)
    expect(view.lineColor).toBe('#000000')
    expect(view.fillColor).toBe('#ffffff')
    expect(view.suppressReceptions).toBe(true)
    expect(view.stereotypeDisplay).toBe('label')
    expect(view.autoResize).toBe(false)
    const attr = repository.get('ex-attr-name') as UMLAttribute
    expect(attr.visibility).toBe('public')
    expect(attr.isStatic).toBe(false)
    expect(attr.multiplicity).toBe('')
    const end1 = repository.get('ex-assoc-end1') as Elem
    expect(end1['navigable']).toBe('unspecified')
    expect(end1['aggregation']).toBe('none')
    const nameLabel = repository.get('ex-v-customer-nm') as Elem
    expect(nameLabel['horizontalAlignment']).toBe(2)
    expect(nameLabel['font']).toEqual({ face: 'Arial', size: 13, style: 1 })
    // EdgeView.lineStyle: absent means the metamodel default 0, even though new edges use 1.
    const assoc = repository.get('ex-v-assoc') as UMLGeneralEdgeView
    expect(assoc.lineStyle).toBe(1)
    expect(assoc.points).toEqual([
      { x: 200, y: 62 },
      { x: 360, y: 62 }
    ])
  })

  it('reads the verbose (all fields) style and writes it back compact', () => {
    const { project: root } = readMdj(exampleText)
    const verbose = writeMdj(root, { verbose: true })
    expect(verbose).toContain('"visibility": "public"')
    expect(verbose).toContain('"lineColor": "#000000"')
    const reread = readMdj(verbose)
    expect(reread.warnings).toEqual([])
    expect(canonical(writeMdj(reread.project))).toBe(canonical(exampleText))
  })

  it('treats null primitives as defaults (older writers)', () => {
    const text = project([
      {
        _type: 'UMLModel',
        _id: 'm',
        _parent: { $ref: 'p' },
        name: 'M',
        visibility: null,
        documentation: null,
        ownedElements: [{ _type: 'UMLClass', _id: 'c', _parent: { $ref: 'm' }, name: 'C', isAbstract: null }]
      }
    ])
    const { repository } = readMdj(text)
    expect(repository.get('m')?.['visibility']).toBe('public')
    expect(repository.get('c')?.['isAbstract']).toBe(false)
  })

  it('resolves references (forward and backward) to element objects', () => {
    const { repository } = readMdj(exampleText)
    const customer = repository.get('ex-customer')
    const order = repository.get('ex-order')
    const customerView = repository.get('ex-v-customer') as UMLClassifierView
    const assocView = repository.get('ex-v-assoc') as UMLGeneralEdgeView
    expect(customerView.model).toBe(customer)
    expect(customerView.nameCompartment).toBe(repository.get('ex-v-customer-nc'))
    expect(customerView.nameCompartment?._parent).toBe(customerView)
    expect(assocView.head).toBe(repository.get('ex-v-order'))
    expect(assocView.tail).toBe(customerView)
    const end2 = repository.get('ex-assoc-end2') as Elem
    expect(end2['reference']).toBe(order)
    expect(end2._parent).toBe(repository.get('ex-assoc'))
    expect((repository.get('ex-attr-name') as UMLAttribute).type).toBe('String')
    expect(repository.findReferencing(order as Elem).map((r) => `${r.source._id}.${r.field}`)).toEqual(
      expect.arrayContaining(['ex-assoc-end2.reference', 'ex-v-order.model'])
    )
  })

  it('reports dangling references and keeps them null', () => {
    const text = project([
      {
        _type: 'UMLClass',
        _id: 'c',
        _parent: { $ref: 'p' },
        name: 'C',
        attributes: [{ _type: 'UMLAttribute', _id: 'a', _parent: { $ref: 'c' }, name: 'x', type: { $ref: 'missing' } }]
      }
    ])
    const { repository, warnings } = readMdj(text)
    expect(repository.get('a')?.['type']).toBeNull()
    expect(warnings.some((w) => w.includes('missing'))).toBe(true)
  })

  it('rejects non-JSON and non-project files', () => {
    expect(() => readMdj('{not json')).toThrow(FormatError)
    expect(() => readMdj('{"_type":"UMLClass","_id":"x"}')).toThrow(FormatError)
  })

  it('preserves unknown types and unknown fields on round-trip', () => {
    const text = JSON.stringify(
      {
        _type: 'Project',
        _id: 'p',
        name: 'P',
        ownedElements: [
          {
            _type: 'UMLClass',
            _id: 'c',
            _parent: { $ref: 'p' },
            name: 'C',
            ownedElements: [
              {
                _type: 'UMLStateMachine',
                _id: 'sm',
                _parent: { $ref: 'c' },
                name: 'SM',
                regions: [
                  {
                    _type: 'UMLRegion',
                    _id: 'r',
                    _parent: { $ref: 'sm' },
                    vertices: [{ _type: 'UMLState', _id: 's1', _parent: { $ref: 'r' }, name: 'Idle' }]
                  }
                ],
                context: { $ref: 'c' },
                emptyList: [],
                weird: null
              }
            ],
            // Unknown fields of known types are written after the metamodel fields.
            futureFlag: { nested: [1, 2, 3] }
          }
        ],
        documentVersion: 1
      },
      null,
      '\t'
    )
    const { project: root, repository, warnings } = readMdj(text)
    expect(warnings.filter((w) => w.startsWith('Unknown element type'))).toHaveLength(3)
    // Unknown subtrees are indexed and their references resolved.
    expect(repository.get('s1')?._parent).toBe(repository.get('r'))
    expect(repository.get('sm')?.['context']).toBe(repository.get('c'))
    expect(writeMdj(root)).toBe(text)
  })
})

describe('load-time repairs', () => {
  const classes = [
    { _type: 'UMLClass', _id: 'a', _parent: { $ref: 'p' }, name: 'A' },
    { _type: 'UMLClass', _id: 'b', _parent: { $ref: 'p' }, name: 'B' }
  ]

  it('removes relationships with missing ends and their views', () => {
    const text = project([
      ...classes,
      { _type: 'UMLGeneralization', _id: 'g', _parent: { $ref: 'p' }, source: { $ref: 'a' } },
      {
        _type: 'UMLAssociation',
        _id: 'as',
        _parent: { $ref: 'p' },
        end1: { _type: 'UMLAssociationEnd', _id: 'e1', _parent: { $ref: 'as' }, reference: { $ref: 'a' } }
      },
      {
        _type: 'UMLClassDiagram',
        _id: 'd',
        _parent: { $ref: 'p' },
        ownedViews: [
          {
            _type: 'UMLGeneralizationView',
            _id: 'gv',
            _parent: { $ref: 'd' },
            model: { $ref: 'g' },
            head: { $ref: 'x' },
            tail: { $ref: 'y' }
          },
          { _type: 'UMLNoteView', _id: 'n', _parent: { $ref: 'd' }, text: 'keep me' }
        ]
      }
    ])
    const { repository, warnings } = readMdj(text)
    expect(repository.has('g')).toBe(false)
    expect(repository.has('as')).toBe(false)
    expect(repository.has('gv')).toBe(false)
    expect(repository.has('n')).toBe(true)
    expect(warnings.some((w) => w.startsWith('Removed UMLGeneralization g'))).toBe(true)
  })

  it('removes top-level views with no model, missing ends or missing embedded labels', () => {
    const text = project([
      ...classes,
      { _type: 'UMLDependency', _id: 'dep', _parent: { $ref: 'a' }, source: { $ref: 'a' }, target: { $ref: 'b' } },
      {
        _type: 'UMLClassDiagram',
        _id: 'd',
        _parent: { $ref: 'p' },
        ownedViews: [
          { _type: 'UMLClassView', _id: 'nomodel', _parent: { $ref: 'd' } },
          { _type: 'UMLNoteLinkView', _id: 'nolink', _parent: { $ref: 'd' }, head: { $ref: 'nomodel' } },
          { _type: 'UMLDependencyView', _id: 'nolabels', _parent: { $ref: 'd' }, model: { $ref: 'dep' } },
          { _type: 'FreelineEdgeView', _id: 'free', _parent: { $ref: 'd' }, points: '0:0;10:10' }
        ]
      }
    ])
    const { repository } = readMdj(text)
    expect(repository.has('nomodel')).toBe(false)
    expect(repository.has('nolink')).toBe(false)
    expect(repository.has('nolabels')).toBe(false)
    expect(repository.has('free')).toBe(true)
    expect(repository.has('dep')).toBe(true)
  })

  it('fixes far-away labels and legacy boolean navigability', () => {
    const { project: root } = readMdj(exampleText)
    const json = JSON.parse(writeMdj(root)) as JsonObject
    const text = JSON.stringify(json)
      .replace('"distance":30,"hostEdge":{"$ref":"ex-v-assoc"},"edgePosition":2', '"distance":9000,"hostEdge":{"$ref":"ex-v-assoc"},"edgePosition":2')
      .replace('"navigable":"navigable"', '"navigable":true')
    const { repository } = readMdj(text)
    expect(repository.get('ex-v-assoc-trole')?.['distance']).toBe(10)
    expect(repository.get('ex-assoc-end2')?.['navigable']).toBe('navigable')
  })

  it('migrates documentVersion < 1: subject views move behind other views', () => {
    const text = JSON.stringify({
      _type: 'Project',
      _id: 'p',
      ownedElements: [
        { _type: 'UMLUseCaseSubject', _id: 's', _parent: { $ref: 'p' }, name: 'S' },
        {
          _type: 'UMLUseCaseDiagram',
          _id: 'd',
          _parent: { $ref: 'p' },
          ownedViews: [
            { _type: 'UMLNoteView', _id: 'n', _parent: { $ref: 'd' } },
            { _type: 'UMLUseCaseSubjectView', _id: 'sv', _parent: { $ref: 'd' }, model: { $ref: 's' } }
          ]
        }
      ]
    })
    const { project: root, repository } = readMdj(text)
    expect(root.documentVersion).toBe(1)
    expect((repository.get('d')?.['ownedViews'] as Elem[]).map((v) => v._id)).toEqual(['sv', 'n'])
    // Project.name has no metamodel default: an absent name reads as the constructor value.
    expect(root.name).toBe('Untitled')
  })
})

describe('validateModel and fragments', () => {
  it('finds no problems in the example', () => {
    const { project: root } = readMdj(exampleText)
    expect(validateModel(root)).toEqual([])
  })

  it('remaps every id inside a fragment and rewrites internal refs only', () => {
    const json: JsonObject = {
      _type: 'UMLClass',
      _id: 'c',
      _parent: { $ref: 'outside-owner' },
      ownedElements: [
        { _type: 'UMLDependency', _id: 'd', _parent: { $ref: 'c' }, source: { $ref: 'c' }, target: { $ref: 'other' } }
      ]
    }
    let n = 0
    const out = remapIds(json, () => `new${++n}`)
    expect(out['_id']).toBe('new1')
    expect(out['_parent']).toEqual({ $ref: 'outside-owner' })
    const dep = (out['ownedElements'] as JsonObject[])[0] as JsonObject
    expect(dep['_id']).toBe('new2')
    expect(dep['_parent']).toEqual({ $ref: 'new1' })
    expect(dep['source']).toEqual({ $ref: 'new1' })
    expect(dep['target']).toEqual({ $ref: 'other' })
    expect(json['_id']).toBe('c')
  })

  it('narrows with isKindOf', () => {
    const { repository } = readMdj(exampleText)
    const v = repository.get('ex-v-customer')
    expect(isKindOf(v, 'UMLClassifierView')).toBe(true)
    expect(isKindOf(v, 'EdgeView')).toBe(false)
  })
})
