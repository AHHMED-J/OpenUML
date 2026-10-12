/**
 * Drop-target computation for panel docking (pure geometry, no DOM). Given the pointer and the
 * rectangles of the dock stacks (and the edge zones shown for empty areas), returns where the
 * dragged panel would land: an area plus the panel it would be inserted before.
 */
import type { DockAreaId, DockPanelId } from './dockModel'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface PanelSpan {
  readonly id: DockPanelId
  readonly top: number
  readonly bottom: number
}

export interface StackGeometry {
  readonly area: DockAreaId
  readonly rect: Rect
  /** Visible panels in stack order (the dragged panel may be included; it is ignored). */
  readonly panels: readonly PanelSpan[]
  /** The currently open insertion gap, if any (pointer inside it keeps the current target). */
  readonly gap?: { readonly top: number; readonly bottom: number } | null
}

export interface EdgeZone {
  readonly area: DockAreaId
  readonly rect: Rect
}

export interface DropTarget {
  readonly area: DockAreaId
  /** Insert before this panel; null = at the end of the area. */
  readonly beforeId: DockPanelId | null
  /** Insertion index among the area's visible panels, excluding the dragged one. */
  readonly index: number
}

export interface DropQuery {
  readonly pointer: Point
  readonly stacks: readonly StackGeometry[]
  readonly edges?: readonly EdgeZone[]
  readonly dragged: DockPanelId
  readonly current?: DropTarget | null
  /** Extra horizontal reach (px) beyond a stack's sides. Default 0. */
  readonly tolerance?: number
}

export function contains(rect: Rect, p: Point, tolerance = 0): boolean {
  return p.x >= rect.left - tolerance && p.x <= rect.right + tolerance && p.y >= rect.top && p.y <= rect.bottom
}

/** The drop target under the pointer, or null when the pointer is over no valid target. */
export function computeDropTarget(q: DropQuery): DropTarget | null {
  const { pointer, dragged } = q
  for (const edge of q.edges ?? []) {
    if (contains(edge.rect, pointer)) return { area: edge.area, beforeId: null, index: 0 }
  }
  for (const stack of q.stacks) {
    if (!contains(stack.rect, pointer, q.tolerance ?? 0)) continue
    const current = q.current
    if (stack.gap && current && current.area === stack.area && pointer.y >= stack.gap.top && pointer.y <= stack.gap.bottom) {
      return current
    }
    const panels = stack.panels.filter((p) => p.id !== dragged)
    let index = 0
    while (index < panels.length) {
      const p = panels[index] as PanelSpan
      if (pointer.y < (p.top + p.bottom) / 2) break
      index++
    }
    return { area: stack.area, beforeId: panels[index]?.id ?? null, index }
  }
  return null
}

export function sameTarget(a: DropTarget | null | undefined, b: DropTarget | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.area === b.area && a.beforeId === b.beforeId
}

/**
 * True when dropping at `target` would leave the layout unchanged: same area and the panel
 * would land right where it already is.
 */
export function isNoopTarget(target: DropTarget, sourceArea: DockAreaId, sourceOrder: readonly DockPanelId[], dragged: DockPanelId): boolean {
  if (target.area !== sourceArea) return false
  const i = sourceOrder.indexOf(dragged)
  if (i < 0) return false
  const next = sourceOrder[i + 1] ?? null
  return target.beforeId === next
}
