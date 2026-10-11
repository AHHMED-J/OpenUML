/**
 * Diagram core: model-independent geometry and notation primitives shared by the notation
 * renderers, the interactive editor and the exporters. Pure TypeScript; the only environment
 * dependency is the optional canvas used by `CanvasTextMeasurer`.
 *
 * Units are diagram units (logical px at zoom 1.0), y axis down. `Rect` uses view field names
 * (`left`, `top`, `width`, `height`).
 *
 * Modules:
 * - `geometry`   Point/Rect/Size, vector math, rect helpers, bounding boxes, segment distance and
 *                intersection, ray-to-outline clipping (rect, ellipse, diamond), angles.
 * - `formats`    .mdj value encodings: `parsePoints`/`serializePoints` ("x:y;x:y"),
 *                `parseFont`/`serializeFont` ("face;size;style"), `cssFont`.
 * - `style`      Persisted enums (`LineStyle`, `LineMode`, `EdgePosition`, alignments, `FontStyle`)
 *                and default style constants: `COLORS`, `DEFAULT_FONT`, `DASH`, `SHADOW`,
 *                `SPACING`, `MIN_SIZES`, `Z_INDEX`, `SELECTION`, `GRID`, `ZOOM`, `EXPORT`.
 * - `viewport`   Grid snapping (round/floor, dead zone), zoom clamp/step, diagram↔screen
 *                transform, zoom-at-point, grid line positions, export bounds.
 * - `junction`   Edge end attachment: `obliqueJunction`, `orthogonalJunction`, outline-aware
 *                `shapeJunction`/`shapeOrthogonalJunction`, edge-to-edge targets.
 * - `routing`    `routeEdge` (per line style), `routeOblique`, `routeRectilinear`,
 *                `initialRectilinearRoute`, `cleanupRectilinear`, `rectilinearize`,
 *                `selfLoopRoute`, `simplifyOblique`.
 * - `paths`      SVG path data: polyline, rounded polyline (r = 8), quadratic curve, `edgePath`,
 *                rounded rect, ellipse, diamond points.
 * - `labels`     Polar label placement on edges (head/middle/tail) and nodes, both directions
 *                (`placeEdgeLabel` / `edgeLabelParamsFromBox`), default label parameters.
 * - `endStyles`  Arrowheads and other end decorations as shapes (`endShapes`, `edgeEndShapes`,
 *                `endShapePath`), persisted end style codes.
 * - `notation`   Relationship/message kind → line dash + tail/head end decorations.
 * - `text`       `TextMeasurer` interface, `CanvasTextMeasurer`, deterministic
 *                `FixedWidthTextMeasurer`, `wrapText`, `measureLines`, `layoutText`.
 * - `hitTest`    Node and edge hit tests, resize handles (positions, hit, cursor, resize math),
 *                rubber-band selection.
 */
export * from './geometry'
export * from './formats'
export * from './style'
export * from './viewport'
export * from './junction'
export * from './routing'
export * from './paths'
export * from './labels'
export * from './endStyles'
export * from './notation'
export * from './text'
export * from './hitTest'
