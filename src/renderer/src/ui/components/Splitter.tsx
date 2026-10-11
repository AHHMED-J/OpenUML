import { useRef } from 'react'
import type React from 'react'

export interface SplitterProps {
  /** `vertical`: a vertical bar that resizes a width; `horizontal`: a horizontal bar that resizes a height. */
  readonly orientation: 'vertical' | 'horizontal'
  readonly size: number
  readonly min?: number
  readonly max?: number
  /** True when the resized panel is after the bar (right/below): dragging toward it shrinks it. */
  readonly after?: boolean
  readonly label: string
  readonly onResize: (size: number) => void
}

/** Drag handle (pointer and keyboard) between two panels. */
export function Splitter({ orientation, size, min = 0, max = 2000, after = false, label, onResize }: SplitterProps): React.JSX.Element {
  const start = useRef<{ pos: number; size: number } | null>(null)
  const clamp = (v: number): number => Math.max(min, Math.min(max, v))
  const axis = (e: React.PointerEvent): number => (orientation === 'vertical' ? e.clientX : e.clientY)

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { pos: axis(e), size }
        document.body.classList.add(orientation === 'vertical' ? 'resizing-x' : 'resizing-y')
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const delta = axis(e) - start.current.pos
        onResize(clamp(start.current.size + (after ? -delta : delta)))
      }}
      onPointerUp={(e) => {
        start.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
        document.body.classList.remove('resizing-x', 'resizing-y')
      }}
      onKeyDown={(e) => {
        const grow = orientation === 'vertical' ? (after ? 'ArrowLeft' : 'ArrowRight') : after ? 'ArrowUp' : 'ArrowDown'
        const shrink = orientation === 'vertical' ? (after ? 'ArrowRight' : 'ArrowLeft') : after ? 'ArrowDown' : 'ArrowUp'
        const step = e.shiftKey ? 50 : 10
        if (e.key === grow) onResize(clamp(size + step))
        else if (e.key === shrink) onResize(clamp(size - step))
        else return
        e.preventDefault()
      }}
    />
  )
}
