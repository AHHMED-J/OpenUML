/**
 * Drop-down of the compact toolbar: a button that shows the toolbar buttons that do not fit the
 * compact column. It opens beside its button, towards the canvas, and its tooltip goes left too.
 * Using any button in it closes it (open it again for the next one); so do Esc, a click outside,
 * and clicking the trigger again. Opening it moves the keyboard focus to its first button.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type React from 'react'
import { UiIcon } from './icons'

export function ToolbarOverflow({ label = 'More Tools', children }: { label?: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const first = panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (target && (panel.current?.contains(target) || trigger.current?.contains(target))) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [open])

  return (
    <span className="toolbar-overflow-anchor">
      <button
        ref={trigger}
        className={`icon-button toolbar-button${open ? ' pressed' : ''}`}
        data-tip={label}
        data-tip-side="left"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <UiIcon name="ellipsis" />
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          className="toolbar-overflow"
          role="group"
          aria-label={label}
          // A button's own click runs first; the click then reaches here and closes the drop-down.
          onClick={(e) => {
            const button = (e.target as Element).closest('button')
            if (button && !button.disabled) setOpen(false)
          }}
        >
          {children}
        </div>
      ) : null}
    </span>
  )
}
