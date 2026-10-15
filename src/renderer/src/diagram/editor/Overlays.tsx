/**
 * Editor overlays drawn above the diagram in diagram coordinates but with screen-constant sizes
 * (spec 03 §1.6): selection outlines, bands and handles, and drag feedback. Never exported.
 */
import { memo } from 'react'
import type React from 'react'
import { SELECTION, fmt, polylinePath, resizeHandles, type Point, type Rect, type RubberBandMode } from '../core'
import type { DiagramLayout, EdgeLabelSlot } from '../layout/types'
import { SvgText } from '../render/primitives'

const ACCENT = SELECTION.color
/** Window (left-to-right) rubber band: solid accent outline over a light blue tint. */
const WINDOW_BAND_FILL = 'rgba(79,153,255,0.08)'
/**
 * Crossing (right-to-left) rubber band: dashed green outline over a light green tint, so the two
 * modes read apart at a glance (the diagram canvas is white in both themes).
 */
const CROSSING_BAND = { stroke: '#1f9d55', fill: 'rgba(31,157,85,0.10)' } as const

function Box({ r, zoom, dashed, fill, stroke }: { r: Rect; zoom: number; dashed?: boolean; fill?: string; stroke?: string }): React.JSX.Element {
  return (
    <rect
      x={fmt(r.left)}
      y={fmt(r.top)}
      width={fmt(Math.max(0, r.width))}
      height={fmt(Math.max(0, r.height))}
      fill={fill ?? 'none'}
      stroke={stroke ?? ACCENT}
      strokeWidth={1 / zoom}
      {...(dashed ? { strokeDasharray: `${3 / zoom} ${3 / zoom}` } : {})}
    />
  )
}

function Handle({ center, zoom }: { center: Point; zoom: number }): React.JSX.Element {
  const s = SELECTION.handleSize / zoom
  return <rect x={fmt(center.x - s / 2)} y={fmt(center.y - s / 2)} width={fmt(s)} height={fmt(s)} fill={SELECTION.handleFill} stroke={ACCENT} strokeWidth={1 / zoom} />
}

/**
 * Muted hint for an empty editable edge label (e.g. an association end's multiplicity): a faint
 * dashed box with the hint text, shown only while the edge is selected (the diagram canvas is
 * white in both themes; overlays are never exported).
 */
function SlotHint({ slot, zoom }: { slot: EdgeLabelSlot; zoom: number }): React.JSX.Element {
  const b = slot.hintBox
  const pad = 2
  return (
    <g>
      <rect
        x={fmt(b.left - pad)}
        y={fmt(b.top - pad / 2)}
        width={fmt(b.width + 2 * pad)}
        height={fmt(b.height + pad)}
        rx={2}
        fill={SLOT_HINT.fill}
        stroke={SLOT_HINT.stroke}
        strokeWidth={1 / zoom}
        strokeDasharray={`${2 / zoom} ${2 / zoom}`}
      />
      <SvgText line={{ text: slot.hint, box: b, font: slot.hintFont, align: 'center' }} color={SLOT_HINT.text} />
    </g>
  )
}

const SLOT_HINT = { fill: 'rgba(255,255,255,0.6)', stroke: 'rgba(110,118,129,0.55)', text: 'rgba(110,118,129,0.85)' } as const

/** Edges highlighted because a selected edge is drawn as one with them (`EdgeLayout.highlightGroup`). */
function highlightedEdges(layout: DiagramLayout, selected: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const id of selected) for (const member of layout.edges.get(id)?.highlightGroup ?? []) ids.add(member)
  return [...ids]
}

/** A soft band along a highlighted edge and around its labels. */
function EdgeHalo({ layout, id, zoom }: { layout: DiagramLayout; id: string; zoom: number }): React.JSX.Element | null {
  const edge = layout.edges.get(id)
  if (!edge || edge.points.length < 2) return null
  const pad = 2 / zoom
  return (
    <g>
      <path d={polylinePath(edge.points)} fill="none" stroke={ACCENT} strokeOpacity={0.3} strokeWidth={SELECTION.bandWidth / zoom} strokeLinecap="round" strokeLinejoin="round" />
      {edge.labels.map((l, i) => (
        <rect key={i} x={fmt(l.box.left - pad)} y={fmt(l.box.top - pad)} width={fmt(l.box.width + 2 * pad)} height={fmt(l.box.height + 2 * pad)} fill={ACCENT} fillOpacity={SELECTION.bandAlpha} stroke={ACCENT} strokeOpacity={0.6} strokeWidth={1 / zoom} />
      ))}
    </g>
  )
}

/** Selection decorations of the selected views. */
export const SelectionOverlay = memo(function SelectionOverlay({
  layout,
  selected,
  zoom
}: {
  layout: DiagramLayout
  selected: readonly string[]
  zoom: number
}): React.JSX.Element {
  const px = 1 / zoom
  const band = SELECTION.bandWidth / zoom
  return (
    <g pointerEvents="none">
      {highlightedEdges(layout, selected).map((id) => (
        <EdgeHalo key={`halo-${id}`} layout={layout} id={id} zoom={zoom} />
      ))}
      {selected.map((id) => {
        const node = layout.nodes.get(id)
        if (node) {
          const b = node.box
          if (node.sizable === 'none') {
            return (
              <rect
                key={id}
                x={fmt(b.left - px)}
                y={fmt(b.top - px)}
                width={fmt(b.width + 2 * px)}
                height={fmt(b.height + 2 * px)}
                rx={SELECTION.fixedNodeRadius / zoom}
                fill={ACCENT}
                fillOpacity={SELECTION.bandAlpha}
                stroke={ACCENT}
                strokeWidth={px}
              />
            )
          }
          const outer = { left: b.left - px, top: b.top - px, width: b.width + 2 * px, height: b.height + 2 * px }
          const right = outer.left + outer.width
          const bottom = outer.top + outer.height
          return (
            <g key={id}>
              <g fill={ACCENT} fillOpacity={SELECTION.bandAlpha} stroke="none">
                <rect x={fmt(outer.left - band)} y={fmt(outer.top - band)} width={fmt(outer.width + 2 * band)} height={fmt(band)} />
                <rect x={fmt(outer.left - band)} y={fmt(bottom)} width={fmt(outer.width + 2 * band)} height={fmt(band)} />
                <rect x={fmt(outer.left - band)} y={fmt(outer.top)} width={fmt(band)} height={fmt(outer.height)} />
                <rect x={fmt(right)} y={fmt(outer.top)} width={fmt(band)} height={fmt(outer.height)} />
              </g>
              <Box r={outer} zoom={zoom} />
              {resizeHandles(b, node.sizable, zoom, SELECTION.handleSize).map((h) => (
                <rect
                  key={h.position}
                  x={fmt(h.rect.left)}
                  y={fmt(h.rect.top)}
                  width={fmt(h.rect.width)}
                  height={fmt(h.rect.height)}
                  fill={SELECTION.handleFill}
                  stroke={ACCENT}
                  strokeWidth={px}
                />
              ))}
            </g>
          )
        }
        const edge = layout.edges.get(id)
        if (!edge) return null
        return (
          <g key={id}>
            <path d={polylinePath(edge.points)} fill="none" stroke={ACCENT} strokeWidth={px} strokeDasharray={`${3 / zoom} ${3 / zoom}`} />
            {edge.points.map((p, i) => (
              <Handle key={i} center={p} zoom={zoom} />
            ))}
            {edge.slots?.map((slot, i) => (
              <SlotHint key={`slot-${i}`} slot={slot} zoom={zoom} />
            ))}
          </g>
        )
      })}
    </g>
  )
})

export type DragPreview =
  | { readonly kind: 'boxes'; readonly rects: readonly Rect[]; readonly container?: Rect | null }
  /** Rubber band: `contain` (window, left to right) or `intersect` (crossing, right to left). */
  | { readonly kind: 'band'; readonly rect: Rect; readonly mode?: RubberBandMode }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }
  /** Where a dragged edge end snaps to (e.g. the slot an IDEF0 arrow end takes on a box side). */
  | { readonly kind: 'snap'; readonly point: Point }

/** Drag feedback: skeleton boxes, rubber band, creation line, edited polyline. */
export function DragOverlay({ preview, zoom }: { preview: DragPreview | null; zoom: number }): React.JSX.Element | null {
  if (!preview) return null
  const px = 1 / zoom
  switch (preview.kind) {
    case 'boxes':
      return (
        <g pointerEvents="none">
          {preview.container && <Box r={{ left: preview.container.left - 2 * px, top: preview.container.top - 2 * px, width: preview.container.width + 4 * px, height: preview.container.height + 4 * px }} zoom={zoom} />}
          {preview.rects.map((r, i) => (
            <Box key={i} r={r} zoom={zoom} />
          ))}
        </g>
      )
    case 'band':
      return (
        <g pointerEvents="none">
          {preview.mode === 'intersect' ? (
            <Box r={preview.rect} zoom={zoom} dashed fill={CROSSING_BAND.fill} stroke={CROSSING_BAND.stroke} />
          ) : (
            <Box r={preview.rect} zoom={zoom} fill={WINDOW_BAND_FILL} />
          )}
        </g>
      )
    case 'line': {
      const r = SELECTION.createEdgeEndRadius
      return (
        <g pointerEvents="none" stroke={ACCENT} strokeWidth={px} fill="none">
          <line x1={fmt(preview.from.x)} y1={fmt(preview.from.y)} x2={fmt(preview.to.x)} y2={fmt(preview.to.y)} />
          <circle cx={fmt(preview.from.x)} cy={fmt(preview.from.y)} r={r} />
          <circle cx={fmt(preview.to.x)} cy={fmt(preview.to.y)} r={r} />
        </g>
      )
    }
    case 'snap': {
      const r = SELECTION.createEdgeEndRadius + 2
      return (
        <g pointerEvents="none">
          <circle cx={fmt(preview.point.x)} cy={fmt(preview.point.y)} r={r / zoom} fill={ACCENT} fillOpacity={0.25} stroke={ACCENT} strokeWidth={1.5 * px} />
        </g>
      )
    }
    case 'polyline':
      return (
        <g pointerEvents="none">
          <path d={polylinePath(preview.points)} fill="none" stroke={ACCENT} strokeWidth={px} strokeDasharray={`${3 / zoom} ${3 / zoom}`} />
        </g>
      )
  }
}
