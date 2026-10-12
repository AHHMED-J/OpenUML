/**
 * TypeScript shapes of model elements and views.
 *
 * Elements are plain mutable objects whose property names are the `.mdj` field names
 * (`_type`, `_id`, `_parent`, `name`, `ownedElements`, ...). References are held as direct
 * object references in memory and become `{"$ref": id}` only in files.
 *
 * The interfaces below give typed access to the most used types. Every element also
 * satisfies the open `Elem` index signature, so any field can still be read generically;
 * use `isKindOf(el, 'TypeName')` from `metamodel.ts` to narrow.
 */

/** Base of every element (model element, diagram or view). */
export interface Elem {
  _type: string
  _id: string
  /** Owning element (the element whose containment field holds this one); null for a root. */
  _parent: Elem | null
  [field: string]: unknown
}

/** Font value of `View.font`, encoded in files as `"face;size;style"`. */
export interface Font {
  readonly face: string
  readonly size: number
  /** 0 normal, 1 bold, 2 italic, 3 bold+italic. */
  readonly style: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

/** Polyline of `EdgeView.points`, tail end first. Treat as immutable; assign a new array to change it. */
export type Points = readonly Point[]

export interface Bounds {
  left: number
  top: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------------------------
// Core model types

export interface Model extends Elem {
  name: string
  ownedElements: Elem[]
}

export interface Tag extends Model {
  kind: string
  value: string
  reference: Elem | null
  checked: boolean
  number: number
  options: string
  hidden: boolean
}

export interface ExtensibleModel extends Model {
  documentation: string
  tags: Tag[]
}

export type Relationship = ExtensibleModel

export interface DirectedRelationship extends ExtensibleModel {
  source: Elem | null
  target: Elem | null
}

export interface RelationshipEnd extends ExtensibleModel {
  reference: Elem | null
}

export interface UndirectedRelationship extends ExtensibleModel {
  end1: RelationshipEnd | null
  end2: RelationshipEnd | null
}

export interface Diagram extends ExtensibleModel {
  visible: boolean
  defaultDiagram: boolean
  ownedViews: View[]
}

export interface Project extends ExtensibleModel {
  author: string
  company: string
  copyright: string
  version: string
  documentVersion: number
}

// ---------------------------------------------------------------------------------------------
// Core view types

export interface View extends Elem {
  model: Elem | null
  subViews: View[]
  containerView: View | null
  containedViews: View[]
  visible: boolean
  enabled: boolean
  lineColor: string
  fillColor: string
  fontColor: string
  font: Font
  parentStyle: boolean
  showShadow: boolean
  containerChangeable: boolean
  containerExtending: boolean
}

export interface NodeView extends View {
  left: number
  top: number
  width: number
  height: number
  autoResize: boolean
}

interface LabelFields {
  underline: boolean
  text: string
  horizontalAlignment: number
  verticalAlignment: number
  wordWrap: boolean
}

export interface LabelView extends NodeView, LabelFields {}

export interface ParasiticView extends NodeView {
  alpha: number
  distance: number
}

export interface NodeParasiticView extends ParasiticView {
  hostNode: View | null
}

export interface NodeLabelView extends NodeParasiticView, LabelFields {}

export interface EdgeParasiticView extends ParasiticView {
  hostEdge: EdgeView | null
  /** 0 head, 1 middle, 2 tail. */
  edgePosition: number
}

export interface EdgeLabelView extends EdgeParasiticView, LabelFields {}

export interface EdgeView extends View {
  head: View | null
  tail: View | null
  /** 0 rectilinear, 1 oblique, 2 rounded rectilinear, 3 curve, 4 direct. */
  lineStyle: number
  points: Points
}

// ---------------------------------------------------------------------------------------------
// UML model types (MVP subset with typed access)

export interface UMLModelElement extends ExtensibleModel {
  /** A `UMLStereotype` element or a plain stereotype name. */
  stereotype: Elem | string | null
  visibility: string
  templateParameters: Elem[]
}

export interface UMLFeature extends UMLModelElement {
  isStatic: boolean
  isLeaf: boolean
  featureDirection: string
}

export interface UMLStructuralFeature extends UMLFeature {
  /** A classifier element or a free-text type such as `"int"`. */
  type: Elem | string | null
  multiplicity: string
  isReadOnly: boolean
  isOrdered: boolean
  isUnique: boolean
  defaultValue: string
}

export interface UMLAttribute extends UMLStructuralFeature {
  isDerived: boolean
  aggregation: string
  isID: boolean
}

export interface UMLParameter extends UMLStructuralFeature {
  direction: string
}

export interface UMLBehavioralFeature extends UMLFeature {
  parameters: UMLParameter[]
  raisedExceptions: Elem[]
  concurrency: string
}

export interface UMLOperation extends UMLBehavioralFeature {
  isQuery: boolean
  isAbstract: boolean
  specification: string
}

export interface UMLClassifier extends UMLModelElement {
  attributes: UMLAttribute[]
  operations: UMLOperation[]
  receptions: Elem[]
  behaviors: Elem[]
  isAbstract: boolean
  isFinalSpecialization: boolean
  isLeaf: boolean
}

export interface UMLEnumeration extends UMLClassifier {
  literals: UMLModelElement[]
}

export interface UMLUseCase extends UMLClassifier {
  extensionPoints: UMLModelElement[]
}

export interface UMLRelationshipEnd extends RelationshipEnd {
  stereotype: string
  visibility: string
  navigable: string
  aggregation: string
  multiplicity: string
  defaultValue: string
  isReadOnly: boolean
  isOrdered: boolean
  isUnique: boolean
  isDerived: boolean
  isID: boolean
}

export interface UMLAssociation extends UndirectedRelationship {
  end1: UMLRelationshipEnd | null
  end2: UMLRelationshipEnd | null
  isDerived: boolean
}

export interface UMLLifeline extends UMLModelElement {
  selector: string
  represent: Elem | null
  isMultiInstance: boolean
}

export interface UMLMessage extends DirectedRelationship {
  messageSort: string
  signature: Elem | null
  sequenceNumber: string
  arguments: string
  assignmentTarget: string
  guard: string
  iteration: string
  isConcurrentIteration: boolean
}

export interface UMLInteraction extends UMLModelElement {
  messages: UMLMessage[]
  participants: Elem[]
  fragments: Elem[]
}

export interface UMLCombinedFragment extends UMLModelElement {
  interactionOperator: string
  operands: UMLModelElement[]
}

export interface UMLActivity extends UMLModelElement {
  nodes: Elem[]
  edges: Elem[]
  groups: Elem[]
}

export interface UMLAction extends UMLModelElement {
  kind: string
  inputs: Elem[]
  outputs: Elem[]
}

// ---------------------------------------------------------------------------------------------
// UML view types (MVP subset with typed access)

export interface UMLNameCompartmentView extends NodeView {
  stereotypeLabel: LabelView | null
  nameLabel: LabelView | null
  namespaceLabel: LabelView | null
  propertyLabel: LabelView | null
}

export interface UMLGeneralNodeView extends NodeView {
  stereotypeDisplay: string
  showVisibility: boolean
  showNamespace: boolean
  showProperty: boolean
  showType: boolean
  nameCompartment: UMLNameCompartmentView | null
  wordWrap: boolean
}

export interface UMLClassifierView extends UMLGeneralNodeView {
  suppressAttributes: boolean
  suppressOperations: boolean
  suppressReceptions: boolean
  showMultiplicity: boolean
  showOperationSignature: boolean
  attributeCompartment: NodeView | null
  operationCompartment: NodeView | null
  receptionCompartment: NodeView | null
  templateParameterCompartment: NodeView | null
}

export interface UMLGeneralEdgeView extends EdgeView {
  stereotypeDisplay: string
  showVisibility: boolean
  showProperty: boolean
  nameLabel: EdgeLabelView | null
  stereotypeLabel: EdgeLabelView | null
  propertyLabel: EdgeLabelView | null
}

export interface UMLUndirectedRelationshipView extends UMLGeneralEdgeView {
  showMultiplicity: boolean
  showType: boolean
  showEndOrder: number
  tailRoleNameLabel: EdgeLabelView | null
  tailPropertyLabel: EdgeLabelView | null
  tailMultiplicityLabel: EdgeLabelView | null
  headRoleNameLabel: EdgeLabelView | null
  headPropertyLabel: EdgeLabelView | null
  headMultiplicityLabel: EdgeLabelView | null
}

export interface UMLSeqLifelineView extends UMLGeneralNodeView {
  linePart: NodeView | null
}

export interface UMLSeqMessageView extends EdgeView {
  nameLabel: EdgeLabelView | null
  stereotypeLabel: EdgeLabelView | null
  propertyLabel: EdgeLabelView | null
  activation: NodeView | null
  showProperty: boolean
  showType: boolean
}

export interface UMLCustomTextView extends NodeView {
  text: string
  wordWrap: boolean
  horzAlign: number
  vertAlign: number
}

/** Maps type names to their TypeScript interface, used by `isKindOf` for narrowing. */
export interface TypeMap {
  Element: Elem
  Model: Model
  Tag: Tag
  ExtensibleModel: ExtensibleModel
  Relationship: Relationship
  DirectedRelationship: DirectedRelationship
  UndirectedRelationship: UndirectedRelationship
  RelationshipEnd: RelationshipEnd
  Diagram: Diagram
  Project: Project
  View: View
  NodeView: NodeView
  LabelView: LabelView
  ParasiticView: ParasiticView
  NodeParasiticView: NodeParasiticView
  NodeLabelView: NodeLabelView
  EdgeParasiticView: EdgeParasiticView
  EdgeLabelView: EdgeLabelView
  EdgeView: EdgeView
  UMLModelElement: UMLModelElement
  UMLFeature: UMLFeature
  UMLStructuralFeature: UMLStructuralFeature
  UMLAttribute: UMLAttribute
  UMLParameter: UMLParameter
  UMLBehavioralFeature: UMLBehavioralFeature
  UMLOperation: UMLOperation
  UMLClassifier: UMLClassifier
  UMLEnumeration: UMLEnumeration
  UMLUseCase: UMLUseCase
  UMLRelationshipEnd: UMLRelationshipEnd
  UMLAssociation: UMLAssociation
  UMLLifeline: UMLLifeline
  UMLMessage: UMLMessage
  UMLInteraction: UMLInteraction
  UMLCombinedFragment: UMLCombinedFragment
  UMLActivity: UMLActivity
  UMLAction: UMLAction
  UMLNameCompartmentView: UMLNameCompartmentView
  UMLGeneralNodeView: UMLGeneralNodeView
  UMLClassifierView: UMLClassifierView
  UMLGeneralEdgeView: UMLGeneralEdgeView
  UMLUndirectedRelationshipView: UMLUndirectedRelationshipView
  UMLSeqLifelineView: UMLSeqLifelineView
  UMLSeqMessageView: UMLSeqMessageView
  UMLCustomTextView: UMLCustomTextView
}
