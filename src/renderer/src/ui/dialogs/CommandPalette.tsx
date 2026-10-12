/** Command palette (Mod+Shift+P): every enabled, labelled command with its keystroke. */
import { useMemo, useState } from 'react'
import type React from 'react'
import { platform } from '../app/bridge'
import { keystrokeFor, registry, runCommand } from '../app/commands'
import { Modal } from '../components/Modal'
import { displayKeystroke } from '../keymap'
import { commandCategory, PALETTE_HIDDEN } from '../menus/commandIds'
import { uiStore, useUiStore } from '../uiStore'
import { rankEntries } from './paletteSearch'

export function CommandPalette(): React.JSX.Element {
  const mru = useUiStore((s) => s.paletteMru)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const close = (): void => uiStore.getState().openModal(null)

  const entries = useMemo(
    () =>
      registry
        .all()
        .filter((c) => c.label && !PALETTE_HIDDEN.has(c.id) && registry.isEnabled(c.id))
        .map((c) => {
          const category = commandCategory(c.id)
          return { id: c.id, title: category ? `${category}: ${c.label}` : c.label }
        }),
    []
  )
  const results = rankEntries(entries, query, mru).slice(0, 100)
  const current = Math.min(active, Math.max(0, results.length - 1))

  const run = (id: string): void => {
    close()
    uiStore.getState().notePaletteUse(id)
    // Let the dialog close (and focus return) before running.
    setTimeout(() => runCommand(id), 0)
  }

  return (
    <Modal title="Command Palette" onClose={close} width={560} className="palette" bare>
      <input
        className="palette-input"
        type="text"
        placeholder="Type a command"
        aria-label="Command"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={results[current] ? `palette-${current}` : undefined}
        value={query}
        data-autofocus
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive(Math.min(results.length - 1, current + 1))
          else if (e.key === 'ArrowUp') setActive(Math.max(0, current - 1))
          else if (e.key === 'Enter' && results[current]) run(results[current].id)
          else return
          e.preventDefault()
        }}
      />
      <div className="palette-list" id="palette-list" role="listbox" aria-label="Commands">
        {results.length === 0 ? <div className="empty-note">No matching commands</div> : null}
        {results.map((r, i) => {
          const key = keystrokeFor(r.id)
          return (
            <div
              key={r.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === current}
              className={`palette-item${i === current ? ' active' : ''}`}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => run(r.id)}
            >
              <span>{r.title}</span>
              {key ? <kbd>{displayKeystroke(key, platform)}</kbd> : null}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
