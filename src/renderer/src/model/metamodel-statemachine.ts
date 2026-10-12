/**
 * Metaclasses of the state machine (statechart) and timing diagram families: behavior model
 * types, enumerations and the view types of both diagrams. Registered by `metamodel.ts`.
 */
import { bool, emb, enm, objs, ref, refs, str, t, type TypeDef } from './metamodel-dsl'

export const STATEMACHINE_ENUMS: Record<string, readonly string[]> = {
  UMLPseudostateKind: [
    'initial',
    'deepHistory',
    'shallowHistory',
    'join',
    'fork',
    'junction',
    'choice',
    'entryPoint',
    'exitPoint',
    'terminate'
  ],
  UMLTransitionKind: ['external', 'internal', 'local'],
  UMLEventKind: ['signal', 'call', 'change', 'time', 'anyReceive']
}

const STATE_MODEL_TYPES: TypeDef[] = [
  t('UMLEvent', 'UMLModelElement', [
    enm('kind', 'UMLEventKind', 'anyReceive'),
    str('value', ''),
    str('expression', ''),
    ref('targetOperation', 'UMLOperation'),
    ref('targetSignal', 'UMLSignal')
  ]),
  t('UMLOpaqueBehavior', 'UMLBehavior'),
  t('UMLStateMachine', 'UMLBehavior', [objs('regions', 'UMLRegion')]),
  t('UMLRegion', 'UMLModelElement', [objs('vertices', 'UMLVertex'), objs('transitions', 'UMLTransition')]),
  t('UMLVertex', 'UMLModelElement', [], { abstract: true }),
  // The metamodel gives no default kind, so it is always written; new instances start as `initial`.
  t('UMLPseudostate', 'UMLVertex', [enm('kind', 'UMLPseudostateKind')], { inits: { kind: 'initial' } }),
  t('UMLConnectionPointReference', 'UMLVertex', [refs('entry', 'UMLPseudostate'), refs('exit', 'UMLPseudostate')]),
  t('UMLState', 'UMLVertex', [
    objs('regions', 'UMLRegion'),
    objs('entryActivities', 'UMLBehavior'),
    objs('doActivities', 'UMLBehavior'),
    objs('exitActivities', 'UMLBehavior'),
    ref('submachine', 'UMLStateMachine'),
    objs('connections', 'UMLConnectionPointReference')
  ]),
  t('UMLFinalState', 'UMLState'),
  t('UMLTransition', 'UMLDirectedRelationship', [
    enm('kind', 'UMLTransitionKind', 'external'),
    str('guard', ''),
    objs('triggers', 'UMLEvent'),
    objs('effects', 'UMLBehavior')
  ])
]

const STATE_VIEW_TYPES: TypeDef[] = [
  t('UMLStatechartDiagram', 'UMLDiagram'),
  t('UMLInternalActivityView', 'LabelView'),
  t('UMLInternalTransitionView', 'LabelView'),
  t('UMLInternalActivityCompartmentView', 'UMLListCompartmentView'),
  t('UMLInternalTransitionCompartmentView', 'UMLListCompartmentView'),
  t('UMLDecompositionCompartmentView', 'UMLListCompartmentView'),
  t('UMLRegionView', 'NodeView'),
  t('UMLStateView', 'UMLGeneralNodeView', [
    emb('internalActivityCompartment', 'UMLInternalActivityCompartmentView'),
    emb('internalTransitionCompartment', 'UMLInternalTransitionCompartmentView'),
    emb('decompositionCompartment', 'UMLDecompositionCompartmentView')
  ]),
  t('UMLFinalStateView', 'NodeView'),
  t('UMLPseudostateView', 'UMLFloatingNodeView'),
  t('UMLConnectionPointReferenceView', 'UMLFloatingNodeView'),
  t('UMLTransitionView', 'UMLGeneralEdgeView')
]

const TIMING_VIEW_TYPES: TypeDef[] = [
  t('UMLTimingDiagram', 'UMLDiagram'),
  t('UMLTimingFrameView', 'UMLFrameView'),
  t('UMLTimingLifelineView', 'NodeView', [bool('showType', true), emb('nameLabel', 'LabelView')]),
  t('UMLTimingStateView', 'NodeView', [emb('nameLabel', 'LabelView')]),
  t('UMLTimeSegmentView', 'NodeView'),
  t('UMLTimeTickView', 'NodeView', [str('text', '')]),
  t('UMLTimingMessageView', 'UMLGeneralEdgeView')
]

export const STATEMACHINE_TYPES: TypeDef[] = [...STATE_MODEL_TYPES, ...STATE_VIEW_TYPES, ...TIMING_VIEW_TYPES]

