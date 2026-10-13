/** Checklist dialog: the user ticks exactly `required` rows; OK stays disabled until the count is right. */
import { useState } from 'react'
import type React from 'react'
import { Modal } from '../components/Modal'
import { uiStore, type ChecklistRow } from '../uiStore'

export function ChecklistDialog({
  title,
  message,
  rows,
  required,
  resolve
}: {
  title: string
  message: string
  rows: readonly ChecklistRow[]
  required: number
  resolve: (ids: readonly string[] | null) => void
}): React.JSX.Element {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const finish = (ids: readonly string[] | null): void => {
    uiStore.getState().openModal(null)
    resolve(ids)
  }
  const ready = ticked.size === required
  const toggle = (id: string): void => {
    const next = new Set(ticked)
    if (!next.delete(id)) next.add(id)
    setTicked(next)
  }
  return (
    <Modal
      title={title}
      onClose={() => finish(null)}
      width={520}
      footer={
        <>
          <span className="empty-note" role="status">
            {ticked.size} of {required} selected
          </span>
          <span className="spacer" />
          <button className="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className="button primary" disabled={!ready} onClick={() => finish(rows.filter((r) => ticked.has(r.id)).map((r) => r.id))}>
            OK
          </button>
        </>
      }
    >
      <p>{message}</p>
      <div className="picker-list" role="group" aria-label={title}>
        {rows.map((row, i) => (
          <label key={row.id} className="list-row" style={{ height: 'auto', minHeight: 'var(--row-height)', padding: '3px 8px' }}>
            <input type="checkbox" checked={ticked.has(row.id)} data-autofocus={i === 0 ? true : undefined} onChange={() => toggle(row.id)} />
            <span className="list-label" style={{ whiteSpace: 'normal' }}>
              {row.label}
              <span className="empty-note"> ({row.detail})</span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
