/**
 * Metaclasses of the IDEF0 function modeling family: the model root, function boxes, arrows,
 * boundary ports and model notes, plus the diagram and view types. Registered by `metamodel.ts`.
 *
 * Ownership: the arrows and ports drawn on one diagram belong to the scope that diagram details
 * (the `IDEF0Model` for the A-0 context diagram, otherwise the `IDEF0Function` it decomposes).
 */
import { bool, emb, enm, int, objs, ref, str, t, type TypeDef } from './metamodel-dsl'

export const IDEF0_ENUMS: Record<string, readonly string[]> = {
  IDEF0ArrowRole: ['input', 'control', 'output', 'mechanism', 'call'],
  IDEF0DiagramKind: ['context', 'decomposition'],
  IDEF0Status: ['working', 'draft', 'recommended', 'publication']
}

const IDEF0_MODEL_TYPES: TypeDef[] = [
  t('IDEF0Scope', 'ExtensibleModel', [objs('arrows', 'IDEF0Arrow'), objs('ports', 'IDEF0Port')], { abstract: true }),
  t('IDEF0Model', 'IDEF0Scope', [
    str('abbreviation', ''),
    str('purpose', ''),
    str('viewpoint', ''),
    ref('topFunction', 'IDEF0Function'),
    bool('colorArrowsByRole', false)
  ]),
  t('IDEF0Function', 'IDEF0Scope', [
    objs('functions', 'IDEF0Function'),
    int('boxNumber', 0),
    ref('childDiagram', 'IDEF0Diagram'),
    ref('calledFunction', 'IDEF0Function'),
    str('definition', '')
  ]),
  t('IDEF0Port', 'ExtensibleModel', [enm('role', 'IDEF0ArrowRole', 'input'), ref('corresponds', 'IDEF0Arrow')]),
  t('IDEF0Arrow', 'DirectedRelationship', [
    enm('role', 'IDEF0ArrowRole', 'input'),
    bool('tunnelSource', false),
    bool('tunnelTarget', false),
    int('sourceSlot', -1),
    int('targetSlot', -1),
    str('calledNode', '')
  ]),
  t('IDEF0ModelNote', 'ExtensibleModel', [int('number', 1), str('text', '')])
]

const IDEF0_VIEW_TYPES: TypeDef[] = [
  t('IDEF0Diagram', 'Diagram', [
    enm('diagramKind', 'IDEF0DiagramKind', 'decomposition'),
    enm('status', 'IDEF0Status', 'working'),
    str('author', ''),
    str('date', ''),
    str('number', ''),
    bool('autoNumber', false),
    bool('showTitleBlock', true),
    bool('showWorkingBand', true)
  ]),
  t('IDEF0FrameView', 'NodeView'),
  t('IDEF0FunctionView', 'NodeView', [bool('showDre', true)]),
  t('IDEF0PortView', 'NodeView'),
  t('IDEF0ArrowView', 'EdgeView', [emb('nameLabel', 'EdgeLabelView'), bool('showSquiggle', true)], { inits: { lineStyle: 2 } }),
  t('IDEF0NoteView', 'NodeView')
]

export const IDEF0_TYPES: TypeDef[] = [...IDEF0_MODEL_TYPES, ...IDEF0_VIEW_TYPES]
