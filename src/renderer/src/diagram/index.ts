/**
 * Diagram module — layout, SVG rendering of every notation, and the interactive editor.
 *
 * Public API for the shell
 * - `<DiagramEditor diagramId tool onToolUsed zoom onZoomChange showGrid snapToGrid />` edits a
 *   diagram of the open project (store: `useProjectStore`); it changes the model only through
 *   `commands/` operations. `tool` is `{ kind }` with a `NODE_KINDS` / `EDGE_KINDS` key (plus
 *   optional `messageSort` / `selfConnection`), or null for Select.
 * - `registerDiagramCommands(registry, { getZoom, setZoom })` registers select all, cut/copy/
 *   paste/duplicate, zoom in/out/actual size/fit, `alignment.*`, line styles, view format
 *   toggles, nudge and quick edit (IDs already registered elsewhere are skipped).
 * - Clipboard helpers (`copyViews`, `pasteViews`, `duplicateViews`) for other callers.
 *
 * Pipeline (spec 03 §1.2): `computeDiagramLayout(diagram, repository, measurer)` measures and
 * arranges all nodes, then routes all edges (diagram/core junctions + routing) and places their
 * labels, then sorts views by z-index. Layouts are plain data; React components draw *only* from
 * their layout, and unchanged views reuse their layout object so memoized components skip them.
 * The same `DiagramContent` is used on screen and by `export/` (SVG/PNG).
 *
 * Adding a notation (Use Case / Sequence / Activity families)
 * 1. Create `diagram/uml/<family>/index.ts` exporting `register<Family>Notations()` and call it
 *    from `registerUmlNotations()` in `diagram/uml/index.ts`.
 * 2. For each node view type, register a layout function and a pure SVG component:
 *
 *    ```tsx
 *    // Import from the defining files (not from `diagram/index.ts`, which would be an import cycle).
 *    import { registerNodeNotation } from '../../render/registry'
 *    import { nodeLayout, measureNameCompartment, arrangeNameCompartment, styleOf, nameOf,
 *             nameEditText } from '../../layout/helpers'
 *    import { SvgLines, Shadow } from '../../render/primitives'
 *    import type { NodeLayout, TextLine } from '../../layout/types'
 *    import { MIN_SIZES, ellipsePath } from '../../core'
 *
 *    interface UseCaseData { readonly nameLines: readonly TextLine[] }
 *
 *    registerNodeNotation<UseCaseData>('UMLUseCaseView', {
 *      layout(view, ctx): NodeLayout<UseCaseData> {
 *        const style = styleOf(view)
 *        const name = measureNameCompartment({ name: nameOf(view.model), font: style.font }, ctx.measurer)
 *        return nodeLayout(view, {
 *          minWidth: Math.max(Math.floor(Math.SQRT2 * name.width), MIN_SIZES.useCase.width),
 *          minHeight: Math.max(Math.floor(Math.SQRT2 * name.height), MIN_SIZES.useCase.height),
 *          outline: 'ellipse',                       // edges clip to the true ellipse
 *          style,
 *          data: (box) => ({ nameLines: arrangeNameCompartment(name, { ...box, top: box.top + (box.height - name.height) / 2, height: name.height }) }),
 *          regions: (box) => view.model ? [{ box, target: { kind: 'name', elementId: view.model._id }, text: nameEditText(view.model), font: style.font }] : []
 *        })
 *      },
 *      Render: ({ layout }) => (
 *        <g>
 *          <Shadow d={ellipsePath(layout.box)} show={layout.style.showShadow} />
 *          <path d={ellipsePath(layout.box)} fill={layout.style.fillColor} stroke={layout.style.lineColor} />
 *          <SvgLines lines={layout.data.nameLines} color={layout.style.fontColor} />
 *        </g>
 *      )
 *    })
 *    ```
 *
 *    `nodeLayout` computes the effective box (stored size grown to the minimum; exactly the
 *    minimum with auto-resize). Optional layout fields: `sizable` ('none' | 'horz' | 'vert' |
 *    'ratio' | 'free' | 'grow'), `movable`, `zIndex` (frame −1, messages 1, fragments 2), `endpoint`
 *    (edge attachment override), `subEndpoints` (sub-views such as a lifeline's line part that
 *    edges attach to), `extraBounds` (floating labels, for export bounds), `moveAxis` (move along
 *    one axis only), `hitAreas` (hit only there, e.g. a frame's border and label), `dividers`
 *    (draggable lines resizing sub-views such as operands). `regions` are the double-click
 *    inline-edit targets (`name`, `attribute`, `operation`, `literal`, `text`, `field`, or
 *    `custom` with a syntax registered via `registerQuickEditSyntax`).
 *    Add `container: { accepts, ownerFor }` to make a view a drop container (subject, swimlane).
 *    Add `outerHitAreas` (labels drawn beside a small symbol) so the view is also hit, and its
 *    `regions` opened by double-click, outside its box. The role activity diagram (`diagram/rad/`)
 *    uses this together with `container.reparent`, grows its role boxes at layout time to fit their
 *    contained views, and registers from `ensureNotations()` like the UML families.
 * 3. For each edge view type, register a layout (usually `buildEdgeLayout`, which routes via
 *    diagram/core and places labels) and optionally a custom `Render` (default `EdgeShape`):
 *
 *    ```ts
 *    // relationshipEdgeNotation: '../../render/generic'; buildEdgeLayout: '../../layout/edges'
 *    registerEdgeNotation('UMLIncludeView', relationshipEdgeNotation('include', 'Include'))
 *    registerEdgeNotation('UMLSeqMessageView', {
 *      connectKind: 'Message',
 *      layout: (edge, ctx) => buildEdgeLayout(edge, ctx, { dash: 'solid', tailEnd: { style: 'flat' },
 *        headEnd: { style: 'solidArrow' }, zIndex: 1, routed: myHorizontalRoute(edge, ctx),
 *        labels: [{ field: 'nameLabel', defaults: 'messageName', text: '1 : call()' }] })
 *    })
 *    ```
 *
 *    `connectKind` (an `EDGE_KINDS` key) enables reconnecting ends, validated with `canConnect`.
 *    Optional edge layout fields: `labelPoints` (polyline labels are placed and dragged on) and
 *    `dragAxis: 'vert'` (dragging shifts the edge vertically, as for sequence messages).
 *
 * Families outside `diagram/uml/` (IDEF0 in `diagram/idef0/`) register from `ensureNotations()` in
 * `notations.ts` and may add per-diagram-type editor hooks with `registerDiagramHooks(diagramType,
 * { normalize, createEdge, reconnect, deleteViews, pickEnd, freeEnds })` (see `editor/actions.ts`).
 * Notations registered for a supertype (e.g. `UMLClassifierView`) apply to its subtypes that
 * have no notation of their own; unknown types get a generic box / line.
 */
import { ensureNotations } from './notations'

ensureNotations()

// Editor and commands
export { DiagramEditor, type DiagramEditorProps, type ToolSelection } from './editor/DiagramEditor'
export { registerDiagramCommands, DiagramCommandIds, copySelection, pasteClipboard, type DiagramCommandContext } from './commands'
export { getActiveEditor, getContextEdgeEnd, requestReveal, type ContextEdgeEnd, type EditorHandle } from './editor/activeEditor'
export { highlightViews } from './editor/highlight'
export {
  createEdgeBetween,
  createNodeAt,
  moveSelection,
  reconnectEnd,
  resizeNode,
  setEdgeVertices,
  syncGeometry,
  withGeometry,
  hooksFor,
  registerDiagramHooks,
  type DiagramEnv,
  type DiagramHooks,
  type ToolSpec
} from './editor/actions'
export { alignBoxes, alignViews, reorderViews, ALIGN_OPS, type AlignOp } from './editor/alignment'
export { hitTestDiagram, viewsInBand, type DiagramHit } from './editor/hitTest'
export { applyQuickEdit, renameElements, resolveByName, registerQuickEditSyntax, quickEditSyntaxHint, type QuickEditSyntax } from './editor/quickEditApply'
export * from './editor/quickEditSyntax'

// Clipboard
export * from './clipboard'

// Layout
export type * from './layout/types'
export { computeDiagramLayout, type LayoutOptions } from './layout/layoutDiagram'
export * from './layout/helpers'
export * from './layout/edges'
export { getTextMeasurer, setTextMeasurer } from './layout/measurer'

// Style constants shared with the shell (font size choices, zoom range)
export { FONT_SIZES, GRID, ZOOM, sanitizeGridSize } from './core'

// Rendering and the notation registry
export * from './render/registry'
export * from './render/primitives'
export { DiagramContent, NodeItem, EdgeItem } from './render/DiagramContent'
export {
  FrameLabel,
  frameHitAreas,
  layoutFrameLabel,
  notePolygon,
  relationshipEdgeNotation,
  standardEdgeLabels,
  tagString,
  type FrameLabelLayout
} from './render/generic'
export { ensureNotations } from './notations'

// IDEF0: commands, validation and model edits for the shell
export {
  IDEF0_ROLE_COLORS,
  Idef0CommandIds,
  colorIdef0Arrows,
  decomposeFunction,
  isFlowColorEdit,
  deleteIdef0Elements,
  issueItems,
  pendingPorts,
  registerIdef0Commands,
  setBoxNumber,
  validateDiagram,
  type Idef0CommandContext,
  type Idef0ListItem,
  type IdefIssue
} from './idef0'

// Class diagram notation (strings, layouts) for reuse
export * as classNotation from './uml/class'
