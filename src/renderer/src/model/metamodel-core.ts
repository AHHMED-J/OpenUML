/** Core metaclasses: elements, models, diagrams and the generic view hierarchy. */
import { bool, custom, enm, int, obj, objs, real, ref, refs, str, t, type TypeDef } from './metamodel-dsl'

export const CORE_ENUMS: Record<string, readonly string[]> = {
  TagKind: ['string', 'reference', 'boolean', 'number', 'enum']
}

const labelFields = () => [
  bool('underline', false),
  str('text', ''),
  int('horizontalAlignment', 2),
  int('verticalAlignment', 5),
  bool('wordWrap', false)
]

export const CORE_TYPES: TypeDef[] = [
  t('Element', undefined, [str('_id'), ref('_parent', 'Element')], { abstract: true }),

  // Models
  t('Model', 'Element', [str('name'), objs('ownedElements', 'Element')]),
  t(
    'Tag',
    'Model',
    [
      enm('kind', 'TagKind'),
      str('value'),
      ref('reference', 'Model'),
      bool('checked', false),
      int('number', 0),
      str('options', ''),
      bool('hidden', false)
    ],
    { inits: { kind: 'string' } }
  ),
  t('Hyperlink', 'Model', [ref('reference', 'Model'), str('url'), bool('showName')]),
  t('ExtensibleModel', 'Model', [str('documentation', ''), objs('tags', 'Tag')]),
  t('Relationship', 'ExtensibleModel', [], { abstract: true }),
  t('DirectedRelationship', 'Relationship', [ref('source', 'Model'), ref('target', 'Model')], { abstract: true }),
  t('UndirectedRelationship', 'Relationship', [obj('end1', 'RelationshipEnd'), obj('end2', 'RelationshipEnd')], {
    abstract: true
  }),
  t('RelationshipEnd', 'ExtensibleModel', [ref('reference', 'Model')]),
  t('Diagram', 'ExtensibleModel', [bool('visible', true), bool('defaultDiagram', false), objs('ownedViews', 'View')], {
    abstract: true
  }),
  t(
    'Project',
    'ExtensibleModel',
    [str('author'), str('company'), str('copyright'), str('version'), int('documentVersion', 0)],
    { inits: { name: 'Untitled', documentVersion: 1 } }
  ),

  // Views
  t(
    'View',
    'Element',
    [
      ref('model', 'Element'),
      objs('subViews', 'View'),
      ref('containerView', 'View'),
      refs('containedViews', 'View'),
      bool('visible', true),
      bool('enabled', true),
      str('lineColor', '#000000'),
      str('fillColor', '#ffffff'),
      str('fontColor', '#000000'),
      custom('font', 'Font'),
      bool('parentStyle'),
      bool('showShadow', true),
      bool('containerChangeable', false),
      bool('containerExtending', false)
    ],
    { abstract: true }
  ),
  t('NodeView', 'View', [int('left', 0), int('top', 0), int('width', 0), int('height', 0), bool('autoResize', false)]),
  t('LabelView', 'NodeView', labelFields(), { inits: { parentStyle: true } }),
  t('ParasiticView', 'NodeView', [real('alpha'), real('distance')], { abstract: true }),
  t('NodeParasiticView', 'ParasiticView', [ref('hostNode', 'View')], { abstract: true }),
  t('NodeLabelView', 'NodeParasiticView', labelFields()),
  t('NodeNodeView', 'NodeParasiticView'),
  t('EdgeParasiticView', 'ParasiticView', [ref('hostEdge', 'EdgeView'), int('edgePosition', 0)], { abstract: true }),
  t('EdgeLabelView', 'EdgeParasiticView', labelFields()),
  t('EdgeNodeView', 'EdgeParasiticView'),
  t(
    'EdgeView',
    'View',
    [ref('head', 'View'), ref('tail', 'View'), int('lineStyle', 0), custom('points', 'Points')],
    // New edges are oblique (preference), unlike the metamodel default, so it is written explicitly.
    { inits: { lineStyle: 1 } }
  ),
  t('FreelineEdgeView', 'EdgeView', [int('lineMode'), int('headEndStyle'), int('tailEndStyle')]),
  t('ShapeView', 'NodeView', [], { abstract: true }),
  t('RectangleView', 'ShapeView'),
  t('RoundRectView', 'ShapeView'),
  t('EllipseView', 'ShapeView')
]
