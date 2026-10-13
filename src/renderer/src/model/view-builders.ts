/**
 * Builders for views and their required embedded sub-views (compartments, labels).
 * Everything returned is detached: not yet in any repository.
 */
import { generateId } from './id'
import { instantiate, isSubtype, typeDisplayName } from './metamodel'
import type {
  Bounds,
  EdgeLabelView,
  EdgeView,
  Elem,
  LabelView,
  NodeView,
  Point,
  UMLClassifierView,
  UMLGeneralEdgeView,
  UMLNameCompartmentView,
  UMLUndirectedRelationshipView,
  View
} from './types'
import { DEFAULT_FONT, fontWith, FontStyle } from './values'

/** Creates a detached element with a fresh ID, constructor defaults and the given field values. */
export function createElement<T extends Elem = Elem>(type: string, props: Record<string, unknown> = {}): T {
  const el = instantiate(type)
  el._id = generateId()
  Object.assign(el, props)
  return el as T
}

/** Appends `child` to `host.subViews` and sets its `_parent`. */
export function addSubView<T extends View>(host: View, child: T): T {
  child._parent = host
  host.subViews.push(child)
  return child
}

/** Smallest `base + n` (n ≥ 1) not used as a name among `siblings`. */
export function nextName(siblings: readonly unknown[], base: string): string {
  const used = new Set<string>()
  for (const s of siblings) {
    const name = (s as { name?: unknown } | null)?.name
    if (typeof name === 'string') used.add(name)
  }
  let n = 1
  while (used.has(`${base}${n}`)) n++
  return `${base}${n}`
}

/** Default element name for a type among `siblings` (e.g. `Class3`). */
export function defaultName(type: string, siblings: readonly unknown[]): string {
  return nextName(siblings, typeDisplayName(type))
}

const NAMESPACE_FONT = fontWith(DEFAULT_FONT, { size: Math.round(DEFAULT_FONT.size * 9) / 10 })
const BOLD_FONT = fontWith(DEFAULT_FONT, { style: FontStyle.bold })

export function boundsOf(view: View): Bounds | null {
  const v = view as Partial<NodeView>
  if (typeof v.left !== 'number' || typeof v.top !== 'number') return null
  return { left: v.left, top: v.top, width: v.width ?? 0, height: v.height ?? 0 }
}

export function centerOf(view: View): Point | null {
  const b = boundsOf(view)
  return b ? { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } : null
}

/**
 * Initial points of a new edge: the centers of its ends, or for a self edge a 30 × 20 loop out
 * of the right side of the view.
 */
export function defaultEdgePoints(tail: View, head: View): Point[] {
  const a = centerOf(tail)
  const b = centerOf(head)
  if (!a || !b) return []
  if (tail === head) {
    const box = boundsOf(tail) as Bounds
    const right = box.left + box.width
    return [
      { x: right, y: a.y - 10 },
      { x: right + 30, y: a.y - 10 },
      { x: right + 30, y: a.y + 10 },
      { x: right, y: a.y + 10 }
    ]
  }
  return [a, b]
}

function labelInside(host: NodeView, props: Record<string, unknown> = {}): LabelView {
  return createElement<LabelView>('LabelView', {
    left: host.left,
    top: host.top,
    width: 0,
    height: DEFAULT_FONT.size,
    ...props
  })
}

/**
 * Adds the standard name compartment (stereotype, name, namespace and property labels) to a
 * general node view and links it as `nameCompartment`.
 */
export function addNameCompartment(host: NodeView, model: Elem | null, boldName = true): UMLNameCompartmentView {
  const nc = addSubView(
    host,
    createElement<UMLNameCompartmentView>('UMLNameCompartmentView', {
      model,
      left: host.left,
      top: host.top,
      width: host.width,
      height: 25
    })
  )
  nc.stereotypeLabel = addSubView(nc, labelInside(host, { visible: false }))
  nc.nameLabel = addSubView(
    nc,
    labelInside(host, {
      left: host.left + 5,
      top: host.top + 7,
      width: Math.max(0, host.width - 10),
      font: boldName ? BOLD_FONT : DEFAULT_FONT
    })
  )
  nc.namespaceLabel = addSubView(nc, labelInside(host, { visible: false, font: NAMESPACE_FONT }))
  nc.propertyLabel = addSubView(nc, labelInside(host, { visible: false, horizontalAlignment: 1 }))
  host['nameCompartment'] = nc
  return nc
}

/** Adds a list compartment of `type` to `host` and links it through `field`. */
export function addListCompartment(
  host: NodeView,
  type: string,
  field: string,
  model: Elem | null,
  visible = true
): NodeView {
  const c = addSubView(
    host,
    createElement<NodeView>(type, {
      model,
      visible,
      left: host.left,
      top: host.top,
      width: visible ? host.width : 10,
      height: 10
    })
  )
  host[field] = c
  return c
}

export interface ClassifierViewOptions {
  stereotypeDisplay?: string
  suppressAttributes?: boolean
  suppressOperations?: boolean
}

/** Creates a classifier view (class, interface, enumeration, actor, use case, ...) with all compartments. */
export function buildClassifierView(
  type: string,
  model: Elem,
  bounds: Bounds,
  options: ClassifierViewOptions = {}
): UMLClassifierView {
  const view = createElement<UMLClassifierView>(type, {
    model,
    containerChangeable: true,
    ...bounds,
    ...(options.stereotypeDisplay ? { stereotypeDisplay: options.stereotypeDisplay } : {}),
    suppressAttributes: options.suppressAttributes ?? false,
    suppressOperations: options.suppressOperations ?? false
  })
  addNameCompartment(view, model)
  if (type === 'UMLEnumerationView') {
    addListCompartment(view, 'UMLEnumerationLiteralCompartmentView', 'enumerationLiteralCompartment', model)
  }
  addListCompartment(view, 'UMLAttributeCompartmentView', 'attributeCompartment', model, !view.suppressAttributes)
  addListCompartment(view, 'UMLOperationCompartmentView', 'operationCompartment', model, !view.suppressOperations)
  addListCompartment(view, 'UMLReceptionCompartmentView', 'receptionCompartment', model, false)
  addListCompartment(view, 'UMLTemplateParameterCompartmentView', 'templateParameterCompartment', model, false)
  if (type === 'UMLUseCaseView') {
    addListCompartment(view, 'UMLExtensionPointCompartmentView', 'extensionPointCompartment', model)
  }
  return view
}

/** Creates a general node view (package, subject, action, object node, lifeline head ...) with its name compartment. */
export function buildGeneralNodeView(type: string, model: Elem | null, bounds: Bounds, props: Record<string, unknown> = {}): NodeView {
  const view = createElement<NodeView>(type, { model, containerChangeable: true, ...bounds, ...props })
  addNameCompartment(view, model)
  return view
}

function edgeLabel(
  host: EdgeView,
  model: Elem | null,
  edgePosition: number,
  alpha: number,
  distance: number,
  anchor: Point
): EdgeLabelView {
  return addSubView(
    host,
    createElement<EdgeLabelView>('EdgeLabelView', {
      model,
      visible: false,
      parentStyle: false,
      left: anchor.x,
      top: anchor.y,
      height: DEFAULT_FONT.size,
      alpha,
      distance,
      hostEdge: host,
      edgePosition
    })
  )
}

function anchorOf(points: readonly Point[], edgePosition: number): Point {
  const first = points[0] ?? { x: 0, y: 0 }
  const last = points[points.length - 1] ?? first
  if (edgePosition === 0) return last
  if (edgePosition === 2) return first
  return { x: Math.round((first.x + last.x) / 2), y: Math.round((first.y + last.y) / 2) }
}

const HALF_PI = Math.PI / 2

/** Adds the middle name/stereotype/property labels shared by relationship edges and messages. */
export function addRelationshipLabels(edge: EdgeView, model: Elem | null): void {
  const mid = anchorOf(edge.points, 1)
  edge['nameLabel'] = edgeLabel(edge, model, 1, HALF_PI, 15, mid)
  edge['stereotypeLabel'] = edgeLabel(edge, model, 1, HALF_PI, 30, mid)
  edge['propertyLabel'] = edgeLabel(edge, model, 1, -HALF_PI, 15, mid)
}

export interface EdgeViewInit {
  model: Elem | null
  tail: View
  head: View
  points: readonly Point[]
}

/** Creates a UML relationship edge view (generalization, dependency, flow ...) with its labels. */
export function buildGeneralEdgeView(type: string, init: EdgeViewInit): UMLGeneralEdgeView {
  const edge = createElement<UMLGeneralEdgeView>(type, { ...init, points: [...init.points] })
  addRelationshipLabels(edge, init.model)
  return edge
}

/** Creates an undirected relationship edge view (association) with the six end labels. */
export function buildUndirectedEdgeView(
  type: string,
  init: EdgeViewInit,
  end1: Elem | null,
  end2: Elem | null
): UMLUndirectedRelationshipView {
  const edge = createElement<UMLUndirectedRelationshipView>(type, { ...init, points: [...init.points] })
  addRelationshipLabels(edge, init.model)
  const tail = anchorOf(edge.points, 2)
  const head = anchorOf(edge.points, 0)
  const S = Math.PI / 6
  const Q = Math.PI / 4
  edge.tailRoleNameLabel = edgeLabel(edge, end1, 2, S, 30, tail)
  edge.tailPropertyLabel = edgeLabel(edge, end1, 2, Q, 40, tail)
  edge.tailMultiplicityLabel = edgeLabel(edge, end1, 2, -S, 25, tail)
  edge.headRoleNameLabel = edgeLabel(edge, end2, 0, -S, 30, head)
  edge.headPropertyLabel = edgeLabel(edge, end2, 0, -Q, 40, head)
  edge.headMultiplicityLabel = edgeLabel(edge, end2, 0, S, 25, head)
  if (isSubtype(type, 'UMLAssociationView')) {
    for (const [field, end] of [
      ['tailQualifiersCompartment', end1],
      ['headQualifiersCompartment', end2]
    ] as const) {
      edge[field] = addSubView(
        edge,
        createElement<NodeView>('UMLQualifierCompartmentView', { model: end, visible: false, width: 10, height: 10 })
      )
    }
  }
  return edge
}

/** Adds `nameLabel`/`stereotypeLabel`/`propertyLabel` node labels floating around a host node (pins). */
export function addFloatingLabels(host: NodeView, model: Elem | null): void {
  const fields = ['nameLabel', 'stereotypeLabel', 'propertyLabel'] as const
  fields.forEach((field, i) => {
    host[field] = addSubView(
      host,
      createElement<NodeView>('NodeLabelView', {
        model,
        visible: field === 'nameLabel',
        parentStyle: false,
        left: host.left,
        top: host.top - 20 - i * 15,
        height: DEFAULT_FONT.size,
        alpha: (3 * Math.PI) / 4,
        distance: 20 + i * 15,
        hostNode: host
      })
    )
  })
}

/** Adds a plain label (e.g. swimlane/frame name, operand guard) linked through `field`. */
export function addEmbeddedLabel(host: NodeView, field: string, props: Record<string, unknown> = {}): LabelView {
  const label = addSubView(host, labelInside(host, props))
  host[field] = label
  return label
}
