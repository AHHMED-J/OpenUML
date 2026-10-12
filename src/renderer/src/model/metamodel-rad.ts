/**
 * Metaclasses of the Role Activity Diagram (RAD) family: process, roles, the elements that sit on
 * a role's threads (activities, interactions, refinements, markers, ...), state lines, interaction
 * links and the RAD view types. Registered by `metamodel.ts`. Every name carries the `RAD` prefix
 * so `.mdj` files stay generic.
 */
import { bool, emb, enm, objs, ref, str, t, type TypeDef } from './metamodel-dsl'

export const RAD_ENUMS: Record<string, readonly string[]> = {
  // Kept for the UI; the refinement kind is stored as the model type (case / part).
  RADRefinementKind: ['case', 'part'],
  RADSide: ['left', 'right'],
  RADStateMarkerKind: ['start', 'end', 'state'],
  RADRouting: ['auto', 'bus', 'side']
}

const RAD_MODEL_TYPES: TypeDef[] = [
  t('RADProcess', 'ExtensibleModel', [objs('roles', 'RADRole'), objs('interactions', 'RADInteractionLink'), str('goal', '')]),
  t('RADRole', 'ExtensibleModel', [
    str('agent', ''),
    str('goal', ''),
    objs('elements', 'RADElement'),
    objs('stateLines', 'RADStateLine')
  ]),
  t('RADElement', 'ExtensibleModel', [], { abstract: true }),
  t('RADActivity', 'RADElement'),
  t('RADInteraction', 'RADActivity', [str('externalParty', ''), enm('side', 'RADSide', 'left')]),
  t('RADUndefinedProcess', 'RADElement'),
  t('RADStateMarker', 'RADElement', [enm('kind', 'RADStateMarkerKind', 'state')]),
  t('RADWait', 'RADElement'),
  t('RADRoleStart', 'RADElement', [ref('role', 'RADRole'), str('externalRole', '')]),
  t('RADRefinement', 'RADElement', [], { abstract: true }),
  t('RADCaseRefinement', 'RADRefinement'),
  t('RADPartRefinement', 'RADRefinement'),
  t('RADBranch', 'RADElement', [ref('refinement', 'RADRefinement')], { abstract: true }),
  t('RADCaseBranch', 'RADBranch'),
  t('RADPartBranch', 'RADBranch'),
  t('RADStateLine', 'DirectedRelationship', [enm('routing', 'RADRouting', 'auto'), bool('loopBack', false), bool('showArrow', true)]),
  t('RADInteractionLink', 'DirectedRelationship', [bool('showDirection', false)])
]

const RAD_VIEW_TYPES: TypeDef[] = [
  t('RADDiagram', 'Diagram'),
  t('RADRoleView', 'NodeView', [emb('nameLabel', 'LabelView'), bool('showGoal', false), bool('headerOutside', true)]),
  t('RADActivityView', 'UMLFloatingNodeView'),
  t('RADUndefinedProcessView', 'UMLFloatingNodeView'),
  t('RADStateMarkerView', 'UMLFloatingNodeView'),
  t('RADWaitView', 'UMLFloatingNodeView'),
  t('RADRoleStartView', 'UMLFloatingNodeView'),
  t('RADRefinementView', 'UMLFloatingNodeView'),
  t('RADBranchView', 'UMLFloatingNodeView'),
  t('RADStateLineView', 'UMLGeneralEdgeView'),
  t('RADInteractionLinkView', 'UMLGeneralEdgeView')
]

export const RAD_TYPES: TypeDef[] = [...RAD_MODEL_TYPES, ...RAD_VIEW_TYPES]
