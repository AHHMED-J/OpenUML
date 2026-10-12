/**
 * Per-view-type notation registry: how a view type is measured/arranged (layout) and drawn
 * (React SVG component). Diagram families register their notations from
 * `diagram/uml/<family>/index.ts`; see the header of `diagram/index.ts` for the extension guide.
 */
import type { ComponentType } from 'react'
import type { OperationBuilder } from '../../commands'
import type { Diagram, EdgeKind, EdgeView, Elem, NodeView, View } from '../../model'
import { isKindOf } from '../../model'
import type { EdgeLayout, LayoutContext, NodeLayout } from '../layout/types'

export interface NodeRendererProps<D = unknown> {
  readonly layout: NodeLayout<D>
}

export interface EdgeRendererProps<D = unknown> {
  readonly layout: EdgeLayout<D>
}

/** Visual containment (packages, subjects, swimlanes, ...): views dropped or created inside. */
export interface ContainerBehavior {
  /** Whether `child` may be placed inside `container`. `childModel` is the child's model (null for notes). */
  accepts(container: View, childModel: Elem | null): boolean
  /**
   * Where a child's model element should live when placed inside `container`, or null to leave
   * the model where it is (visual containment only).
   */
  ownerFor?(container: View, childModel: Elem | null): { readonly owner: Elem; readonly field: string } | null
  /**
   * Custom model change when a view moves into this container (or out of it, `container` null in
   * the context, called on the previous container's behavior). Return true when handled; the
   * default model move (`ownerFor` into `ownedElements`) is then skipped.
   */
  reparent?(ctx: ReparentContext): boolean
}

/** What a container's `reparent` hook is told when a view moves into (or out of) a container. */
export interface ReparentContext {
  readonly builder: OperationBuilder
  readonly diagram: Diagram
  /** The node view that moved. */
  readonly child: View
  /** The new container view; null when the child was dropped out onto the diagram. */
  readonly container: View | null
  /** The previous container view, if any. */
  readonly previous: View | null
}

export interface NodeNotation<D = unknown> {
  /** Measure and arrange the view (pure; read the model, never write it). */
  layout(view: NodeView, ctx: LayoutContext): NodeLayout<D>
  /** Draws the view from its layout only. Should be pure (no hooks needed); it is also used for export. */
  readonly Render: ComponentType<NodeRendererProps<D>>
  readonly container?: ContainerBehavior
  /** Element to open when the view is double-clicked (a diagram is opened, another element is selected). */
  openTarget?(view: View): Elem | null
}

export interface EdgeNotation<D = unknown> {
  /** Route the edge and place its labels (use `buildEdgeLayout` for the standard behavior). */
  layout(view: EdgeView, ctx: LayoutContext): EdgeLayout<D>
  /** Custom drawing; default: `EdgeShape` (line in the line style + end decorations + labels). */
  readonly Render?: ComponentType<EdgeRendererProps<D>>
  /** Factory edge kind used to validate reconnecting an end (`canConnect`). Omit to forbid reconnecting. */
  readonly connectKind?: EdgeKind
}

const nodeNotations = new Map<string, NodeNotation>()
const edgeNotations = new Map<string, EdgeNotation>()

/** Registers (or replaces) the notation of a node view type, e.g. `'UMLClassView'`. */
export function registerNodeNotation<D>(viewType: string, notation: NodeNotation<D>): void {
  nodeNotations.set(viewType, notation as NodeNotation)
}

/** Registers (or replaces) the notation of an edge view type, e.g. `'UMLAssociationView'`. */
export function registerEdgeNotation<D>(viewType: string, notation: EdgeNotation<D>): void {
  edgeNotations.set(viewType, notation as EdgeNotation)
}

let fallbackNode: NodeNotation | null = null
let fallbackEdge: EdgeNotation | null = null

/** Notations used for view types nobody registered (generic box / generic line). */
export function setFallbackNotations(node: NodeNotation, edge: EdgeNotation): void {
  fallbackNode = node
  fallbackEdge = edge
}

/** The notation registered for `view._type`, else for its nearest registered supertype, else the fallback. */
export function nodeNotationFor(view: View): NodeNotation {
  const own = nodeNotations.get(view._type)
  if (own) return own
  for (const [type, notation] of nodeNotations) if (isKindOf(view, type)) return notation
  if (!fallbackNode) throw new Error('No fallback node notation registered')
  return fallbackNode
}

export function edgeNotationFor(view: View): EdgeNotation {
  const own = edgeNotations.get(view._type)
  if (own) return own
  for (const [type, notation] of edgeNotations) if (isKindOf(view, type)) return notation
  if (!fallbackEdge) throw new Error('No fallback edge notation registered')
  return fallbackEdge
}

export function hasNodeNotation(viewType: string): boolean {
  return nodeNotations.has(viewType)
}

export function hasEdgeNotation(viewType: string): boolean {
  return edgeNotations.has(viewType)
}

function typeOnly(viewType: string): View {
  return { _type: viewType } as unknown as View
}

/** Node renderer component for a layout (resolved by its view type, like `nodeNotationFor`). */
export function nodeRendererFor(viewType: string): ComponentType<NodeRendererProps> {
  return nodeNotationFor(typeOnly(viewType)).Render
}

/** Custom edge renderer for a view type, or undefined for the standard edge drawing. */
export function edgeRendererFor(viewType: string): ComponentType<EdgeRendererProps> | undefined {
  return edgeNotationFor(typeOnly(viewType)).Render
}
