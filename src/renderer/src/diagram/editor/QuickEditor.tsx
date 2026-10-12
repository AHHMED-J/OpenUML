/**
 * Inline editor (quick edit, spec 02 §7.7): an HTML input (textarea for notes) positioned over
 * the edited label. Enter commits, Esc cancels, blur commits; Mod+Enter / Mod+Shift+Enter add an
 * attribute / operation; Up/Down move to the previous/next item.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { cssFontFamily, isBold, isItalic, type Font, type Rect } from '../core'
import type { EditTarget } from '../layout/types'
import { quickEditSyntaxHint } from './quickEditApply'
import { QUICK_EDIT_HINTS } from './quickEditSyntax'

export interface QuickEditState {
  readonly viewId: string
  readonly target: EditTarget
  readonly box: Rect
  readonly text: string
  readonly font: Font
  readonly multiline: boolean
}

export type QuickEditAction = 'commit' | 'add-item' | 'add-operation' | 'previous' | 'next'

export interface QuickEditorProps {
  readonly state: QuickEditState
  readonly zoom: number
  /** Applies the text; returns false when it does not parse (the editor then stays open). */
  readonly onCommit: (text: string, action: QuickEditAction) => boolean
  readonly onCancel: () => void
}

function hintFor(target: EditTarget): string {
  switch (target.kind) {
    case 'attribute':
      return QUICK_EDIT_HINTS.attribute
    case 'operation':
      return QUICK_EDIT_HINTS.operation
    case 'name':
    case 'literal':
      return QUICK_EDIT_HINTS.name
    case 'custom':
      return quickEditSyntaxHint(target.syntax)
    default:
      return ''
  }
}

export function QuickEditor({ state, zoom, onCommit, onCancel }: QuickEditorProps): React.JSX.Element {
  const [text, setText] = useState(state.text)
  const [invalid, setInvalid] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const finish = (action: QuickEditAction): void => {
    if (done.current) return
    // Mark done first: committing moves focus away, which fires blur synchronously.
    done.current = true
    if (!onCommit(text, action)) {
      done.current = false
      setInvalid(true)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    e.stopPropagation()
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Escape') {
      e.preventDefault()
      done.current = true
      onCancel()
    } else if (e.key === 'Enter' && mod) {
      e.preventDefault()
      finish(e.shiftKey ? 'add-operation' : 'add-item')
    } else if (e.key === 'Enter' && !(state.multiline && e.shiftKey)) {
      e.preventDefault()
      finish('commit')
    } else if (!state.multiline && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      finish(e.key === 'ArrowUp' ? 'previous' : 'next')
    }
  }

  const onBlur = (): void => {
    if (done.current) return
    done.current = true
    if (!onCommit(text, 'commit')) onCancel()
  }

  const font = state.font
  const width = Math.max(state.box.width * zoom, 120)
  const lineHeight = font.size * zoom
  const style: React.CSSProperties = {
    position: 'absolute',
    left: state.box.left * zoom,
    top: state.box.top * zoom,
    width,
    height: state.multiline ? Math.max(state.box.height * zoom, lineHeight * 3) : lineHeight + 8,
    marginTop: state.multiline ? 0 : (state.box.height * zoom - lineHeight - 8) / 2,
    boxSizing: 'border-box',
    padding: '2px 4px',
    fontFamily: cssFontFamily(font.face),
    fontSize: lineHeight,
    fontWeight: isBold(font) ? 'bold' : 'normal',
    fontStyle: isItalic(font) ? 'italic' : 'normal',
    color: '#000000',
    background: '#ffffff',
    border: `1px solid ${invalid ? '#e5484d' : '#4f99ff'}`,
    outline: 'none',
    borderRadius: 2,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    zIndex: 10,
    resize: 'none'
  }
  const common = {
    ref,
    value: text,
    style,
    spellCheck: false,
    title: invalid ? `Expected: ${hintFor(state.target)}` : hintFor(state.target),
    placeholder: hintFor(state.target),
    onKeyDown,
    onBlur,
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value)
      setInvalid(false)
    },
    className: 'ou-quick-edit'
  }
  return state.multiline ? <textarea {...common} /> : <input type="text" {...common} />
}
