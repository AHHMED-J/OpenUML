/** Export Interactive Website: the page title and which diagrams the website includes. */
import { useState } from 'react'
import type React from 'react'
import { Modal } from '../components/Modal'
import { uiStore, type WebsiteChoice, type WebsiteDiagramRow } from '../uiStore'

export function WebsiteDialog({
  initialTitle,
  diagrams,
  resolve
}: {
  initialTitle: string
  diagrams: readonly WebsiteDiagramRow[]
  resolve: (choice: WebsiteChoice | null) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(initialTitle)
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(diagrams.map((d) => d.id)))
  const finish = (choice: WebsiteChoice | null): void => {
    uiStore.getState().openModal(null)
    resolve(choice)
  }
  const toggle = (id: string): void => {
    const next = new Set(ticked)
    if (!next.delete(id)) next.add(id)
    setTicked(next)
  }
  const ready = ticked.size > 0 && title.trim() !== ''
  const submit = (): void => {
    if (ready) finish({ title: title.trim(), diagramIds: diagrams.filter((d) => ticked.has(d.id)).map((d) => d.id) })
  }
  return (
    <Modal
      title="Export Interactive Website"
      onClose={() => finish(null)}
      width={520}
      footer={
        <>
          <span className="empty-note" role="status">
            {ticked.size} of {diagrams.length} diagrams
          </span>
          <span className="spacer" />
          <button className="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button className="button primary" disabled={!ready} onClick={submit}>
            Export...
          </button>
        </>
      }
    >
      <p>
        One HTML file anyone can open in a browser, offline: the model tree, the diagrams with zoom, and IDEF0 boxes that open their
        child diagrams.
      </p>
      <div className="pref-row">
        <label htmlFor="website-title">Title</label>
        <input
          id="website-title"
          className="full"
          type="text"
          value={title}
          data-autofocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </div>
      <div className="pref-row">
        <span>Diagrams</span>
        <span>
          <button className="button small" onClick={() => setTicked(new Set(diagrams.map((d) => d.id)))}>
            All
          </button>{' '}
          <button className="button small" onClick={() => setTicked(new Set())}>
            None
          </button>
        </span>
      </div>
      <div className="picker-list" role="group" aria-label="Diagrams to include">
        {diagrams.map((d) => (
          <label key={d.id} className="list-row" style={{ height: 'auto', minHeight: 'var(--row-height)', padding: '3px 8px' }}>
            <input type="checkbox" checked={ticked.has(d.id)} onChange={() => toggle(d.id)} />
            <span className="list-label" style={{ whiteSpace: 'normal' }}>
              {d.label}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
