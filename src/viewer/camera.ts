/**
 * Camera of the viewer: which part of a diagram the screen shows. A camera is the diagram point at
 * the center of the viewport and the scale (screen pixels per diagram unit); the SVG viewBox
 * follows from it and the viewport size. Pure functions, so pan, zoom, fitting and the animated
 * transitions are testable without a browser.
 */
import type { Bounds } from '../shared/website'

export interface Camera {
  readonly cx: number
  readonly cy: number
  readonly scale: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

const MIN_SCALE = 0.05
export const MAX_SCALE = 8
/** Fitting never zooms in further than this, so a small diagram does not show giant text. */
export const FIT_MAX_SCALE = 2

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * The camera showing all of `bounds`, centered, with `padding` screen pixels around it, zoomed in
 * at most to `maxScale`.
 */
export function fitCamera(bounds: Bounds, viewport: Size, padding = 24, maxScale = FIT_MAX_SCALE): Camera {
  const w = Math.max(1, viewport.width - 2 * padding)
  const h = Math.max(1, viewport.height - 2 * padding)
  const scale = clampScale(Math.min(maxScale, w / Math.max(1, bounds.width), h / Math.max(1, bounds.height)))
  return { cx: bounds.left + bounds.width / 2, cy: bounds.top + bounds.height / 2, scale }
}

/** The SVG viewBox (`x y width height`) of `camera` on a viewport of `size`. */
export function viewBoxOf(camera: Camera, size: Size): [number, number, number, number] {
  const w = Math.max(1, size.width) / camera.scale
  const h = Math.max(1, size.height) / camera.scale
  return [camera.cx - w / 2, camera.cy - h / 2, w, h]
}

/** Diagram point under the screen point `p` (pixels from the viewport's top left). */
export function toDiagram(camera: Camera, size: Size, p: { x: number; y: number }): { x: number; y: number } {
  const [x, y] = viewBoxOf(camera, size)
  return { x: x + p.x / camera.scale, y: y + p.y / camera.scale }
}

/** Zooms by `factor` keeping the diagram point under the screen point `p` in place. */
export function zoomAround(camera: Camera, factor: number, size: Size, p: { x: number; y: number }): Camera {
  const scale = clampScale(camera.scale * factor)
  const anchor = toDiagram(camera, size, p)
  // After zooming, `anchor` must sit at the same screen point.
  const cx = anchor.x - (p.x - size.width / 2) / scale
  const cy = anchor.y - (p.y - size.height / 2) / scale
  return { cx, cy, scale }
}

/** Moves the view by `dx`, `dy` screen pixels (dragging the diagram along). */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { cx: camera.cx - dx / camera.scale, cy: camera.cy - dy / camera.scale, scale: camera.scale }
}

/**
 * The camera `t` (0..1) of the way from `a` to `b`. The scale moves geometrically, so a zoom
 * feels even, and the center follows the scale so the motion looks like flying toward the target.
 */
export function interpolate(a: Camera, b: Camera, t: number): Camera {
  const s = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t)
  const k = a.scale === b.scale ? t : (1 / a.scale - 1 / s) / (1 / a.scale - 1 / b.scale)
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, scale: s }
}

/** Ease-in-out for transitions. */
export function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
