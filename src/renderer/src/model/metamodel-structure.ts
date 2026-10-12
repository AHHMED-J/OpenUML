/**
 * Metaclasses of the structural and interaction-overview diagram families: object diagrams
 * (instances, slots, links), composite structure (ports, connectors, collaboration uses, role
 * bindings), communication, interaction overview and information flow diagrams.
 * Registered through `UML_TYPES` / `UML_ENUMS` in `metamodel-uml.ts`.
 */
import { bool, emb, enm, obj, objs, ref, refs, str, t, vari, type TypeDef } from './metamodel-dsl'

export const STRUCTURE_ENUMS: Record<string, readonly string[]> = {
  UMLConnectorKind: ['assembly', 'delegation']
}

export const STRUCTURE_MODEL_TYPES: TypeDef[] = [
  // Object diagram
  t('UMLInstance', 'UMLModelElement', [vari('classifier', 'UMLClassifier'), objs('slots', 'UMLSlot'), str('value', '')]),
  t('UMLObject', 'UMLInstance'),
  t('UMLArtifactInstance', 'UMLInstance'),
  t('UMLComponentInstance', 'UMLInstance'),
  t('UMLNodeInstance', 'UMLInstance'),
  t('UMLSlot', 'UMLModelElement', [ref('definingFeature', 'UMLStructuralFeature'), vari('type', 'UMLClassifier'), str('value', '')]),
  t('UMLLinkEnd', 'UMLRelationshipEnd'),
  t('UMLLink', 'UMLUndirectedRelationship', [ref('association', 'UMLAssociation'), obj('end1', 'UMLLinkEnd'), obj('end2', 'UMLLinkEnd')]),
  t('UMLLinkObjectLink', 'UMLModelElement', [ref('objectSide', 'UMLObject'), ref('linkSide', 'UMLLink')]),

  // Composite structure
  t('UMLPort', 'UMLAttribute', [bool('isBehavior', false), bool('isService', false), bool('isConjugated', false)]),
  t('UMLConnectorEnd', 'UMLRelationshipEnd'),
  t('UMLConnector', 'UMLUndirectedRelationship', [
    ref('type', 'UMLAssociation'),
    enm('kind', 'UMLConnectorKind', 'assembly'),
    obj('end1', 'UMLConnectorEnd'),
    obj('end2', 'UMLConnectorEnd')
  ]),
  t('UMLCollaborationUse', 'UMLModelElement', [ref('type', 'UMLCollaboration')]),
  t('UMLRoleBinding', 'UMLDependency', [str('roleName', '')]),

  // Information flow
  t('UMLInformationItem', 'UMLClassifier', [refs('represented', 'UMLClassifier')]),
  t('UMLInformationFlow', 'UMLDirectedRelationship', [
    refs('conveyed', 'UMLClassifier'),
    refs('realizingConnectors', 'UMLConnector'),
    refs('realizingActivityEdges', 'UMLActivityEdge'),
    refs('realizingMessages', 'UMLMessage')
  ])
]

export const STRUCTURE_VIEW_TYPES: TypeDef[] = [
  t('UMLObjectDiagram', 'UMLDiagram'),
  t('UMLCompositeStructureDiagram', 'UMLDiagram'),
  t('UMLCommunicationDiagram', 'UMLDiagram', [
    bool('showSequenceNumber', true),
    enm('sequenceNumbering', 'UMLSequenceNumberingKind', 'auto'),
    bool('showSignature', true)
  ]),
  t('UMLInteractionOverviewDiagram', 'UMLDiagram'),
  t('UMLInformationFlowDiagram', 'UMLDiagram'),

  // Object diagram views
  t('UMLObjectView', 'UMLGeneralNodeView', [emb('slotCompartment', 'UMLSlotCompartmentView')]),
  t('UMLArtifactInstanceView', 'UMLGeneralNodeView'),
  t('UMLComponentInstanceView', 'UMLGeneralNodeView'),
  t('UMLNodeInstanceView', 'UMLGeneralNodeView'),
  t('UMLLinkView', 'UMLUndirectedRelationshipView'),
  t('UMLLinkObjectLinkView', 'EdgeView'),

  // Composite structure views
  t('UMLPortView', 'UMLFloatingNodeView', [bool('showVisibility', false), bool('showType', true), bool('showMultiplicity', true)]),
  t('UMLPartView', 'UMLGeneralNodeView', [bool('showVisibility', false), bool('showMultiplicity', true)]),
  t('UMLConnectorView', 'UMLUndirectedRelationshipView'),
  t('UMLCollaborationView', 'UMLGeneralNodeView', [emb('templateParameterCompartment', 'UMLTemplateParameterCompartmentView')]),
  t('UMLCollaborationUseView', 'UMLGeneralNodeView'),
  t('UMLRoleBindingView', 'UMLGeneralEdgeView', [emb('roleNameLabel', 'EdgeLabelView')]),

  // Communication views
  t('UMLCommLifelineView', 'UMLGeneralNodeView'),
  t('UMLCommMessageView', 'EdgeNodeView', [
    emb('nameLabel', 'NodeLabelView'),
    emb('stereotypeLabel', 'NodeLabelView'),
    emb('propertyLabel', 'NodeLabelView'),
    bool('showProperty', true),
    bool('showType', true)
  ]),

  // Interaction overview
  t('UMLInteractionInlineView', 'UMLFrameView'),

  // Information flow
  t('UMLInformationItemView', 'UMLClassifierView'),
  t('UMLInformationFlowView', 'UMLGeneralEdgeView')
]
