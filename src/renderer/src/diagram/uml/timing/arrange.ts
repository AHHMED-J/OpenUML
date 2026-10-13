/**
 * Frame-level arrangement of a timing diagram (spec 27 §5). Lifeline bands, state rows, time
 * segments and ticks are independent views whose positions are derived from the whole diagram:
 * bands are stacked top-down in the order of their stored `top`; rows are stacked inside their
 * band; the segments of a lifeline are laid out contiguously from `startX` in the order of their
 * stored `left`; ticks are laid out contiguously along the bottom of the frame.
 *
 * `arrangeTiming(ctx)` is computed once per layout pass (cached on the context) and read by the
 * node layouts of the frame, lifelines, rows, segments and ticks. Pure: reads the model.
 */
import { isKindOf, type Elem, type NodeView, type View } from '../../../model'
import { withFontStyle, type Font, type Rect } from '../../core'
import { effectiveBox, nameOf, styleOf } from '../../layout/helpers'
import type { LayoutContext } from '../../layout/types'
import { layoutFrameLabel, type FrameLabelLayout } from '../../render/generic'
import { lifelineHeaderText } from '../sequence/strings'

/** Constants of the notation. */
export const TIMING = {
  rowHeight: 25,
  bandPadding: 25,
  segmentHeight: 25,
  segmentMinWidth: 8,
  tickMin: 9,
  tickHeight: 11,
  /** Space between the frame label band and the first lifeline band. */
  topGap: 5,
  /** Distance of the row label from `startX`. */
  labelGap: 5,
  /** Gap between the rotated lifeline name and the rows. */
  nameGap: 10,
  /** Offset of the rotated lifeline name from the band's left edge. */
  nameOffset: 10
} as const

interface BandInfo {
  readonly viewId: string
  readonly box: Rect
  /** Rotated name text and the (unrotated, centered) box it is drawn in. */
  readonly nameText: string
  readonly nameBox: Rect
  readonly rowIds: readonly string[]
  readonly minWidth: number
  readonly minHeight: number
  readonly font: Font
}

interface RowInfo {
  readonly viewId: string
  readonly bandId: string
  readonly box: Rect
  readonly labelText: string
  readonly labelBox: Rect
  readonly minLabelWidth: number
}

interface SegmentInfo {
  readonly viewId: string
  readonly bandId: string
  readonly rowId: string | null
  readonly box: Rect
  /** y of the segment line (row top + 12). */
  readonly centerY: number
  /** State-change step from the predecessor segment: x and the two row center ys. */
  readonly step: { readonly x: number; readonly fromY: number; readonly toY: number } | null
}

export interface TimingArrangement {
  readonly frameId: string | null
  readonly frameBox: Rect | null
  readonly frameLabel: FrameLabelLayout | null
  readonly frameMinWidth: number
  readonly frameMinHeight: number
  readonly startX: number
  readonly bands: ReadonlyMap<string, BandInfo>
  readonly rows: ReadonlyMap<string, RowInfo>
  readonly segments: ReadonlyMap<string, SegmentInfo>
  readonly ticks: ReadonlyMap<string, Rect>
  readonly tickTextY: number
}

const cache = new WeakMap<LayoutContext, TimingArrangement>()

function visibleViews(ctx: LayoutContext, type: string): NodeView[] {
  return (ctx.diagram.ownedViews ?? []).filter((v): v is NodeView => isKindOf(v, type) && v.visible !== false)
}

/** Stable sort by a numeric key (list order breaks ties). */
function sortedBy<T>(items: readonly T[], key: (t: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, k: key(item) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((e) => e.item)
}

/** Lifeline model of a view that belongs to a lifeline (row: its constraint's owner). */
function ownerLifelineOf(view: View): Elem | null {
  const m = view.model
  if (m && isKindOf(m, 'UMLLifeline')) return m
  const parent = m?._parent
  if (parent && isKindOf(parent, 'UMLLifeline')) return parent
  const container = view.containerView?.model
  return container && isKindOf(container, 'UMLLifeline') ? container : null
}

export function arrangeTiming(ctx: LayoutContext): TimingArrangement {
  const hit = cache.get(ctx)
  if (hit) return hit
  const result = compute(ctx)
  cache.set(ctx, result)
  return result
}

function compute(ctx: LayoutContext): TimingArrangement {
  const frame = visibleViews(ctx, 'UMLTimingFrameView')[0] ?? null
  const style = frame ? styleOf(frame) : null
  const font: Font = style?.font ?? { face: 'Arial', size: 13, style: 0 }
  const boldFont = withFontStyle(font, true, false)
  const measure = (text: string, f: Font) => ctx.measurer.measure(text, f)

  const lifelines = sortedBy(visibleViews(ctx, 'UMLTimingLifelineView'), (v) => v.top ?? 0)
  const rowViews = visibleViews(ctx, 'UMLTimingStateView')
  const segViews = visibleViews(ctx, 'UMLTimeSegmentView')
  const tickViews = sortedBy(visibleViews(ctx, 'UMLTimeTickView'), (v) => v.left ?? 0)

  // Frame label (keyword `sd`, then the owner's name) and the left edge everything hangs from.
  const owner = frame?.model && isKindOf(frame.model, 'Diagram') ? frame.model._parent : null
  const label = layoutFrameLabel({ left: 0, top: 0, width: 0, height: 0 }, 'sd', nameOf(owner), font, ctx.measurer)
  const frameLeft = frame?.left ?? 0
  const frameTop = frame?.top ?? 0

  // Per-lifeline rows and labels.
  interface Pending {
    view: NodeView
    nameText: string
    nameW: number
    nameH: number
    rows: Array<{ view: NodeView; label: string; labelW: number; height: number }>
  }
  const pendings: Pending[] = lifelines.map((view) => {
    const nameText = lifelineHeaderText(view.model)
    const size = measure(nameText, boldFont)
    const ownRows = sortedBy(
      rowViews.filter((r) => ownerLifelineOf(r) === view.model && view.model !== null),
      (r) => r.top ?? 0
    )
    return {
      view,
      nameText,
      nameW: Math.ceil(size.width),
      nameH: size.height,
      rows: ownRows.map((r) => {
        const text = nameOf(r.model)
        const s = measure(text, font)
        return { view: r, label: text, labelW: Math.ceil(s.width), height: Math.max(TIMING.rowHeight, Math.ceil(s.height) + 6) }
      })
    }
  })

  // startX: right of every row's label.
  let startX = frameLeft
  for (const p of pendings) {
    const rowLeft = frameLeft + TIMING.nameOffset + p.nameH + TIMING.nameGap
    for (const r of p.rows) startX = Math.max(startX, rowLeft + r.labelW + TIMING.labelGap)
  }

  // Segments per lifeline, contiguous from startX.
  const segBoxes = new Map<string, Rect>()
  const segsByLifeline = new Map<Elem, NodeView[]>()
  for (const s of segViews) {
    const covered = (s.model?.['covered'] as Elem | null | undefined) ?? ownerLifelineOfSegment(s)
    if (!covered) continue
    const list = segsByLifeline.get(covered) ?? []
    list.push(s)
    segsByLifeline.set(covered, list)
  }
  let maxRight = startX
  for (const list of segsByLifeline.values()) {
    let x = startX
    for (const s of sortedBy(list, (v) => v.left ?? 0)) {
      const w = Math.max(TIMING.segmentMinWidth, s.width ?? 0)
      segBoxes.set(s._id, { left: x, top: 0, width: w, height: TIMING.segmentHeight })
      x += w
    }
    maxRight = Math.max(maxRight, x)
  }

  // Ticks, contiguous from startX.
  const tickBoxes = new Map<string, Rect>()
  let tx = startX
  for (const t of tickViews) {
    const w = Math.max(TIMING.tickMin, t.width ?? 0)
    tickBoxes.set(t._id, { left: tx, top: 0, width: w, height: TIMING.tickHeight })
    tx += w
  }
  maxRight = Math.max(maxRight, tx)
  const tickTextHeight = tickViews.length > 0 ? measure('0', font).height : 0
  const tickArea = tickViews.length > 0 ? TIMING.tickHeight + 10 + Math.ceil(tickTextHeight / 2) + 5 : 0

  // Band minimum sizes.
  const bandMins = pendings.map((p) => {
    const rowsH = p.rows.reduce((h, r) => h + r.height, 0)
    const rowMinW = p.rows.reduce((w, r) => Math.max(w, r.labelW + TIMING.labelGap + 30), 0)
    const minWidth = TIMING.nameOffset + p.nameH + TIMING.nameGap + rowMinW
    const minHeight = Math.max(p.nameW + 10, TIMING.bandPadding + rowsH + TIMING.bandPadding)
    return { minWidth, minHeight }
  })

  const bandsTop = frameTop + label.bandHeight + TIMING.topGap
  const bandsHeight = bandMins.reduce((h, m) => h + m.minHeight, 0)
  const frameMinWidth = Math.max(label.minWidth, ...bandMins.map((m) => m.minWidth), Math.ceil(maxRight - frameLeft) + 5)
  const frameMinHeight = Math.max(30, label.bandHeight + TIMING.topGap + bandsHeight + 5 + tickArea)
  const frameBox = frame ? effectiveBox(frame, frameMinWidth, frameMinHeight) : null
  const frameLabel = frameBox ? layoutFrameLabel(frameBox, 'sd', nameOf(owner), font, ctx.measurer) : null

  const bands = new Map<string, BandInfo>()
  const rows = new Map<string, RowInfo>()
  const segments = new Map<string, SegmentInfo>()
  const width = frameBox?.width ?? 0
  let y = bandsTop
  pendings.forEach((p, i) => {
    const mins = bandMins[i] as { minWidth: number; minHeight: number }
    const box: Rect = { left: frameLeft, top: y, width: Math.max(width, mins.minWidth), height: mins.minHeight }
    const nameBox: Rect = { left: box.left + TIMING.nameOffset, top: box.top, width: p.nameH, height: p.nameW }
    const rowIds: string[] = []
    const rowLeft = nameBox.left + p.nameH + TIMING.nameGap
    let ry = box.top + TIMING.bandPadding
    for (const r of p.rows) {
      const rowBox: Rect = { left: rowLeft, top: ry, width: Math.max(0, box.left + box.width - rowLeft - 5), height: r.height }
      const labelBox: Rect = { left: startX - TIMING.labelGap - r.labelW, top: ry, width: r.labelW, height: r.height }
      const info: RowInfo = { viewId: r.view._id, bandId: p.view._id, box: rowBox, labelText: r.label, labelBox, minLabelWidth: r.labelW }
      rows.set(r.view._id, info)
      rowIds.push(r.view._id)
      ry += r.height
    }
    bands.set(p.view._id, { viewId: p.view._id, box, nameText: p.nameText, nameBox, rowIds, minWidth: mins.minWidth, minHeight: mins.minHeight, font: boldFont })
    y += mins.minHeight

    // Segments of this lifeline.
    const own = p.view.model ? (segsByLifeline.get(p.view.model) ?? []) : []
    let prev: SegmentInfo | null = null
    for (const s of sortedBy(own, (v) => v.left ?? 0)) {
      const pre = segBoxes.get(s._id) as Rect
      const rowInfo = rowOfSegmentView(s, p.rows.map((r) => r.view), rows)
      const rowTop = rowInfo ? rowInfo.box.top : box.top + TIMING.bandPadding
      const segBox: Rect = { ...pre, top: rowTop }
      const centerY = rowTop + 12
      const info: SegmentInfo = {
        viewId: s._id,
        bandId: p.view._id,
        rowId: rowInfo?.viewId ?? null,
        box: segBox,
        centerY,
        step: prev ? { x: segBox.left, fromY: centerY, toY: prev.centerY } : null
      }
      segments.set(s._id, info)
      prev = info
    }
  })

  const ticks = new Map<string, Rect>()
  const frameBottom = frameBox ? frameBox.top + frameBox.height : 0
  for (const [id, b] of tickBoxes) ticks.set(id, { ...b, top: frameBottom - tickArea })

  return {
    frameId: frame?._id ?? null,
    frameBox,
    frameLabel,
    frameMinWidth,
    frameMinHeight,
    startX,
    bands,
    rows,
    segments,
    ticks,
    tickTextY: frameBottom - tickArea + TIMING.tickHeight + 10
  }
}

function ownerLifelineOfSegment(view: View): Elem | null {
  const row = view.containerView?.model
  const parent = row?._parent
  return parent && isKindOf(parent, 'UMLLifeline') ? parent : null
}

/** The row view of a segment: the one showing its `invariant` constraint, else its container. */
function rowOfSegmentView(seg: View, candidates: readonly NodeView[], rows: ReadonlyMap<string, RowInfo>): RowInfo | null {
  const invariant = seg.model?.['invariant']
  const byModel = candidates.find((r) => r.model === invariant && invariant !== undefined && typeof invariant === 'object')
  const view = byModel ?? candidates.find((r) => r === seg.containerView)
  return view ? (rows.get(view._id) ?? null) : null
}
