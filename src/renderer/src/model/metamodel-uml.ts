/**
 * UML metaclasses needed for class, use case, sequence and activity diagrams, plus annotation
 * views. Types not listed here are still loaded and saved unchanged (see the format module).
 */
import { bool, emb, enm, int, obj, objs, ref, refs, str, t, vari, type FieldDef, type TypeDef } from './metamodel-dsl'

export const UML_ENUMS: Record<string, readonly string[]> = {
  UMLVisibilityKind: ['public', 'protected', 'private', 'package'],
  UMLAggregationKind: ['none', 'shared', 'composite'],
  UMLNavigableKind: ['unspecified', 'navigable', 'notNavigable'],
  UMLFeatureDirectionKind: ['provided', 'required', 'providedRequired'],
  UMLDirectionKind: ['in', 'inout', 'out', 'return'],
  UMLCallConcurrencyKind: ['sequential', 'guarded', 'concurrent'],
  UMLMessageSort: ['synchCall', 'asynchCall', 'asynchSignal', 'createMessage', 'deleteMessage', 'reply'],
  UMLInteractionOperatorKind: [
    'alt',
    'opt',
    'par',
    'loop',
    'critical',
    'neg',
    'assert',
    'strict',
    'seq',
    'ignore',
    'consider',
    'break'
  ],
  UMLActionKind: [
    'opaque',
    'create',
    'destroy',
    'read',
    'write',
    'insert',
    'delete',
    'sendSignal',
    'acceptSignal',
    'triggerEvent',
    'acceptEvent',
    'structured',
    'timeEvent',
    'callBehavior',
    'callOperation'
  ],
  UMLObjectNodeOrderingKind: ['unordered', 'ordered', 'LIFO', 'FIFO'],
  UMLStereotypeDisplayKind: ['none', 'label', 'decoration', 'decoration-label', 'icon', 'icon-label'],
  UMLSequenceNumberingKind: ['auto', 'custom']
}

const stereotypeAndVisibility = (): FieldDef[] => [
  vari('stereotype', 'UMLStereotype'),
  enm('visibility', 'UMLVisibilityKind', 'public')
]

const relationshipLabels = (): FieldDef[] => [
  emb('nameLabel', 'EdgeLabelView'),
  emb('stereotypeLabel', 'EdgeLabelView'),
  emb('propertyLabel', 'EdgeLabelView')
]

const itemViews = [
  'UMLAttributeView',
  'UMLOperationView',
  'UMLReceptionView',
  'UMLTemplateParameterView',
  'UMLEnumerationLiteralView',
  'UMLExtensionPointView',
  'UMLSlotView'
]
const listCompartments = [
  'UMLAttributeCompartmentView',
  'UMLOperationCompartmentView',
  'UMLReceptionCompartmentView',
  'UMLTemplateParameterCompartmentView',
  'UMLEnumerationLiteralCompartmentView',
  'UMLExtensionPointCompartmentView',
  'UMLSlotCompartmentView',
  'UMLQualifierCompartmentView',
  'UMLInteractionOperandCompartmentView'
]

const MODEL_TYPES: TypeDef[] = [
  // Common bases
  t('UMLModelElement', 'ExtensibleModel', [...stereotypeAndVisibility(), objs('templateParameters', 'UMLTemplateParameter')], {
    abstract: true
  }),
  t(
    'UMLFeature',
    'UMLModelElement',
    [bool('isStatic', false), bool('isLeaf', false), enm('featureDirection', 'UMLFeatureDirectionKind', 'provided')],
    { abstract: true }
  ),
  t(
    'UMLStructuralFeature',
    'UMLFeature',
    [
      vari('type', 'UMLClassifier'),
      str('multiplicity', ''),
      bool('isReadOnly', false),
      bool('isOrdered', false),
      bool('isUnique', false),
      str('defaultValue', '')
    ],
    { abstract: true }
  ),
  t(
    'UMLBehavioralFeature',
    'UMLFeature',
    [
      objs('parameters', 'UMLParameter'),
      refs('raisedExceptions', 'UMLClassifier'),
      enm('concurrency', 'UMLCallConcurrencyKind', 'sequential')
    ],
    { abstract: true }
  ),
  t(
    'UMLClassifier',
    'UMLModelElement',
    [
      objs('attributes', 'UMLAttribute'),
      objs('operations', 'UMLOperation'),
      objs('receptions', 'UMLReception'),
      objs('behaviors', 'UMLBehavior'),
      bool('isAbstract', false),
      bool('isFinalSpecialization', false),
      bool('isLeaf', false)
    ],
    { abstract: true }
  ),
  t('UMLDirectedRelationship', 'DirectedRelationship', stereotypeAndVisibility(), { abstract: true }),
  t('UMLUndirectedRelationship', 'UndirectedRelationship', stereotypeAndVisibility(), { abstract: true }),
  t('UMLRelationshipEnd', 'RelationshipEnd', [
    str('stereotype', ''),
    enm('visibility', 'UMLVisibilityKind', 'public'),
    enm('navigable', 'UMLNavigableKind', 'unspecified'),
    enm('aggregation', 'UMLAggregationKind', 'none'),
    str('multiplicity', ''),
    str('defaultValue', ''),
    bool('isReadOnly', false),
    bool('isOrdered', false),
    bool('isUnique', false),
    bool('isDerived', false),
    bool('isID', false)
  ]),
  t('UMLConstraint', 'UMLModelElement', [str('specification', ''), refs('constrainedElements', 'UMLModelElement')]),
  t('UMLIntervalConstraint', 'UMLConstraint', [str('min'), str('max')]),
  t('UMLDurationConstraint', 'UMLIntervalConstraint'),
  t('UMLTimeConstraint', 'UMLIntervalConstraint'),
  t(
    'UMLBehavior',
    'UMLModelElement',
    [
      bool('isReentrant', true),
      objs('parameters', 'UMLParameter'),
      objs('preconditions', 'UMLConstraint'),
      objs('postconditions', 'UMLConstraint')
    ],
    { abstract: true }
  ),

  // Class diagram
  t('UMLPackage', 'UMLModelElement', [refs('importedElements', 'UMLModelElement')]),
  t('UMLModel', 'UMLPackage', [str('viewpoint', '')]),
  t('UMLClass', 'UMLClassifier', [bool('isActive', false)]),
  t('UMLInterface', 'UMLClassifier'),
  t('UMLDataType', 'UMLClassifier'),
  t('UMLPrimitiveType', 'UMLDataType'),
  t('UMLEnumeration', 'UMLDataType', [objs('literals', 'UMLEnumerationLiteral')]),
  t('UMLEnumerationLiteral', 'UMLModelElement'),
  t('UMLSignal', 'UMLClassifier'),
  t('UMLAttribute', 'UMLStructuralFeature', [
    bool('isDerived', false),
    enm('aggregation', 'UMLAggregationKind', 'none'),
    bool('isID', false)
  ]),
  t('UMLOperation', 'UMLBehavioralFeature', [
    bool('isQuery', false),
    bool('isAbstract', false),
    str('specification', ''),
    objs('preconditions', 'UMLConstraint'),
    objs('bodyConditions', 'UMLConstraint'),
    objs('postconditions', 'UMLConstraint')
  ]),
  t('UMLParameter', 'UMLStructuralFeature', [enm('direction', 'UMLDirectionKind', 'in')]),
  t('UMLReception', 'UMLBehavioralFeature', [ref('signal', 'UMLSignal')]),
  t('UMLDependency', 'UMLDirectedRelationship', [str('mapping', '')]),
  t('UMLAbstraction', 'UMLDependency'),
  t('UMLRealization', 'UMLAbstraction'),
  t('UMLInterfaceRealization', 'UMLRealization'),
  t('UMLGeneralization', 'UMLDirectedRelationship', [str('discriminator', '')]),
  t('UMLAssociation', 'UMLUndirectedRelationship', [
    bool('isDerived', false),
    obj('end1', 'UMLAssociationEnd'),
    obj('end2', 'UMLAssociationEnd')
  ]),
  t('UMLAssociationEnd', 'UMLRelationshipEnd', [objs('qualifiers', 'UMLAttribute'), ref('ownerAttribute', 'UMLAttribute')]),

  // Use case diagram
  t('UMLActor', 'UMLClassifier'),
  t('UMLUseCase', 'UMLClassifier', [objs('extensionPoints', 'UMLExtensionPoint')]),
  t('UMLExtensionPoint', 'UMLModelElement', [str('location', '')]),
  t('UMLInclude', 'UMLDirectedRelationship'),
  t('UMLExtend', 'UMLDirectedRelationship', [str('condition', ''), refs('extensionLocations', 'UMLExtensionPoint')]),
  t('UMLComponent', 'UMLClassifier', [bool('isIndirectlyInstantiated', true)]),
  t('UMLSubsystem', 'UMLComponent'),
  t('UMLUseCaseSubject', 'UMLSubsystem', [ref('represent', 'UMLClassifier')]),

  // Component / deployment / package / profile diagrams
  t('UMLArtifact', 'UMLClassifier', [str('fileName', '')]),
  t('UMLComponentRealization', 'UMLRealization'),
  t('UMLNode', 'UMLClassifier'),
  t('UMLDeployment', 'UMLDependency'),
  t('UMLCommunicationPath', 'UMLAssociation'),
  t('UMLProfile', 'UMLPackage'),
  t('UMLImage', 'UMLModelElement', [
    int('width', 0),
    int('height', 0),
    str('content', ''),
    str('smallIcon', '')
  ]),
  t('UMLStereotype', 'UMLClass', [obj('icon', 'UMLImage')]),
  t('UMLMetaClass', 'UMLModelElement'),
  t('UMLExtension', 'UMLDirectedRelationship'),

  // Sequence diagram
  t('UMLCollaboration', 'UMLClassifier'),
  t('UMLInteractionFragment', 'UMLBehavior', [], { abstract: true }),
  t('UMLInteraction', 'UMLInteractionFragment', [
    objs('messages', 'UMLMessage'),
    objs('participants', 'UMLMessageEndpoint'),
    objs('fragments', 'UMLInteractionFragment')
  ]),
  t('UMLMessageEndpoint', 'UMLModelElement', [], { abstract: true }),
  t('UMLLifeline', 'UMLMessageEndpoint', [
    str('selector', ''),
    ref('represent', 'UMLStructuralFeature'),
    // The metamodel declares a non-boolean default, so the value is always written.
    bool('isMultiInstance')
  ]),
  t('UMLGate', 'UMLMessageEndpoint'),
  t('UMLEndpoint', 'UMLMessageEndpoint'),
  t('UMLMessage', 'UMLDirectedRelationship', [
    enm('messageSort', 'UMLMessageSort', 'synchCall'),
    ref('signature', 'UMLModelElement'),
    ref('connector', 'UMLConnector'),
    str('sequenceNumber', ''),
    str('arguments', ''),
    str('assignmentTarget', ''),
    str('guard', ''),
    str('iteration', ''),
    bool('isConcurrentIteration', false)
  ]),
  t(
    'UMLCombinedFragment',
    'UMLInteractionFragment',
    [enm('interactionOperator', 'UMLInteractionOperatorKind'), objs('operands', 'UMLInteractionOperand')],
    { inits: { interactionOperator: 'seq' } }
  ),
  t('UMLInteractionOperand', 'UMLInteractionFragment', [str('guard', '')]),
  t('UMLInteractionUse', 'UMLInteractionFragment', [
    ref('refersTo', 'UMLInteraction'),
    str('arguments'),
    str('returnValue'),
    ref('returnValueRecipient', 'UMLStructuralFeature')
  ]),
  t('UMLStateInvariant', 'UMLInteractionFragment', [ref('covered', 'UMLLifeline'), vari('invariant', 'UMLModelElement')]),
  t('UMLContinuation', 'UMLInteractionFragment', [bool('setting', false)]),

  // Activity diagram
  t('UMLActivity', 'UMLBehavior', [
    bool('isReadOnly', false),
    bool('isSingleExecution', false),
    objs('nodes', 'UMLActivityNode'),
    objs('edges', 'UMLActivityEdge'),
    objs('groups', 'UMLActivityGroup')
  ]),
  t('UMLActivityNode', 'UMLModelElement', [], { abstract: true }),
  t('UMLAction', 'UMLActivityNode', [
    enm('kind', 'UMLActionKind', 'opaque'),
    objs('inputs', 'UMLInputPin'),
    objs('outputs', 'UMLOutputPin'),
    objs('triggers', 'UMLEvent'),
    ref('target', 'UMLModelElement'),
    ref('subactivity', 'UMLActivity'),
    bool('isLocallyReentrant', false),
    bool('isSynchronous', true),
    str('language'),
    str('body'),
    objs('localPreconditions', 'UMLConstraint'),
    objs('localPostconditions', 'UMLConstraint')
  ]),
  t(
    'UMLObjectNode',
    'UMLActivityNode',
    [
      vari('type', 'UMLClassifier'),
      bool('isControlType', false),
      enm('ordering', 'UMLObjectNodeOrderingKind'),
      refs('inStates', 'UMLState')
    ],
    { inits: { ordering: 'FIFO' } }
  ),
  t('UMLControlNode', 'UMLActivityNode', [], { abstract: true }),
  t('UMLInitialNode', 'UMLControlNode'),
  t('UMLFinalNode', 'UMLControlNode', [], { abstract: true }),
  t('UMLActivityFinalNode', 'UMLFinalNode'),
  t('UMLFlowFinalNode', 'UMLFinalNode'),
  t('UMLForkNode', 'UMLControlNode'),
  t('UMLJoinNode', 'UMLControlNode'),
  t('UMLDecisionNode', 'UMLControlNode'),
  t('UMLMergeNode', 'UMLControlNode'),
  // `nodes`/`edges` of groups are left undeclared: their stored shape is not pinned down, and
  // undeclared fields are preserved verbatim.
  t('UMLActivityGroup', 'UMLModelElement', [objs('subgroups', 'UMLActivityGroup')], { abstract: true }),
  t('UMLActivityPartition', 'UMLActivityGroup'),
  t('UMLActivityEdge', 'UMLDirectedRelationship', [str('guard', ''), str('weight', '')], { abstract: true }),
  t('UMLControlFlow', 'UMLActivityEdge'),
  t('UMLObjectFlow', 'UMLActivityEdge'),
  t('UMLPin', 'UMLStructuralFeature', [], { abstract: true }),
  t('UMLInputPin', 'UMLPin'),
  t('UMLOutputPin', 'UMLPin')
]

const VIEW_TYPES: TypeDef[] = [
  // Diagrams
  t('UMLDiagram', 'Diagram', [], { abstract: true }),
  t('UMLClassDiagram', 'UMLDiagram'),
  t('UMLUseCaseDiagram', 'UMLDiagram'),
  t('UMLSequenceDiagram', 'UMLDiagram', [
    bool('showSequenceNumber', true),
    enm('sequenceNumbering', 'UMLSequenceNumberingKind', 'auto'),
    bool('showSignature', true),
    bool('showActivation', true)
  ]),
  t('UMLActivityDiagram', 'UMLDiagram'),
  t('UMLComponentDiagram', 'UMLDiagram'),
  t('UMLDeploymentDiagram', 'UMLDiagram'),
  t('UMLPackageDiagram', 'UMLDiagram'),
  t('UMLProfileDiagram', 'UMLDiagram'),

  // Compartments and items
  t('UMLCompartmentView', 'NodeView', [], { abstract: true }),
  t('UMLNameCompartmentView', 'UMLCompartmentView', [
    emb('stereotypeLabel', 'LabelView'),
    emb('nameLabel', 'LabelView'),
    emb('namespaceLabel', 'LabelView'),
    emb('propertyLabel', 'LabelView')
  ]),
  t('UMLListCompartmentView', 'UMLCompartmentView', [], { abstract: true }),
  ...listCompartments.map((name) => t(name, 'UMLListCompartmentView')),
  ...itemViews.map((name) => t(name, 'LabelView')),

  // General node / edge bases
  t(
    'UMLGeneralNodeView',
    'NodeView',
    [
      enm('stereotypeDisplay', 'UMLStereotypeDisplayKind', 'label'),
      bool('showVisibility', true),
      bool('showNamespace', false),
      bool('showProperty', true),
      bool('showType', true),
      emb('nameCompartment', 'UMLNameCompartmentView'),
      bool('wordWrap', false)
    ],
    { abstract: true }
  ),
  t(
    'UMLFloatingNodeView',
    'NodeView',
    [
      emb('nameLabel', 'NodeLabelView'),
      emb('stereotypeLabel', 'NodeLabelView'),
      emb('propertyLabel', 'NodeLabelView'),
      bool('showProperty', true)
    ],
    { abstract: true }
  ),
  t(
    'UMLGeneralEdgeView',
    'EdgeView',
    [
      enm('stereotypeDisplay', 'UMLStereotypeDisplayKind', 'label'),
      bool('showVisibility', false),
      bool('showProperty', true),
      ...relationshipLabels()
    ],
    { abstract: true }
  ),
  t(
    'UMLClassifierView',
    'UMLGeneralNodeView',
    [
      bool('suppressAttributes', false),
      bool('suppressOperations', false),
      bool('suppressReceptions', true),
      bool('showMultiplicity', true),
      bool('showOperationSignature', true),
      emb('attributeCompartment', 'UMLAttributeCompartmentView'),
      emb('operationCompartment', 'UMLOperationCompartmentView'),
      emb('receptionCompartment', 'UMLReceptionCompartmentView'),
      emb('templateParameterCompartment', 'UMLTemplateParameterCompartmentView')
    ],
    { abstract: true }
  ),
  t(
    'UMLUndirectedRelationshipView',
    'UMLGeneralEdgeView',
    [
      bool('showMultiplicity', true),
      bool('showType', true),
      int('showEndOrder', 0),
      emb('tailRoleNameLabel', 'EdgeLabelView'),
      emb('tailPropertyLabel', 'EdgeLabelView'),
      emb('tailMultiplicityLabel', 'EdgeLabelView'),
      emb('headRoleNameLabel', 'EdgeLabelView'),
      emb('headPropertyLabel', 'EdgeLabelView'),
      emb('headMultiplicityLabel', 'EdgeLabelView')
    ],
    { abstract: true }
  ),

  // Class diagram views
  t('UMLClassView', 'UMLClassifierView'),
  t('UMLInterfaceView', 'UMLClassifierView'),
  t('UMLSignalView', 'UMLClassifierView'),
  t('UMLDataTypeView', 'UMLClassifierView'),
  t('UMLPrimitiveTypeView', 'UMLClassifierView'),
  t('UMLEnumerationView', 'UMLClassifierView', [
    bool('suppressLiterals', false),
    emb('enumerationLiteralCompartment', 'UMLEnumerationLiteralCompartmentView')
  ]),
  t('UMLPackageView', 'UMLGeneralNodeView'),
  t('UMLModelView', 'UMLPackageView'),
  t('UMLGeneralizationView', 'UMLGeneralEdgeView'),
  t('UMLDependencyView', 'UMLGeneralEdgeView'),
  t('UMLRealizationView', 'UMLGeneralEdgeView'),
  t('UMLInterfaceRealizationView', 'UMLGeneralEdgeView'),
  t('UMLAssociationView', 'UMLUndirectedRelationshipView', [
    emb('tailQualifiersCompartment', 'UMLQualifierCompartmentView'),
    emb('headQualifiersCompartment', 'UMLQualifierCompartmentView')
  ]),
  t('UMLContainmentView', 'EdgeView'),

  // Component / deployment / package / profile views
  t('UMLComponentView', 'UMLClassifierView'),
  t('UMLArtifactView', 'UMLClassifierView'),
  t('UMLNodeView', 'UMLClassifierView'),
  t('UMLSubsystemView', 'UMLPackageView'),
  t('UMLProfileView', 'UMLPackageView'),
  t('UMLMetaClassView', 'UMLGeneralNodeView'),
  t('UMLStereotypeView', 'UMLClassView'),
  t('UMLComponentRealizationView', 'UMLGeneralEdgeView'),
  t('UMLDeploymentView', 'UMLGeneralEdgeView'),
  t('UMLCommunicationPathView', 'UMLAssociationView'),
  t('UMLExtensionView', 'UMLGeneralEdgeView'),

  // Use case diagram views
  t('UMLActorView', 'UMLClassifierView'),
  t('UMLUseCaseView', 'UMLClassifierView', [emb('extensionPointCompartment', 'UMLExtensionPointCompartmentView')]),
  t('UMLIncludeView', 'UMLGeneralEdgeView'),
  t('UMLExtendView', 'UMLGeneralEdgeView'),
  t('UMLUseCaseSubjectView', 'UMLGeneralNodeView'),

  // Sequence diagram views
  t('UMLCustomFrameView', 'NodeView', [emb('nameLabel', 'LabelView'), emb('frameTypeLabel', 'LabelView')], {
    abstract: true
  }),
  t('UMLFrameView', 'UMLCustomFrameView', [
    bool('showType', false),
    bool('showNamespace', false),
    bool('showDiagramName', false)
  ]),
  t('UMLSeqLifelineView', 'UMLGeneralNodeView', [emb('linePart', 'UMLLinePartView')]),
  t('UMLLinePartView', 'NodeView'),
  t('UMLSeqMessageView', 'EdgeView', [
    ...relationshipLabels(),
    emb('activation', 'UMLActivationView'),
    bool('showProperty', true),
    bool('showType', true)
  ]),
  t('UMLActivationView', 'NodeView'),
  t('UMLMessageEndpointView', 'NodeView'),
  t('UMLEndpointView', 'UMLMessageEndpointView'),
  t('UMLGateView', 'UMLMessageEndpointView'),
  t('UMLCombinedFragmentView', 'UMLCustomFrameView', [
    emb('operandCompartment', 'UMLInteractionOperandCompartmentView')
  ]),
  t('UMLInteractionOperandView', 'NodeView', [emb('guardLabel', 'LabelView')]),
  t('UMLInteractionUseView', 'NodeView', [
    emb('nameLabel', 'LabelView'),
    emb('frameTypeLabel', 'LabelView'),
    bool('wordWrap', false)
  ]),
  t('UMLStateInvariantView', 'NodeView', [emb('invariantLabel', 'LabelView')]),
  t('UMLContinuationView', 'NodeView', [emb('nameLabel', 'LabelView')]),
  t('UMLDurationConstraintView', 'NodeView', [emb('nameLabel', 'NodeLabelView')]),
  t('UMLTimeConstraintView', 'LabelView'),
  t('UMLTimeConstraintLinkView', 'EdgeView'),

  // Activity diagram views
  t('UMLActionView', 'UMLGeneralNodeView'),
  t('UMLObjectNodeView', 'UMLGeneralNodeView'),
  t('UMLControlNodeView', 'NodeView'),
  t('UMLSwimlaneView', 'NodeView', [emb('nameLabel', 'LabelView'), bool('isVertical', true)]),
  t('UMLControlFlowView', 'UMLGeneralEdgeView'),
  t('UMLObjectFlowView', 'UMLGeneralEdgeView'),
  t('UMLPinView', 'UMLFloatingNodeView', [], { abstract: true }),
  t('UMLInputPinView', 'UMLPinView'),
  t('UMLOutputPinView', 'UMLPinView'),

  // Annotations (view-only)
  t(
    'UMLCustomTextView',
    'NodeView',
    [str('text', ''), bool('wordWrap', true), int('horzAlign', 0), int('vertAlign', 3)],
    { abstract: true }
  ),
  t('UMLCustomNoteView', 'UMLCustomTextView', [], { abstract: true }),
  t('UMLNoteView', 'UMLCustomNoteView'),
  t('UMLTextView', 'UMLCustomTextView'),
  t('UMLNoteLinkView', 'EdgeView')
]

export const UML_TYPES: TypeDef[] = [...MODEL_TYPES, ...VIEW_TYPES]
