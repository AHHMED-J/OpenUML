/**
 * Model explorer tree logic (pure): which children a node shows, their order, labels, and
 * drag-and-drop containment checks.
 */
import {
  containmentFields,
  fieldOf,
  idef0DiagramLabel,
  isElem,
  isKindOf,
  typeDisplayName,
  type Elem,
  type FieldDef
} from '../../model'
import type { SortMode } from '../uiStore'

/** Containment fields never shown as tree children (views, tags, association ends). */
const HIDDEN_FIELDS = new Set(['ownedViews', 'subViews', 'tags', 'end1', 'end2', 'ports'])

const TYPE_ORDER: Readonly<Record<string, number>> = {
  UMLModel: 1000,
  UMLPackage: 1001,
  UMLSubsystem: 1002,
  UMLUseCaseSubject: 1003,
  IDEF0Model: 1004,
  UMLTemplateParameter: 1100,
  UMLParameter: 1101,
  UMLEnumerationLiteral: 1102,
  UMLPort: 1103,
  UMLAttribute: 1104,
  UMLOperation: 1105,
  UMLReception: 1106,
  UMLExtensionPoint: 1107,
  UMLSlot: 1108,
  UMLClass: 1200,
  UMLInterface: 1201,
  UMLSignal: 1202,
  UMLDataType: 1203,
  UMLPrimitiveType: 1204,
  UMLEnumeration: 1205,
  UMLArtifact: 1206,
  UMLComponent: 1207,
  UMLNode: 1208,
  UMLUseCase: 1209,
  UMLActor: 1210,
  IDEF0Function: 1211,
  UMLCollaboration: 1400,
  UMLStateMachine: 1401,
  UMLInteraction: 1402,
  UMLActivity: 1403,
  UMLLifeline: 1410,
  UMLGate: 1411,
  UMLEndpoint: 1412,
  UMLCombinedFragment: 1413,
  UMLInteractionOperand: 1414,
  UMLInteractionUse: 1415,
  UMLMessage: 1416,
  UMLAction: 1420,
  UMLInputPin: 1421,
  UMLOutputPin: 1422,
  UMLObjectNode: 1423,
  UMLInitialNode: 1424,
  UMLActivityFinalNode: 1425,
  UMLFlowFinalNode: 1426,
  UMLForkNode: 1427,
  UMLJoinNode: 1428,
  UMLDecisionNode: 1429,
  UMLMergeNode: 1430,
  UMLActivityPartition: 1431,
  UMLControlFlow: 1440,
  UMLObjectFlow: 1441,
  UMLConstraint: 1500,
  UMLAssociation: 1801,
  UMLDependency: 1802,
  UMLGeneralization: 1803,
  UMLRealization: 1804,
  UMLInterfaceRealization: 1805,
  UMLInclude: 1806,
  UMLExtend: 1807,
  UMLProfile: 1900,
  UMLStereotype: 1901
}

/** Sort group of a type: diagrams first, then packages, features, classifiers, behaviors, relationships. */
export function typeOrder(el: Elem): number {
  if (isKindOf(el, 'Diagram')) return 0
  const known = TYPE_ORDER[el._type]
  if (known !== undefined) return known
  if (isKindOf(el, 'UMLPackage')) return 1009
  if (isKindOf(el, 'UMLFeature')) return 1150
  if (isKindOf(el, 'UMLClassifier')) return 1250
  if (/Instance|Object/.test(el._type)) return 1300
  if (isKindOf(el, 'UMLBehavior') || isKindOf(el, 'UMLActivityNode')) return 1450
  if (isKindOf(el, 'Relationship')) return 1850
  return 1600
}

/** Children shown under `el` in the explorer, in display order. */
export function explorerChildren(el: Elem, sortBy: SortMode = 'added'): Elem[] {
  const items: Array<{ el: Elem; order: number; index: number }> = []
  let index = 0
  for (const field of containmentFields(el)) {
    if (HIDDEN_FIELDS.has(field.name)) continue
    const value = el[field.name]
    const list = Array.isArray(value) ? value : value ? [value] : []
    for (const child of list) {
      if (isElem(child) && !isKindOf(child, 'View')) items.push({ el: child, order: typeOrder(child), index: index++ })
    }
  }
  items.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    if (sortBy === 'name') {
      const c = nameOf(a.el).localeCompare(nameOf(b.el), undefined, { sensitivity: 'base', numeric: true })
      if (c !== 0) return c
    }
    return a.index - b.index
  })
  return items.map((i) => i.el)
}

export function hasExplorerChildren(el: Elem): boolean {
  for (const field of containmentFields(el)) {
    if (HIDDEN_FIELDS.has(field.name)) continue
    const value = el[field.name]
    if (Array.isArray(value) ? value.some((v) => isElem(v) && !isKindOf(v, 'View')) : isElem(value)) return true
  }
  return false
}

function nameOf(el: Elem | null | undefined): string {
  const name = el?.['name']
  return typeof name === 'string' ? name : ''
}

/** Display text of a `var` value (string or referenced element). */
export function variantText(value: unknown): string {
  if (typeof value === 'string') return value
  if (isElem(value)) return nameOf(value)
  return ''
}

/** Explorer label: name, `(Type)` when unnamed, relationship ends, optional «stereotype». */
export function explorerLabel(el: Elem, showStereotype = true): string {
  let label = nameOf(el)
  if (isKindOf(el, 'DirectedRelationship')) {
    const ends = `(${nameOf(el['source'] as Elem) || '?'}→${nameOf(el['target'] as Elem) || '?'})`
    label = label ? `${label} ${ends}` : ends
  } else if (isKindOf(el, 'UndirectedRelationship')) {
    const end = (e: unknown): string => nameOf((e as Elem | null)?.['reference'] as Elem) || '?'
    const ends = `(${end(el['end1'])}—${end(el['end2'])})`
    label = label ? `${label} ${ends}` : ends
  } else if (!label) {
    label = `(${typeDisplayName(el._type)})`
  }
  if (isKindOf(el, 'IDEF0Diagram')) label = idef0DiagramLabel(el, label)
  if (showStereotype) {
    const st = variantText(el['stereotype'])
    if (st) label = `«${st}»${label}`
  }
  return label
}

/** Ids of every element with explorer children under `root` (for Expand All). */
export function expandableIds(root: Elem): string[] {
  const result: string[] = []
  const visit = (el: Elem): void => {
    if (!hasExplorerChildren(el)) return
    result.push(el._id)
    for (const child of explorerChildren(el)) visit(child)
  }
  visit(root)
  return result
}

/**
 * Containment rule for `ownedElements` (the generic packaged-element slot): whether `target` may
 * own `source` there. The slot exists on every model element, but only some owners are
 * meaningful:
 * - the project and packages (Model, Profile) own any packageable element, relationship or diagram;
 * - classes, interfaces, components and collaborations own nested classifiers/behaviors, and diagrams;
 * - other classifiers and behaviors (activities, interactions, ...) own diagrams only (their
 *   contents live in dedicated fields: attributes, operations, nodes, edges, lifelines, ...);
 * - anything else (features, pins, messages, ...) owns nothing there.
 */
export function canOwn(target: Elem, source: Elem): boolean {
  if (isKindOf(source, 'Project') || isKindOf(source, 'View')) return false
  const isDiagram = isKindOf(source, 'Diagram')
  if (isKindOf(target, 'Project') || isKindOf(target, 'UMLPackage')) return true
  // A subsystem is a component, but also a package-like unit of decomposition.
  const nestsClassifiers =
    isKindOf(target, 'UMLClass') || isKindOf(target, 'UMLInterface') || isKindOf(target, 'UMLComponent') || isKindOf(target, 'UMLNode') || isKindOf(target, 'UMLCollaboration')
  if (nestsClassifiers) return isDiagram || isKindOf(source, 'UMLClassifier') || isKindOf(source, 'UMLBehavior')
  if (isKindOf(target, 'UMLClassifier') || isKindOf(target, 'UMLBehavior')) return isDiagram
  return false
}

/**
 * The containment field of `target` that can hold `source` when dropped on it (keeping the
 * source's current field name when the target has it), or null if the drop is invalid. Besides
 * the metamodel's field types, `ownedElements` drops follow the `canOwn` containment rules.
 */
export function dropField(target: Elem, source: Elem): string | null {
  if (target === source || isKindOf(source, 'Project') || isKindOf(source, 'View') || isKindOf(target, 'View')) return null
  for (let p: Elem | null = target; p; p = p._parent) if (p === source) return null
  const owner = source._parent
  if (!owner) return null
  const current = containmentFields(owner).find((f) => {
    const v = owner[f.name]
    return Array.isArray(v) && v.includes(source)
  })
  if (!current) return null
  const accepts = (f: FieldDef | undefined): f is FieldDef =>
    f !== undefined && f.kind === 'objs' && !HIDDEN_FIELDS.has(f.name) && isKindOf(source, f.type)
  const same = fieldOf(target, current.name)
  if (accepts(same)) return same.name === 'ownedElements' && !canOwn(target, source) ? null : same.name
  const owned = fieldOf(target, 'ownedElements')
  if (!accepts(owned) || !canOwn(target, source)) return null
  if (current.name === 'ownedElements') return owned.name
  // Diagrams can live in ownedElements of any element that may own them.
  if (isKindOf(source, 'Diagram')) return owned.name
  return null
}

/** `_parent` chain from the root down to `el` (inclusive), for breadcrumbs and reveal. */
export function pathTo(el: Elem): Elem[] {
  const chain: Elem[] = []
  for (let p: Elem | null = el; p; p = p._parent) chain.unshift(p)
  return chain
}
