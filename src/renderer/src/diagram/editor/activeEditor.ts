/**
 * The diagram editor instance that has (or last had) focus. Commands that need the viewport
 * (fit to window, paste position, quick edit) talk to it through this handle.
 */
import type { Point } from '../core'

export interface EditorHandle {
  readonly diagramId: string
  /** Center of the visible area in diagram units. */
  viewportCenter(): Point
  /** Zooms (via the zoom callback) so the whole diagram fits, then scrolls to it. */
  fitToWindow(): void
  /** Sets the zoom keeping the viewport center fixed. */
  zoomKeepingCenter(zoom: number): void
  /** Opens inline editing on a view (its name). */
  openQuickEdit(viewId: string): void
  /** Moves keyboard focus to the canvas. */
  focus(): void
}

let active: EditorHandle | null = null

export function setActiveEditor(handle: EditorHandle | null): void {
  active = handle
}

/** Clears the active editor only if it is `handle` (on unmount). */
export function releaseActiveEditor(handle: EditorHandle): void {
  if (active === handle) active = null
}

export function getActiveEditor(diagramId?: string | null): EditorHandle | null {
  if (!active) return null
  return diagramId && active.diagramId !== diagramId ? null : active
}

let pendingReveal: string | null = null

/** Asks the editor that shows `viewId` to scroll it into view once it is laid out. */
export function requestReveal(viewId: string): void {
  pendingReveal = viewId
}

/** Returns and clears the pending reveal when `has` accepts it (the view is in that editor). */
export function takeReveal(has: (viewId: string) => boolean): string | null {
  if (!pendingReveal || !has(pendingReveal)) return null
  const id = pendingReveal
  pendingReveal = null
  return id
}

/** The edge end a context menu was opened on: the edge view and the end element (e.g. an association end). */
export interface ContextEdgeEnd {
  readonly viewId: string
  readonly endId: string
}

let contextEdgeEnd: ContextEdgeEnd | null = null

/** Records which edge end (if any) the last right-click was near, for the context menu. */
export function setContextEdgeEnd(value: ContextEdgeEnd | null): void {
  contextEdgeEnd = value
}

export function getContextEdgeEnd(): ContextEdgeEnd | null {
  return contextEdgeEnd
}
