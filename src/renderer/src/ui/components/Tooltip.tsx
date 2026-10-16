/**
 * Tooltips of the app's icon buttons: any element with a `data-tip` attribute shows that text in a
 * small bubble after a short hover (about 0.4 s; at once when moving from one tipped button to the
 * next), or when it gets keyboard focus. Replaces the native `title` tooltips, which come late or
 * not at all in Electron on macOS. One layer for the whole window, mounted once by the shell.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'

/** Hover time before a tooltip shows. */
const SHOW_DELAY_MS = 400
/** After a tooltip hides, the next one within this time shows almost at once. */
const WARM_MS = 600
const WARM_DELAY_MS = 40
/** Gap between the element and the bubble; margin kept from the window edges. */
const GAP = 6
const EDGE = 4

interface Tip {
  readonly text: string
  readonly anchor: DOMRect
}

/** Where a bubble of `size` goes for `anchor`: centered below it, above when it would not fit. */
export function tooltipPosition(anchor: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number } {
  const below = anchor.top + anchor.height + GAP
  const top = below + size.height + EDGE <= viewport.height ? below : Math.max(EDGE, anchor.top - GAP - size.height)
  const centered = anchor.left + anchor.width / 2 - size.width / 2
  const left = Math.min(Math.max(EDGE, centered), Math.max(EDGE, viewport.width - EDGE - size.width))
  return { left: Math.round(left), top: Math.round(top) }
}

function tippedAncestor(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? (target.closest('[data-tip]') as HTMLElement | null) : null
}

export function TooltipLayer(): React.JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const bubble = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let current: HTMLElement | null = null
    /** A bubble is showing (moving to the next tipped element then shows it at once). */
    let shown = false
    let hiddenAt = 0
    const clear = (): void => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const hide = (): void => {
      clear()
      if (shown) hiddenAt = performance.now()
      shown = false
      current = null
      setTip(null)
    }
    const schedule = (el: HTMLElement, delay: number): void => {
      clear()
      current = el
      timer = setTimeout(() => {
        const text = el.getAttribute('data-tip')
        if (!text || !el.isConnected) return
        shown = true
        setTip({ text, anchor: el.getBoundingClientRect() })
      }, delay)
    }
    const onOver = (e: PointerEvent): void => {
      const el = tippedAncestor(e.target)
      if (el === current) return
      if (!el) return hide()
      const warm = shown || performance.now() - hiddenAt < WARM_MS
      hide()
      schedule(el, warm ? WARM_DELAY_MS : SHOW_DELAY_MS)
    }
    const onOut = (e: PointerEvent): void => {
      // Leaving the window, or leaving the tipped element for an untipped one.
      if (!e.relatedTarget || !tippedAncestor(e.relatedTarget)) hide()
    }
    const onFocus = (e: FocusEvent): void => {
      const el = tippedAncestor(e.target)
      if (el && el.matches(':focus-visible')) schedule(el, SHOW_DELAY_MS)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', hide)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clear()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Measured after rendering, then placed next to its element.
  useLayoutEffect(() => {
    const el = bubble.current
    if (!tip || !el) return setPos(null)
    const r = el.getBoundingClientRect()
    setPos(tooltipPosition(tip.anchor, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }))
  }, [tip])

  if (!tip) return null
  return (
    <div ref={bubble} className="app-tooltip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {tip.text}
    </div>
  )
}
