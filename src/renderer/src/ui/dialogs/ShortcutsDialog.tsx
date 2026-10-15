/**
 * Keyboard Shortcuts: every command with its keystrokes. Add Shortcut records the next key
 * combination; a keystroke another command uses moves after confirmation; × removes one; Reset
 * restores a command's defaults. Changes apply at once (menus included) and are kept per viewer.
 */
import { useMemo, useState } from 'react'
import type React from 'react'
import { bridge, platform } from '../app/bridge'
import { keymap, registry } from '../app/commands'
import { Modal } from '../components/Modal'
import { assignKeystroke, removeKeystroke, resetKeystrokes } from '../keybindings'
import { displayKeystroke, eventToDescriptor } from '../keymap'
import { commandCategory, PALETTE_HIDDEN } from '../menus/commandIds'
import { uiStore, useUiStore } from '../uiStore'

interface Row {
  readonly id: string
  readonly title: string
}

async function confirmMove(key: string, ownerTitle: string, title: string): Promise<boolean> {
  const message = `${displayKeystroke(key, platform)} is already used by "${ownerTitle}".`
  const detail = `Use it for "${title}" instead? "${ownerTitle}" loses this shortcut.`
  if (!bridge) return window.confirm(`${message}\n\n${detail}`)
  return (await bridge.showMessageBox({ type: 'question', message, detail, buttons: ['Reassign', 'Cancel'] })) === 0
}

export function ShortcutsDialog(): React.JSX.Element {
  const overrides = useUiStore((s) => s.keybindings)
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const close = (): void => uiStore.getState().openModal(null)
  const set = (next: typeof overrides): void => uiStore.getState().setKeybindings(next)
  const current = (command: string): string[] => keymap.keystrokesFor(command)

  const rows = useMemo<Row[]>(
    () =>
      registry
        .all()
        .filter((c) => c.label && !PALETTE_HIDDEN.has(c.id))
        .map((c) => {
          const category = commandCategory(c.id)
          return { id: c.id, title: category ? `${category}: ${c.label}` : c.label ?? c.id }
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    []
  )
  const titleOf = (id: string): string => rows.find((r) => r.id === id)?.title ?? id
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) => r.title.toLowerCase().includes(q) || current(r.id).some((k) => displayKeystroke(k, platform).toLowerCase().includes(q) || k.includes(q)))
    : rows

  const record = async (command: string, e: React.KeyboardEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape' || e.key === 'Tab') {
      setRecording(null)
      return
    }
    const key = eventToDescriptor(e.nativeEvent)
    // Lone modifier presses wait for the rest of the combination.
    if (!key) return
    setRecording(null)
    if (current(command).includes(key)) return
    const owner = keymap.match(key)?.command ?? null
    if (owner && owner !== command && !(await confirmMove(key, titleOf(owner), titleOf(command)))) return
    set(assignKeystroke(uiStore.getState().keybindings, current, command, key, owner))
  }

  return (
    <Modal
      title="Keyboard Shortcuts"
      onClose={close}
      width={640}
      className="shortcuts"
      footer={
        <>
          <button className="button" disabled={Object.keys(overrides).length === 0} onClick={() => set({})}>
            Reset All
          </button>
          <span className="spacer" />
          <button className="button primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <input
        className="full"
        type="search"
        placeholder="Search commands or keys"
        aria-label="Search commands or keys"
        value={query}
        data-autofocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="shortcut-list" role="list" aria-label="Commands">
        {shown.length === 0 ? <div className="empty-note">No matching commands</div> : null}
        {shown.map((row) => {
          const keys = current(row.id)
          const customized = Object.hasOwn(overrides, row.id)
          return (
            <div key={row.id} className={`shortcut-row${customized ? ' customized' : ''}`} role="listitem">
              <span className="shortcut-title" title={row.id}>
                {row.title}
              </span>
              <span className="shortcut-keys">
                {keys.map((k) => (
                  <kbd key={k} className="shortcut-key">
                    {displayKeystroke(k, platform)}
                    <button
                      className="shortcut-remove"
                      aria-label={`Remove ${displayKeystroke(k, platform)} from ${row.title}`}
                      title="Remove this shortcut"
                      onClick={() => set(removeKeystroke(uiStore.getState().keybindings, current, row.id, k))}
                    >
                      ×
                    </button>
                  </kbd>
                ))}
                {recording === row.id ? (
                  <button className="button recording" autoFocus onKeyDown={(e) => void record(row.id, e)} onBlur={() => setRecording(null)}>
                    Press keys… (Esc cancels)
                  </button>
                ) : (
                  <button className="button small" onClick={() => setRecording(row.id)} aria-label={`Add a shortcut to ${row.title}`}>
                    Add…
                  </button>
                )}
                {customized ? (
                  <button className="button small" onClick={() => set(resetKeystrokes(uiStore.getState().keybindings, row.id))} title="Back to the default shortcuts">
                    Reset
                  </button>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
