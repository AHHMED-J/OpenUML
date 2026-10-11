/**
 * Documentation editor: plain text bound to the `documentation` field of the single selected
 * element. Commits on blur (and before Save, which blurs the field) as one undo step; pending
 * text is also committed when the selection changes.
 */
import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { setFields } from '../../commands'
import { fieldOf, type Elem } from '../../model'
import { projectStore } from '../../store'
import { reportError } from '../app/commands'
import { useSelectedModels } from './useSelection'

function commitDocumentation(el: Elem, text: string): void {
  if (!projectStore.getState().repository.contains(el)) return
  if ((el['documentation'] ?? '') === text) return
  try {
    setFields(projectStore.getState().engine, el, { documentation: text }, 'Change Documentation')
  } catch (err) {
    reportError(err)
  }
}

export function DocumentationEditor(): React.JSX.Element {
  const { models } = useSelectedModels()
  const el = models.length === 1 && fieldOf(models[0] as Elem, 'documentation') ? (models[0] as Elem) : null
  if (!el) {
    return <div className="empty-note">{models.length > 1 ? 'Select a single element to edit its documentation.' : 'Nothing selected'}</div>
  }
  return <DocumentationText key={el._id} el={el} />
}

function DocumentationText({ el }: { el: Elem }): React.JSX.Element {
  const stored = typeof el['documentation'] === 'string' ? (el['documentation'] as string) : ''
  const [text, setText] = useState(stored)
  const pending = useRef({ el, text: stored, dirty: false })
  const focused = useRef(false)

  // Follow external changes (undo/redo) while not editing.
  useEffect(() => {
    if (!focused.current) {
      setText(stored)
      pending.current = { el, text: stored, dirty: false }
    }
  }, [stored, el])

  // Commit pending text when the selection moves to another element.
  useEffect(
    () => () => {
      const p = pending.current
      if (p.dirty) commitDocumentation(p.el, p.text)
    },
    []
  )

  return (
    <textarea
      className="documentation"
      aria-label="Documentation"
      placeholder="Documentation"
      value={text}
      spellCheck
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => {
        setText(e.target.value)
        pending.current = { el, text: e.target.value, dirty: true }
      }}
      onBlur={() => {
        focused.current = false
        if (pending.current.dirty) {
          pending.current.dirty = false
          commitDocumentation(el, text)
        }
      }}
    />
  )
}
