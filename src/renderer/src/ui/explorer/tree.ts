/**
 * Model explorer tree logic (pure): which children a node shows, their order, labels, and
 * drag-and-drop containment checks.
 *
 * IDEF0 arrows are presented around the function boxes they touch rather than under the scope
 * that owns them: each box lists its arrows (virtually; the model is unchanged) in role folders
 * (`Inputs (2)`, `Controls (1)`, ...) or, ungrouped, as a flat list, labeled `Role N: name`. A
 * box-to-box arrow therefore shows under both boxes, with its role at each. Arrows that touch no
 * box (a branch between a port and a trunk) stay under their owner.
 */
import {
  arrowDisplayName,
  arrowRoleLabel,
  boxArrowGroups,
  containmentFields,
  diagramNodeNumber,
  diagramOfScope,
  fieldOf,
  icomCodes,
  idef0DiagramLabel,
  isElem,
  isIdef0Function,
  isKindOf,
  nodeNumber,
  roleOf,
  rolesAt,
  rootArrow,
  ROLE_PLURAL,
  ROLE_TITLE,
  typeDisplayName,
  type Elem,
  type FieldDef,
  type Idef0Role
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

/** An IDEF0 arrow shown under the boxes it touches instead of under its owner. */
function isBoxArrow(el: Elem): boolean {
  if (!isKindOf(el, 'IDEF0Arrow')) return false
  const touches = (end: unknown): boolean => isIdef0Function(end as Elem | null) && rolesAt(el, end as Elem).length > 0
  return touches(el['source']) || touches(el['target'])
}

/** Whether `child` is listed under its owner (views and box arrows are not). */
function listedChild(child: unknown): child is Elem {
  return isElem(child) && !isKindOf(child, 'View') && !isBoxArrow(child)
}

/** Children shown under `el` in the explorer, in display order (IDEF0 boxes by box number). */
export function explorerChildren(el: Elem, sortBy: SortMode = 'added'): Elem[] {
  const items: Array<{ el: Elem; order: number; index: number }> = []
  let index = 0
  for (const field of containmentFields(el)) {
    if (HIDDEN_FIELDS.has(field.name)) continue
    const value = el[field.name]
    const list = Array.isArray(value) ? value : value ? [value] : []
    for (const child of list) {
      if (listedChild(child)) items.push({ el: child, order: typeOrder(child), index: index++ })
    }
  }
  items.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    if (isIdef0Function(a.el) && isIdef0Function(b.el)) {
      const c = (a.el['boxNumber'] as number) - (b.el['boxNumber'] as number)
      if (c !== 0) return c
    }
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
    if (Array.isArray(value) ? value.some(listedChild) : isElem(value)) return true
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
  else if (isIdef0Function(el)) label = `${nodeNumber(el)} ${label}`
  if (showStereotype) {
    const st = variantText(el['stereotype'])
    if (st) label = `«${st}»${label}`
  }
  return label
}

/** Keys of every element node with children under `root` (for Expand All). */
export function expandableIds(root: Elem): string[] {
  const result: string[] = []
  const visit = (node: TreeNode): void => {
    if (node.kind !== 'element' || !hasTreeChildren(node)) return
    result.push(node.key)
    for (const child of treeChildren(node, { groupArrows: false })) visit(child)
  }
  visit(elementNode(root))
  return result
}

// ---------------------------------------------------------------------------------------------
// Tree nodes: elements plus the virtual IDEF0 role folders and arrow entries

/** A model element at its place in the tree; its key is its id (an element is listed once). */
export interface ElementNode {
  readonly kind: 'element'
  readonly key: string
  readonly el: Elem
}

/** A role folder under a function box (`Inputs (2)`); never stored in the model. */
export interface FolderNode {
  readonly kind: 'folder'
  readonly key: string
  readonly box: Elem
  readonly role: Idef0Role
  readonly arrows: readonly Elem[]
}

/** An arrow listed under a box it touches, with its role and position at that box. */
export interface ArrowNode {
  readonly kind: 'arrow'
  readonly key: string
  readonly el: Elem
  readonly box: Elem
  readonly role: Idef0Role
  readonly position: number
}

export type TreeNode = ElementNode | FolderNode | ArrowNode

export interface TreeOptions {
  readonly sortBy?: SortMode
  /** Arrows of a box in role folders (default) or as a flat list. */
  readonly groupArrows?: boolean
}

export function elementNode(el: Elem): ElementNode {
  return { kind: 'element', key: el._id, el }
}

/** Key of the role folder of `role` under `box` (also the key of its remembered open state). */
export function folderKey(box: Elem, role: Idef0Role): string {
  return `${box._id}/${role}`
}

function arrowNode(box: Elem, role: Idef0Role, arrow: Elem, position: number): ArrowNode {
  return { kind: 'arrow', key: `${box._id}/${role}/${arrow._id}`, el: arrow, box, role, position }
}

function arrowNodes(box: Elem, role: Idef0Role, arrows: readonly Elem[]): ArrowNode[] {
  return arrows.map((a, i) => arrowNode(box, role, a, i + 1))
}

/** Children of a tree node, in display order: under a box its diagram first, then its arrows, then its child boxes. */
export function treeChildren(node: TreeNode, options: TreeOptions = {}): TreeNode[] {
  if (node.kind === 'arrow') return []
  if (node.kind === 'folder') return arrowNodes(node.box, node.role, node.arrows)
  const children: TreeNode[] = explorerChildren(node.el, options.sortBy ?? 'added').map(elementNode)
  if (!isIdef0Function(node.el)) return children
  const groups = boxArrowGroups(node.el)
  if (groups.length === 0) return children
  const arrows: TreeNode[] =
    options.groupArrows === false
      ? groups.flatMap((g) => arrowNodes(node.el, g.role, g.arrows))
      : groups.map((g) => ({ kind: 'folder', key: folderKey(node.el, g.role), box: node.el, role: g.role, arrows: g.arrows }))
  const diagrams = children.filter((c) => c.kind === 'element' && isKindOf(c.el, 'Diagram'))
  return [...diagrams, ...arrows, ...children.slice(diagrams.length)]
}

export function hasTreeChildren(node: TreeNode): boolean {
  if (node.kind === 'arrow') return false
  if (node.kind === 'folder') return node.arrows.length > 0
  if (hasExplorerChildren(node.el)) return true
  const fn = node.el
  if (!isIdef0Function(fn)) return false
  const arrows = fn._parent?.['arrows']
  return Array.isArray(arrows) && (arrows as Elem[]).some((a) => a['source'] === fn || a['target'] === fn)
}

/** The role folders of every box under `root` (for Collapse / Expand All Arrow Folders). */
export function arrowFolderKeys(root: Elem): string[] {
  const keys: string[] = []
  const visit = (el: Elem): void => {
    if (isIdef0Function(el)) for (const g of boxArrowGroups(el)) keys.push(folderKey(el, g.role))
    for (const child of explorerChildren(el)) visit(child)
  }
  visit(root)
  return keys
}

/** Row text of a node. */
export function treeLabel(node: TreeNode, showStereotype = true): string {
  if (node.kind === 'element') return explorerLabel(node.el, showStereotype)
  if (node.kind === 'folder') return `${ROLE_PLURAL[node.role]} (${node.arrows.length})`
  return arrowRoleLabel(node.role, node.position, arrowDisplayName(node.el))
}

/** Tooltip of a node: the label with the element type, or the full story of an arrow entry. */
export function treeTooltip(node: TreeNode, showStereotype = true): string {
  if (node.kind === 'element') return `${explorerLabel(node.el, showStereotype)} [${typeDisplayName(node.el._type)}]`
  if (node.kind === 'folder') return `${treeLabel(node)} of ${nodeNumber(node.box)}`
  return arrowTooltip(node.el, node.box, node.role, node.position)
}

/** The box end of `arrow` at `box` is the target end for input, control and mechanism. */
function entersAt(role: Idef0Role): boolean {
  return role === 'input' || role === 'control' || role === 'mechanism'
}

function positionAt(arrow: Elem, box: Elem, role: Idef0Role): number {
  return (boxArrowGroups(box).find((g) => g.role === role)?.arrows.indexOf(arrow) ?? -1) + 1
}

function boundaryCode(port: Elem): string | undefined {
  const diagram = diagramOfScope(port._parent)
  return diagram ? icomCodes(diagram).get(port._id) : undefined
}

/** Where the other end of `arrow` goes, seen from its end of `role` (`from Output 1 of A1`, `from boundary I1`). */
function otherEndText(arrow: Elem, role: Idef0Role): string {
  if (role === 'call') {
    const target = arrowDisplayName(arrow)
    return target ? `calls ${target}` : 'calls no box yet'
  }
  const enters = entersAt(role)
  const dir = enters ? 'from' : 'to'
  const other = (enters ? arrow['source'] : arrow['target']) as Elem | null
  if (isIdef0Function(other)) {
    const otherRole: Idef0Role = enters ? 'output' : roleOf(arrow)
    const pos = positionAt(arrow, other, otherRole)
    return `${dir} ${ROLE_TITLE[otherRole]} ${pos || '?'} of ${nodeNumber(other)}`
  }
  if (other && isKindOf(other, 'IDEF0Port')) {
    const tunneled = enters ? arrow['tunnelSource'] : arrow['tunnelTarget']
    const code = boundaryCode(other)
    if (code) return `${dir} boundary ${code}`
    return `${dir} the boundary${tunneled ? ' (tunneled)' : ''}`
  }
  if (isKindOf(other, 'IDEF0Arrow')) {
    const trunk = arrowDisplayName(rootArrow(arrow)) || 'an unlabeled arrow'
    return enters ? `branch of ${trunk}` : `joins ${trunk}`
  }
  return ''
}

/** The ICOM code under which `arrow` appears on the child diagram of `box`, or its tunnel. */
function childCodeText(arrow: Elem, box: Elem, role: Idef0Role): string {
  if (role === 'call') return ''
  const tunneled = entersAt(role) ? arrow['tunnelTarget'] : arrow['tunnelSource']
  if (tunneled) return `tunneled at ${nodeNumber(box)}`
  const child = box['childDiagram'] as Elem | null
  if (!child) return ''
  const ports = (box['ports'] as Elem[] | undefined) ?? []
  const root = rootArrow(arrow)
  const port = ports.find((p) => p['corresponds'] === arrow) ?? ports.find((p) => p['corresponds'] && rootArrow(p['corresponds'] as Elem) === root)
  const code = port ? icomCodes(child).get(port._id) : undefined
  return code ? `ICOM ${code} on ${diagramNodeNumber(child)}` : ''
}

/** Full description of an arrow entry: `Input 1 of A2 · from Output 1 of A1 · ICOM I1 on A2`. */
export function arrowTooltip(arrow: Elem, box: Elem, role: Idef0Role, position: number): string {
  const name = arrowDisplayName(arrow)
  const parts = [`${ROLE_TITLE[role]} ${position} of ${nodeNumber(box)}${name && role !== 'call' ? ` (${name})` : ''}`, otherEndText(arrow, role), childCodeText(arrow, box, role)]
  return parts.filter(Boolean).join(' · ')
}

/**
 * Where an element is shown: the element keys to expand and the role folder to open so that its
 * row becomes visible. A box arrow is revealed under the box it enters (else the one it leaves).
 */
export function revealPath(el: Elem, options: TreeOptions = {}): { expand: string[]; folder: string | null } {
  const ancestorsOf = (e: Elem): string[] => {
    const ids: string[] = []
    for (let p = e._parent; p; p = p._parent) ids.push(p._id)
    return ids
  }
  if (isBoxArrow(el)) {
    const target = el['target'] as Elem | null
    const enters = isIdef0Function(target) ? rolesAt(el, target)[0] : undefined
    const box = enters ? (target as Elem) : (el['source'] as Elem)
    const role = enters ?? (rolesAt(el, box)[0] as Idef0Role)
    return { expand: [...ancestorsOf(box), box._id], folder: options.groupArrows === false ? null : folderKey(box, role) }
  }
  return { expand: ancestorsOf(el), folder: null }
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
