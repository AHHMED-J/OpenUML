/**
 * Model > Add and Add Diagram: which items are offered for a selected parent, and creating them
 * (each creation is one undoable operation through `commands/`).
 */
import {
  addFeature,
  createDiagram,
  createModelElement,
  type ModelEngine
} from '../commands'
import {
  createElement,
  defaultName,
  isKindOf,
  type DiagramKind,
  type Elem,
  type FeatureKind
} from '../model'

export interface AddItem {
  /** Menu id suffix (`uml.<id>`). */
  readonly id: string
  readonly label: string
  /** Element type created. */
  readonly type: string
  /** Created through `addFeature` (adds item views to every view of the owner). */
  readonly feature?: FeatureKind
  /** Containment field for plain elements (default `ownedElements`). */
  readonly field?: string
  /** Visible when the (effective) parent satisfies this. */
  readonly accepts: (parent: Elem) => boolean
}

const isProject = (e: Elem): boolean => isKindOf(e, 'Project')
const isPackage = (e: Elem): boolean => isKindOf(e, 'UMLPackage') || e._type === 'UMLSubsystem'
const isClassifier = (e: Elem): boolean => isKindOf(e, 'UMLClassifier')
const projectOrPackage = (e: Elem): boolean => isProject(e) || isPackage(e)
const namespace = (e: Elem): boolean => projectOrPackage(e) || isClassifier(e)

export const ADD_ITEMS: readonly AddItem[] = [
  { id: 'model', label: 'Model', type: 'UMLModel', accepts: projectOrPackage },
  { id: 'package', label: 'Package', type: 'UMLPackage', accepts: projectOrPackage },
  { id: 'class', label: 'Class', type: 'UMLClass', accepts: namespace },
  { id: 'interface', label: 'Interface', type: 'UMLInterface', accepts: namespace },
  { id: 'datatype', label: 'DataType', type: 'UMLDataType', accepts: namespace },
  { id: 'enumeration', label: 'Enumeration', type: 'UMLEnumeration', accepts: namespace },
  { id: 'usecase', label: 'Use Case', type: 'UMLUseCase', accepts: namespace },
  { id: 'actor', label: 'Actor', type: 'UMLActor', accepts: namespace },
  { id: 'attribute', label: 'Attribute', type: 'UMLAttribute', feature: 'Attribute', accepts: isClassifier },
  { id: 'operation', label: 'Operation', type: 'UMLOperation', feature: 'Operation', accepts: isClassifier },
  {
    id: 'parameter',
    label: 'Parameter',
    type: 'UMLParameter',
    feature: 'Parameter',
    accepts: (e) => isKindOf(e, 'UMLBehavioralFeature') || isKindOf(e, 'UMLActivity')
  },
  {
    id: 'enumeration-literal',
    label: 'Enumeration Literal',
    type: 'UMLEnumerationLiteral',
    feature: 'EnumerationLiteral',
    accepts: (e) => isKindOf(e, 'UMLEnumeration')
  },
  {
    id: 'extension-point',
    label: 'Extension Point',
    type: 'UMLExtensionPoint',
    feature: 'ExtensionPoint',
    accepts: (e) => isKindOf(e, 'UMLUseCase')
  },
  { id: 'collaboration', label: 'Collaboration', type: 'UMLCollaboration', accepts: namespace },
  { id: 'interaction', label: 'Interaction', type: 'UMLInteraction', accepts: isClassifier },
  { id: 'activity', label: 'Activity', type: 'UMLActivity', accepts: namespace },
  { id: 'action', label: 'Action', type: 'UMLAction', field: 'nodes', accepts: (e) => isKindOf(e, 'UMLActivity') },
  {
    id: 'interaction-operand',
    label: 'Interaction Operand',
    type: 'UMLInteractionOperand',
    feature: 'Operand',
    accepts: (e) => isKindOf(e, 'UMLCombinedFragment')
  }
]

export interface AddDiagramItem {
  readonly kind: DiagramKind
  readonly label: string
  readonly type: string
  readonly accepts: (parent: Elem) => boolean
}

function hasInteractionDiagram(e: Elem): boolean {
  const owned = e['ownedElements']
  return Array.isArray(owned) && owned.some((c) => isKindOf(c as Elem, 'UMLSequenceDiagram'))
}

export const ADD_DIAGRAM_ITEMS: readonly AddDiagramItem[] = [
  { kind: 'ClassDiagram', label: 'Class Diagram', type: 'UMLClassDiagram', accepts: projectOrPackage },
  { kind: 'UseCaseDiagram', label: 'Use Case Diagram', type: 'UMLUseCaseDiagram', accepts: projectOrPackage },
  {
    kind: 'SequenceDiagram',
    label: 'Sequence Diagram',
    type: 'UMLSequenceDiagram',
    accepts: (e) =>
      projectOrPackage(e) ||
      isClassifier(e) ||
      isKindOf(e, 'UMLOperation') ||
      (isKindOf(e, 'UMLInteraction') && !hasInteractionDiagram(e))
  },
  {
    kind: 'ActivityDiagram',
    label: 'Activity Diagram',
    type: 'UMLActivityDiagram',
    accepts: (e) => projectOrPackage(e) || isClassifier(e) || isKindOf(e, 'UMLOperation') || isKindOf(e, 'UMLActivity')
  }
]

/** Items of Model > Add visible for `parent`. */
export function addItemsFor(parent: Elem | null): AddItem[] {
  return parent ? ADD_ITEMS.filter((i) => i.accepts(parent)) : []
}

export function addDiagramItemsFor(parent: Elem | null): AddDiagramItem[] {
  return parent ? ADD_DIAGRAM_ITEMS.filter((i) => i.accepts(parent)) : []
}

/** Creates an element of `item` under `parent` as one operation; returns it. */
export function addModelElement(engine: ModelEngine, parent: Elem, item: AddItem): Elem {
  if (!item.accepts(parent)) throw new Error(`${item.label} cannot be placed here.`)
  if (item.feature) return addFeature(engine, parent, item.feature)
  const field = item.field ?? 'ownedElements'
  const siblings = (parent[field] as unknown[] | undefined) ?? []
  const element = createElement(item.type, { name: defaultName(item.type, siblings) })
  return createModelElement(engine, parent, element, field)
}

/** Creates a diagram under `parent`; returns the new diagram. */
export function addDiagram(engine: ModelEngine, parent: Elem, kind: DiagramKind): Elem {
  const item = ADD_DIAGRAM_ITEMS.find((i) => i.kind === kind)
  if (item && !item.accepts(parent)) throw new Error(`${item.label} cannot be placed here.`)
  return createDiagram(engine, kind, parent).diagram
}
