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
