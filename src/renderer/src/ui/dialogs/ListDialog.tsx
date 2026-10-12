/** Read-only result list (validation warnings, node index): clicking a row closes the dialog and runs its action. */
import type React from 'react'
import { Modal } from '../components/Modal'
import { uiStore, type ListRow } from '../uiStore'

export function ListDialog({ title, items }: { title: string; items: readonly ListRow[] }): React.JSX.Element {
  const close = (): void => uiStore.getState().openModal(null)
  return (
    <Modal
      title={title}
      onClose={close}
      width={560}
      footer={
        <>
          <span className="spacer" />
          <button className="button primary" onClick={close} data-autofocus>
            Close
          </button>
        </>
      }
    >
      <div className="picker-list" role="list" aria-label={title}>
        {items.length === 0 ? <div className="empty-note">Nothing to show</div> : null}
        {items.map((item, i) => (
          <div
            key={i}
            role="listitem"
            tabIndex={0}
            className="list-row"
            style={{ paddingLeft: 8 + (item.indent ?? 0) * 16 }}
            onClick={() => {
              close()
              item.onSelect?.()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                close()
                item.onSelect?.()
              }
            }}
          >
            <span className="list-label">{item.text}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
