/**
 * Editor overlays drawn above the diagram in diagram coordinates but with screen-constant sizes
 * (spec 03 §1.6): selection outlines, bands and handles, and drag feedback. Never exported.
 */
import { memo } from 'react'
import type React from 'react'
import { SELECTION, fmt, polylinePath, resizeHandles, type Point, type Rect } from '../core'
import type { DiagramLayout } from '../layout/types'

const ACCENT = SELECTION.color

function Box({ r, zoom, dashed, fill }: { r: Rect; zoom: number; dashed?: boolean; fill?: string }): React.JSX.Element {
  return (
    <rect
      x={fmt(r.left)}
      y={fmt(r.top)}
      width={fmt(Math.max(0, r.width))}
      height={fmt(Math.max(0, r.height))}
      fill={fill ?? 'none'}
      stroke={ACCENT}
      strokeWidth={1 / zoom}
      {...(dashed ? { strokeDasharray: `${3 / zoom} ${3 / zoom}` } : {})}
    />
  )
}

function Handle({ center, zoom }: { center: Point; zoom: number }): React.JSX.Element {
  const s = SELECTION.handleSize / zoom
  return <rect x={fmt(center.x - s / 2)} y={fmt(center.y - s / 2)} width={fmt(s)} height={fmt(s)} fill={SELECTION.handleFill} stroke={ACCENT} strokeWidth={1 / zoom} />
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
          </g>
        )
      })}
    </g>
  )
})

export type DragPreview =
  | { readonly kind: 'boxes'; readonly rects: readonly Rect[]; readonly container?: Rect | null }
  | { readonly kind: 'band'; readonly rect: Rect }
  | { readonly kind: 'line'; readonly from: Point; readonly to: Point }
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }

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
          <Box r={preview.rect} zoom={zoom} dashed fill="rgba(79,153,255,0.08)" />
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
    case 'polyline':
      return (
        <g pointerEvents="none">
          <path d={polylinePath(preview.points)} fill="none" stroke={ACCENT} strokeWidth={px} strokeDasharray={`${3 / zoom} ${3 / zoom}`} />
        </g>
      )
  }
}
