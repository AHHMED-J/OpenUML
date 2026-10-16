/**
 * Viewer engine: shows one diagram SVG in a host element and drives it. Reusable by the website
 * viewer and by a later presentation mode:
 * - mounting: `mount(svgText)` parses the SVG as XML (never as HTML) and shows it;
 * - lookup: `view(id)` / `boundsOf(ids)` find the top-level views by their `data-view-id`;
 * - camera: `camera`, `setCamera`, `fit`, `animateTo` (pan/zoom, animated);
 * - emphasis: `highlight(ids)` dims every other view, `highlight(null)` clears it;
 * - input: drag to pan, wheel or pinch to zoom, and `onViewClick` for clicks that did not drag.
 */
import type { Bounds } from '../shared/website'
import { clampScale, ease, fitCamera, interpolate, panBy, viewBoxOf, zoomAround, type Camera, type Size } from './camera'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Pointer travel (px) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 4

export class ViewerEngine {
  private svg: SVGSVGElement | null = null
  private views = new Map<string, SVGGElement>()
  private current: Camera = { cx: 0, cy: 0, scale: 1 }
  private animation = 0
  /** Called with the clicked top-level view id (null on empty canvas). */
  onViewClick: (viewId: string | null) => void = () => undefined
  /** Called after every camera change. */
  onCameraChange: (camera: Camera) => void = () => undefined

  constructor(readonly host: HTMLElement) {
    host.classList.add('ouv-stage')
    this.bindInput()
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.apply()).observe(host)
  }

  get size(): Size {
    return { width: this.host.clientWidth || 1, height: this.host.clientHeight || 1 }
  }

  get camera(): Camera {
    return this.current
  }

  /** Shows `svgText` (a standalone SVG document), replacing the diagram shown before. */
  mount(svgText: string): SVGSVGElement {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const root = doc.documentElement
    if (root.namespaceURI !== SVG_NS || root.localName !== 'svg') throw new Error('Not an SVG diagram')
    const svg = document.importNode(root, true) as unknown as SVGSVGElement
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.classList.add('ouv-diagram')
    this.cancelAnimation()
    this.svg?.remove()
    this.host.appendChild(svg)
    this.svg = svg
    this.views = new Map()
    for (const g of svg.querySelectorAll<SVGGElement>('[data-view-id]')) {
      const id = g.getAttribute('data-view-id')
      if (id && !this.views.has(id)) this.views.set(id, g)
    }
    this.apply()
    return svg
  }

  view(id: string): SVGGElement | null {
    return this.views.get(id) ?? null
  }

  /** Union of the drawn bounds of `ids` (diagram units), null when none is drawn. */
  boundsOf(ids: Iterable<string>): Bounds | null {
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const id of ids) {
      const g = this.views.get(id)
      if (!g) continue
      const b = g.getBBox()
      left = Math.min(left, b.x)
      top = Math.min(top, b.y)
      right = Math.max(right, b.x + b.width)
      bottom = Math.max(bottom, b.y + b.height)
    }
    return left === Infinity ? null : { left, top, width: right - left, height: bottom - top }
  }

  setCamera(camera: Camera): void {
    this.cancelAnimation()
    this.current = { ...camera, scale: clampScale(camera.scale) }
    this.apply()
  }

  /** Shows all of `bounds` (instantly, or animated over `ms`), zoomed in at most to `maxScale`. */
  fit(bounds: Bounds, ms = 0, padding?: number, maxScale?: number): Promise<void> {
    const target = fitCamera(bounds, this.size, padding, maxScale)
    if (ms <= 0) {
      this.setCamera(target)
      return Promise.resolve()
    }
    return this.animateTo(target, ms)
  }

  /** Moves the camera to `target` over `ms`; resolves when done (or when interrupted). */
  animateTo(target: Camera, ms: number): Promise<void> {
    this.cancelAnimation()
    const from = this.current
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || ms <= 0) {
      this.setCamera(target)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const start = performance.now()
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / ms)
        this.current = interpolate(from, target, ease(t))
        this.apply()
        if (t < 1) this.animation = requestAnimationFrame(step)
        else {
          this.animation = 0
          resolve()
        }
      }
      this.animation = requestAnimationFrame(step)
    })
  }

  /** Dims every view except `ids`; null shows all views normally. */
  highlight(ids: ReadonlySet<string> | null): void {
    this.svg?.classList.toggle('ouv-dimmed', ids !== null)
    for (const [id, g] of this.views) g.classList.toggle('ouv-lit', ids !== null && ids.has(id))
  }

  private cancelAnimation(): void {
    if (this.animation) cancelAnimationFrame(this.animation)
    this.animation = 0
  }

  private apply(): void {
    if (!this.svg) return
    this.svg.setAttribute('viewBox', viewBoxOf(this.current, this.size).map((n) => Math.round(n * 100) / 100).join(' '))
    this.onCameraChange(this.current)
  }

  private bindInput(): void {
    const host = this.host
    let press: { id: number; x: number; y: number; last: { x: number; y: number }; dragged: boolean } | null = null
    host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, last: { x: e.clientX, y: e.clientY }, dragged: false }
    })
    host.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id) return
      if (!press.dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP) return
      if (!press.dragged) {
        press.dragged = true
        host.setPointerCapture(e.pointerId)
        host.classList.add('ouv-panning')
      }
      this.setCamera(panBy(this.current, e.clientX - press.last.x, e.clientY - press.last.y))
      press.last = { x: e.clientX, y: e.clientY }
    })
    const release = (e: PointerEvent, cancelled: boolean): void => {
      if (!press || e.pointerId !== press.id) return
      const { dragged } = press
      press = null
      host.classList.remove('ouv-panning')
      if (dragged || cancelled) return
      const target = e.target instanceof Element ? e.target.closest('[data-view-id]') : null
      this.onViewClick(target && this.svg?.contains(target) ? target.getAttribute('data-view-id') : null)
    }
    host.addEventListener('pointerup', (e) => release(e, false))
    host.addEventListener('pointercancel', (e) => release(e, true))
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const rect = host.getBoundingClientRect()
        const p = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        // Pinch (and Ctrl/Cmd + wheel) zooms; a plain wheel or two-finger swipe pans.
        if (e.ctrlKey || e.metaKey) this.setCamera(zoomAround(this.current, Math.exp(-e.deltaY * 0.01), this.size, p))
        else this.setCamera(panBy(this.current, -e.deltaX, -e.deltaY))
      },
      { passive: false }
    )
  }

  /** Zooms by `factor` around the viewport center (zoom buttons, + / - keys). */
  zoomBy(factor: number): Promise<void> {
    const size = this.size
    return this.animateTo(zoomAround(this.current, factor, size, { x: size.width / 2, y: size.height / 2 }), 160)
  }
}
