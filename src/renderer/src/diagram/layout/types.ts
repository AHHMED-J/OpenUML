/**
 * Layout data produced by the measure/arrange phase and consumed by renderers, the editor (hit
 * testing, handles, inline editing) and the exporters.
 *
 * Layouts are plain JSON-like data: renderers draw *only* from their layout (never from the live
 * view), so that a layout that did not change can be reused and its component skipped.
 */
import type { Diagram, Repository } from '../../model'
import type { EdgeEndpoint, EndSpec, Font, LineDash, LineStyle, NodeOutline, Point, Rect, Sizable, TextMeasurer } from '../core'

/** Colors and flags copied from a view's style fields. */
export interface ViewStyle {
  readonly lineColor: string
  readonly fillColor: string
  readonly fontColor: string
  readonly font: Font
  readonly showShadow: boolean
}

/** What committing an inline edit changes. */
export type EditTarget =
  /** `[«stereotype»] [visibility] name` of a named model element. */
  | { readonly kind: 'name'; readonly elementId: string }
  /** Attribute notation `[«st»] [vis] name [: type] [[mult]] [= default]`. */
  | { readonly kind: 'attribute'; readonly elementId: string; readonly classifierId: string }
  /** Operation notation `[«st»] [vis] name(params) [: type] [[mult]]`. */
  | { readonly kind: 'operation'; readonly elementId: string; readonly classifierId: string }
  /** Enumeration literal (name notation; Mod+Enter adds another literal). */
  | { readonly kind: 'literal'; readonly elementId: string; readonly classifierId: string }
  /** Free (multi-line) text of a view, e.g. notes: sets `view.text`. */
  | { readonly kind: 'text'; readonly viewId: string }
  /** Any string field of an element (association end multiplicity, guard, ...). */
  | { readonly kind: 'field'; readonly elementId: string; readonly field: string }
  /**
   * Text of an element in a notation-specific syntax (e.g. sequence lifelines and messages),
   * parsed and applied by the handler registered with `registerQuickEditSyntax(syntax, ...)`.
   */
  | { readonly kind: 'custom'; readonly elementId: string; readonly syntax: string }

/** A region of a view that can be double-clicked to edit some text inline. */
export interface EditRegion {
  readonly box: Rect
  readonly target: EditTarget
  /** Initial text of the editor (the element's textual notation). */
  readonly text: string
  readonly font: Font
  readonly multiline?: boolean
}

/** One line of text placed in a box. */
export interface TextLine {
  readonly text: string
  /** Box of the line; text is drawn vertically centered in it. */
  readonly box: Rect
  readonly font: Font
  readonly align: 'left' | 'center' | 'right'
  readonly underline?: boolean
}

export interface NodeLayout<D = unknown> {
  readonly kind: 'node'
  readonly viewId: string
  readonly viewType: string
  /** Effective box: the stored box grown to the measured minimum (or exactly it with auto-resize). */
  readonly box: Rect
  readonly minWidth: number
  readonly minHeight: number
  readonly sizable: Sizable
  readonly movable: boolean
  /** Outline used to clip edge ends. */
  readonly outline: NodeOutline
  /** Edge attachment override (e.g. the circle of a lollipop interface); default `{ box, outline }`. */
  readonly endpoint?: EdgeEndpoint
  /** Attachment targets of sub-views edges may connect to (e.g. a lifeline's line part), by sub-view ID. */
  readonly subEndpoints?: Readonly<Record<string, EdgeEndpoint>>
  readonly regions: readonly EditRegion[]
  /** Drawn areas outside `box` (floating labels, decorations) for export bounds. */
  readonly extraBounds?: readonly Rect[]
  /** Restricts moving the view to one axis (sequence lifelines move only horizontally). */
  readonly moveAxis?: 'horz' | 'vert'
  /** Areas where the view is hit (default: the whole box), e.g. a frame's border and label. */
  readonly hitAreas?: readonly Rect[]
  /** Draggable horizontal dividers that resize sub-views (combined-fragment operands). */
  readonly dividers?: readonly NodeDivider[]
  readonly zIndex: number
  readonly style: ViewStyle
  /** Notation-specific data for the renderer. */
  readonly data: D
}

/**
 * A horizontal divider inside a node, dragged vertically to change the height of a sub-view
 * (whose top stays at `top`): the new height is `y - top`, with `y` kept in `[minY, maxY]`.
 */
export interface NodeDivider {
  /** Sub-view whose `height` the divider sets. */
  readonly viewId: string
  readonly top: number
  /** Current divider position. */
  readonly y: number
  readonly left: number
  readonly width: number
  readonly minY: number
  readonly maxY: number
}

export interface EdgeLabelLayout {
  /** The `EdgeLabelView` this label is stored in (null when the edge has no such sub-view). */
  readonly viewId: string | null
  /** 0 head, 1 middle, 2 tail (see `EdgePosition`). */
  readonly edgePosition: number
  readonly text: string
  readonly box: Rect
  readonly font: Font
  readonly fontColor: string
  readonly fillColor: string
  readonly underline?: boolean
  readonly edit?: EditTarget
  /** Initial editor text when it differs from `text` (e.g. `<<st>>` instead of `«st»`). */
  readonly editText?: string
}

export interface EdgeLayout<D = unknown> {
  readonly kind: 'edge'
  readonly viewId: string
  readonly viewType: string
  /** Routed polyline, tail first (integers). */
  readonly points: readonly Point[]
  readonly lineStyle: LineStyle
  readonly dash: LineDash
  readonly tailEnd: EndSpec
  readonly headEnd: EndSpec
  readonly labels: readonly EdgeLabelLayout[]
  readonly zIndex: number
  readonly style: ViewStyle
  /** Extra drawn areas (e.g. socket arcs) for export bounds. */
  readonly extraBounds?: readonly Rect[]
  /** Polyline the labels are placed on (and dragged against); default `points`. */
  readonly labelPoints?: readonly Point[]
  /** Dragging the edge shifts it along this axis instead of editing bends (sequence messages). */
  readonly dragAxis?: 'vert'
  readonly data: D
}

export type ViewLayout = NodeLayout | EdgeLayout

export interface DiagramLayout {
  readonly diagramId: string
  readonly nodes: ReadonlyMap<string, NodeLayout>
  readonly edges: ReadonlyMap<string, EdgeLayout>
  /** Top-level view IDs in paint order (z-index, then list order). */
  readonly order: readonly string[]
  /** Union of everything drawn, or null for an empty diagram. */
  readonly bounds: Rect | null
}

/** Inputs available to notation layout functions. */
export interface LayoutContext {
  readonly measurer: TextMeasurer
  readonly repository: Repository
  readonly diagram: Diagram
  /** Layout of a node computed earlier in this pass (all nodes are laid out before edges). */
  nodeLayout(viewId: string): NodeLayout | undefined
  /** Layout of an edge computed earlier in this pass. */
  edgeLayout(viewId: string): EdgeLayout | undefined
}
