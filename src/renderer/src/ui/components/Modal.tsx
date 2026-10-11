import { useEffect, useRef } from 'react'
import type React from 'react'

export interface ModalProps {
  readonly title: string
  readonly onClose: () => void
  readonly children: React.ReactNode
  readonly footer?: React.ReactNode
  readonly width?: number
  readonly className?: string
  /** Hide the title bar (e.g. the command palette). */
  readonly bare?: boolean
}

/** Accessible modal dialog: focus trap, Esc closes, focus returns to the previous element. */
export function Modal({ title, onClose, children, footer, width = 480, className, bare }: ModalProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')
    first?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const focusable = [
      ...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ].filter((el) => !el.hasAttribute('disabled'))
    if (focusable.length === 0) return
    const first = focusable[0] as HTMLElement
    const last = focusable[focusable.length - 1] as HTMLElement
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`modal ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        onKeyDown={onKeyDown}
      >
        {bare ? null : (
          <div className="modal-title">
            <span>{title}</span>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}
