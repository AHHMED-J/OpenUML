/**
 * Panel drag controller. Long-pressing a panel header (or dragging its grip) lifts the panel:
 * a lightweight ghost (a clone of the header plus a skeleton body at the panel's size) follows
 * the pointer, the source slot closes, and the stack under the pointer opens an animated gap at
 * the insertion point. Releasing animates the ghost into the gap and commits the move to the UI
 * store (which persists it); Esc or releasing over no target flies the ghost back.
 *
 * Live drag state stays here (module state + DOM writes in requestAnimationFrame). React only
 * hears about it through `useDockDrag` when the drop target changes, so pointer moves never
 * re-render the shell.
 */
import { useSyncExternalStore } from 'react'
import type React from 'react'
import { uiStore } from '../uiStore'
import { DOCK_PANEL_TITLES, DOCK_AREA_TITLES, areaOf, isDockAreaId, isDockPanelId, visiblePanels, type DockAreaId, type DockPanelId } from './dockModel'
import { computeDropTarget, isNoopTarget, sameTarget, type DropTarget, type EdgeZone, type PanelSpan, type Point, type StackGeometry } from './dropTarget'

export const LONG_PRESS_MS = 380
/** Pointer travel (px) that cancels a long press. */
export const PRESS_TOLERANCE = 4
/** Pointer travel (px) that starts a grip drag. */
export const GRIP_THRESHOLD = 3
const ANIM_MS = 180
/** Length of the tremble that confirms a completed long press (keep in sync with styles.css). */
export const TREMBLE_MS = 500
const COLLAPSED_HEIGHT = 29

export interface DockDragSnapshot {
  /** Panel being dragged (null when idle). */
  readonly id: DockPanelId | null
  readonly target: DropTarget | null
  /** Height of the insertion gap (px). */
  readonly gapHeight: number
  /** `dragging` while following the pointer; `settling` while the ghost animates into place. */
  readonly phase: 'idle' | 'dragging' | 'settling'
  /** Live-region text for the drag itself. */
  readonly message: string
}

const IDLE: DockDragSnapshot = { id: null, target: null, gapHeight: 0, phase: 'idle', message: '' }
let snapshot: DockDragSnapshot = IDLE
const listeners = new Set<() => void>()

function publish(next: Partial<DockDragSnapshot>): void {
  snapshot = { ...snapshot, ...next }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current drag state for rendering gaps, source slots and edge zones. */
export function useDockDrag(): DockDragSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => IDLE)
}

/** Gap element key (`data-dock-gap`) for an insertion point. */
export function gapKey(area: DockAreaId, beforeId: DockPanelId | null): string {
  return `${area}:${beforeId ?? '__end'}`
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

function duration(): number {
  return reducedMotion() ? 0 : ANIM_MS
}

// ---------------------------------------------------------------------------------------------
// Press (long-press / grip) detection

interface Press {
  readonly id: DockPanelId
  readonly pointerId: number
  readonly start: Point
  last: Point
  readonly header: HTMLElement
  readonly panel: HTMLElement
  readonly immediate: boolean
  timer: ReturnType<typeof setTimeout> | null
}

let press: Press | null = null

/**
 * Header `pointerdown`: arms a long press (or, with `immediate`, a grip drag that starts after
 * a few pixels of travel). Pointer-downs on `[data-no-drag]` controls are ignored so their
 * clicks keep working.
 */
export function onHeaderPointerDown(e: React.PointerEvent<HTMLElement>, id: DockPanelId, immediate = false): void {
  if (e.button !== 0 || drag || press) return
  if (!immediate && (e.target as HTMLElement).closest('[data-no-drag]')) return
  const header = e.currentTarget.closest<HTMLElement>('[data-dock-header]')
  const panel = e.currentTarget.closest<HTMLElement>('[data-dock-panel]')
  if (!header || !panel) return
  if (immediate) e.preventDefault()
  const start = { x: e.clientX, y: e.clientY }
  press = { id, pointerId: e.pointerId, start, last: start, header, panel, immediate, timer: null }
  if (!immediate) {
    header.classList.add('dock-pressing')
    press.timer = setTimeout(() => {
      const p = press
      if (p) startDrag(p)
    }, LONG_PRESS_MS)
  }
  window.addEventListener('pointermove', onPressMove, true)
  window.addEventListener('pointerup', endPress, true)
  window.addEventListener('pointercancel', endPress, true)
  window.addEventListener('blur', endPress)
}

function onPressMove(e: PointerEvent): void {
  const p = press
  if (!p || e.pointerId !== p.pointerId) return
  p.last = { x: e.clientX, y: e.clientY }
  const dist = Math.hypot(p.last.x - p.start.x, p.last.y - p.start.y)
  if (p.immediate) {
    if (dist > GRIP_THRESHOLD) startDrag(p)
  } else if (dist > PRESS_TOLERANCE) endPress()
}

function endPress(): void {
  const p = press
  if (!p) return
  if (p.timer !== null) clearTimeout(p.timer)
  p.header.classList.remove('dock-pressing')
  press = null
  window.removeEventListener('pointermove', onPressMove, true)
  window.removeEventListener('pointerup', endPress, true)
  window.removeEventListener('pointercancel', endPress, true)
  window.removeEventListener('blur', endPress)
}

// ---------------------------------------------------------------------------------------------
// Drag session

interface Drag {
  readonly id: DockPanelId
  readonly pointerId: number
  readonly header: HTMLElement
  readonly sourceArea: DockAreaId
  readonly sourceOrder: readonly DockPanelId[]
  readonly origin: DOMRect
  readonly offset: Point
  readonly ghost: HTMLElement
  readonly ghostSize: { readonly width: number; readonly height: number }
  pointer: Point
  target: DropTarget | null
  frame: number
  ending: boolean
}

let drag: Drag | null = null

/** True while a panel is lifted (used by tests of the shell and by other pointer handlers). */
export function isDockDragging(): boolean {
  return drag !== null
}

function startDrag(p: Press): void {
  endPress()
  const layout = uiStore.getState().dock
  const origin = p.panel.getBoundingClientRect()
  const sourceArea = areaOf(layout, p.id)
  const ghostSize = { width: Math.max(160, origin.width), height: Math.max(COLLAPSED_HEIGHT, Math.min(origin.height, 240)) }
  const offset = {
    x: Math.max(8, Math.min(ghostSize.width - 8, p.last.x - origin.left)),
    y: Math.max(4, Math.min(24, p.last.y - origin.top))
  }
  const ghost = createGhost(p.header, ghostSize, origin.height > COLLAPSED_HEIGHT + 2)
  setGhostTransform(ghost, origin.left, origin.top)
  document.body.appendChild(ghost)
  try {
    p.header.setPointerCapture(p.pointerId)
  } catch {
    // Capture is an optimization; window listeners still see the pointer.
  }
  drag = {
    id: p.id,
    pointerId: p.pointerId,
    header: p.header,
    sourceArea,
    sourceOrder: visiblePanels(layout, sourceArea),
    origin,
    offset,
    ghost,
    ghostSize,
    pointer: p.last,
    target: null,
    frame: 0,
    ending: false
  }
  document.body.classList.add('dock-dragging', 'dock-animating')
  window.addEventListener('pointermove', onDragMove, true)
  window.addEventListener('pointerup', onDragUp, true)
  window.addEventListener('pointercancel', onDragCancel, true)
  window.addEventListener('keydown', onDragKey, true)
  window.addEventListener('blur', onDragCancel)
  // The placeholder roughly keeps the panel's height, within reason.
  const gapHeight = Math.round(Math.max(48, Math.min(origin.height, 240)))
  const target = computeTarget(drag.pointer)
  drag.target = target
  publish({
    id: p.id,
    target,
    gapHeight,
    phase: 'dragging',
    message: `${DOCK_PANEL_TITLES[p.id]} lifted. Move the pointer to choose a position, release to drop, Escape to cancel.`
  })
  requestAnimationFrame(() => {
    ghost.classList.add('lifted')
    // A completed long press is confirmed by a short tremble; grip drags start without it.
    if (!p.immediate && !reducedMotion()) {
      ghost.classList.add('trembling')
      setTimeout(() => ghost.classList.remove('trembling'), TREMBLE_MS)
    }
    followPointer()
  })
}

function createGhost(header: HTMLElement, size: { width: number; height: number }, withBody: boolean): HTMLElement {
  const ghost = document.createElement('div')
  ghost.className = 'dock-ghost'
  ghost.setAttribute('aria-hidden', 'true')
  ghost.style.width = `${size.width}px`
  ghost.style.height = `${size.height}px`
  const card = document.createElement('div')
  card.className = 'dock-ghost-card'
  const clone = header.cloneNode(true) as HTMLElement
  clone.classList.remove('dock-pressing')
  clone.removeAttribute('data-dock-header')
  for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id')
  card.appendChild(clone)
  if (withBody) {
    const body = document.createElement('div')
    body.className = 'dock-ghost-body'
    for (const w of [72, 54, 64, 40]) {
      const line = document.createElement('span')
      line.style.width = `${w}%`
      body.appendChild(line)
    }
    card.appendChild(body)
  }
  ghost.appendChild(card)
  return ghost
}

function setGhostTransform(ghost: HTMLElement, x: number, y: number): void {
  ghost.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
}

function onDragMove(e: PointerEvent): void {
  const d = drag
  if (!d || d.ending || e.pointerId !== d.pointerId) return
  d.pointer = { x: e.clientX, y: e.clientY }
  if (!d.frame) d.frame = requestAnimationFrame(followPointer)
}

function followPointer(): void {
  const d = drag
  if (!d || d.ending) return
  d.frame = 0
  setGhostTransform(d.ghost, d.pointer.x - d.offset.x, d.pointer.y - d.offset.y)
  const target = computeTarget(d.pointer)
  if (!sameTarget(target, d.target)) {
    d.target = target
    publish({ target })
  }
}

/** Reads the dock geometry from the DOM and resolves the drop target under `pointer`. */
function computeTarget(pointer: Point): DropTarget | null {
  const d = drag
  if (!d) return null
  const stacks: StackGeometry[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-dock-stack]')) {
    const area = el.dataset['dockStack']
    if (!isDockAreaId(area)) continue
    const r = el.getBoundingClientRect()
    const panels: PanelSpan[] = []
    for (const child of el.querySelectorAll<HTMLElement>(':scope > [data-dock-panel]')) {
      const id = child.dataset['dockPanel']
      if (!isDockPanelId(id) || id === d.id) continue
      const pr = child.getBoundingClientRect()
      panels.push({ id, top: pr.top, bottom: pr.bottom })
    }
    const gapEl = el.querySelector<HTMLElement>(':scope > .dock-gap.active')
    const gr = gapEl?.getBoundingClientRect()
    stacks.push({ area, rect: r, panels, gap: gr && gr.height > 4 ? { top: gr.top, bottom: gr.bottom } : null })
  }
  const edges: EdgeZone[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-dock-edge]')) {
    const area = el.dataset['dockEdge']
    if (isDockAreaId(area)) edges.push({ area, rect: el.getBoundingClientRect() })
  }
  return computeDropTarget({ pointer, stacks, edges, dragged: d.id, current: d.target, tolerance: 8 })
}

function onDragKey(e: KeyboardEvent): void {
  if (!drag) return
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') cancelDrag()
}

function onDragCancel(): void {
  cancelDrag()
}

function onDragUp(e: PointerEvent): void {
  const d = drag
  if (!d || d.ending || e.pointerId !== d.pointerId) return
  d.pointer = { x: e.clientX, y: e.clientY }
  if (d.frame) cancelAnimationFrame(d.frame)
  d.frame = 0
  const target = computeTarget(d.pointer)
  if (!target) {
    cancelDrag()
    return
  }
  d.target = target
  dropAt(target)
}

function stopListening(): void {
  window.removeEventListener('pointermove', onDragMove, true)
  window.removeEventListener('pointerup', onDragUp, true)
  window.removeEventListener('pointercancel', onDragCancel, true)
  window.removeEventListener('keydown', onDragKey, true)
  window.removeEventListener('blur', onDragCancel)
}

/** Flies the ghost to `rect` (FLIP-style), then calls `done`. */
function settleGhost(d: Drag, rect: { left: number; top: number; width: number; height: number }, done: () => void): void {
  const ms = duration()
  const ghost = d.ghost
  if (ms > 0) {
    ghost.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0, 0, 1), width ${ms}ms ease-out, height ${ms}ms ease-out`
    ghost.classList.remove('lifted')
    ghost.classList.add('settling')
  }
  setGhostTransform(ghost, rect.left, rect.top)
  ghost.style.width = `${Math.max(40, rect.width)}px`
  ghost.style.height = `${Math.max(COLLAPSED_HEIGHT, rect.height)}px`
  if (ms === 0) done()
  else setTimeout(done, ms + 10)
}

function dropAt(target: DropTarget): void {
  const d = drag
  if (!d) return
  d.ending = true
  stopListening()
  suppressNextClick()
  publish({ phase: 'settling', target })
  const noop = isNoopTarget(target, d.sourceArea, d.sourceOrder, d.id)
  const gapEl = document.querySelector<HTMLElement>(`[data-dock-gap="${gapKey(target.area, target.beforeId)}"]`)
  const edgeEl = document.querySelector<HTMLElement>(`[data-dock-edge="${target.area}"]`)
  const r = (gapEl ?? edgeEl)?.getBoundingClientRect()
  const rect = r ? { left: r.left, top: r.top, width: r.width, height: Math.max(snapshot.gapHeight, r.height) } : d.origin
  settleGhost(d, rect, () => {
    if (!noop) {
      const size = gapEl ? sizeForGap(d, target, gapEl) : undefined
      uiStore.getState().moveDockPanel(d.id, target.area, target.beforeId, size)
    } else {
      announceDrop(d.id, true)
    }
    finish()
  })
}

/**
 * Height weight that makes the dropped panel about as tall as the placeholder in its new
 * stack (only when it changes area; within an area the panel keeps its weight).
 */
function sizeForGap(d: Drag, target: DropTarget, gapEl: HTMLElement): number | undefined {
  if (target.area === d.sourceArea) return undefined
  const layout = uiStore.getState().dock
  if (layout.panels[d.id].collapsed) return undefined
  const stack = gapEl.parentElement
  if (!stack) return undefined
  const others = visiblePanels(layout, target.area).filter((id) => id !== d.id)
  const expanded = others.filter((id) => !layout.panels[id].collapsed)
  if (expanded.length === 0) return undefined
  const weights = expanded.reduce((sum, id) => sum + layout.panels[id].size, 0)
  const fixed = (others.length - expanded.length) * COLLAPSED_HEIGHT
  const flexible = stack.clientHeight - fixed
  const h = gapEl.getBoundingClientRect().height
  if (flexible - h < 60 || h <= 0) return undefined
  return (h * weights) / (flexible - h)
}

function cancelDrag(): void {
  const d = drag
  if (!d || d.ending) return
  d.ending = true
  stopListening()
  suppressNextClick()
  if (d.frame) cancelAnimationFrame(d.frame)
  // Reopen the source slot while the ghost flies home.
  publish({ phase: 'settling', target: null, id: null, message: `${DOCK_PANEL_TITLES[d.id]} move cancelled` })
  settleGhost(d, { left: d.origin.left, top: d.origin.top, width: d.ghostSize.width, height: d.ghostSize.height }, finish)
}

function announceDrop(id: DockPanelId, unchanged: boolean): void {
  const area = areaOf(uiStore.getState().dock, id)
  publish({ message: unchanged ? `${DOCK_PANEL_TITLES[id]} stays in the ${DOCK_AREA_TITLES[area]}` : snapshot.message })
}

function finish(): void {
  const d = drag
  if (!d) return
  drag = null
  try {
    d.header.releasePointerCapture(d.pointerId)
  } catch {
    // Already released (element moved or removed).
  }
  publish({ id: null, target: null, phase: 'idle', gapHeight: 0 })
  document.body.classList.remove('dock-dragging')
  const ghost = d.ghost
  // Let the committed layout paint under the ghost before removing it.
  requestAnimationFrame(() => {
    ghost.classList.add('gone')
    setTimeout(() => {
      ghost.remove()
      if (!drag) document.body.classList.remove('dock-animating')
    }, reducedMotion() ? 0 : 120)
  })
}

/** Swallows the click that follows the pointerup ending a drag (it would toggle the header). */
function suppressNextClick(): void {
  const swallow = (e: MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', swallow, true)
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
}
