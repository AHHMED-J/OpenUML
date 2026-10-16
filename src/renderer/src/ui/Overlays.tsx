/** Modal dialog host and toast notifications. */
import type React from 'react'
import { ChecklistDialog } from './dialogs/ChecklistDialog'
import { CommandPalette } from './dialogs/CommandPalette'
import { ListDialog } from './dialogs/ListDialog'
import { ElementPickerDialog, PromptDialog, ReferenceListDialog } from './dialogs/PickerDialogs'
import { PreferencesDialog } from './dialogs/PreferencesDialog'
import { ShortcutsDialog } from './dialogs/ShortcutsDialog'
import { WebsiteDialog } from './dialogs/WebsiteDialog'
import { Modal } from './components/Modal'
import { PanelBoundary, PanelErrorMessage } from './components/PanelBoundary'
import { UiIcon } from './icons'
import { uiStore, useUiStore, type ModalState } from './uiStore'

const modalKeys = new WeakMap<object, number>()
let nextModalKey = 0

/** Stable key per modal state object, so reopening a dialog remounts it with fresh state. */
function keyOf(modal: object): number {
  let key = modalKeys.get(modal)
  if (key === undefined) {
    key = ++nextModalKey
    modalKeys.set(modal, key)
  }
  return key
}

/** Closes `modal`, answering a pending promise-based dialog with "cancelled". */
function dismissModal(modal: ModalState): void {
  if (modal.kind === 'prompt' || modal.kind === 'picker' || modal.kind === 'refList' || modal.kind === 'checklist' || modal.kind === 'website') modal.resolve(null)
  uiStore.getState().openModal(null)
}

/** The open dialog, inside an error boundary: a dialog that fails to render can still be closed. */
export function ModalHost(): React.JSX.Element | null {
  const modal = useUiStore((s) => s.modal)
  if (!modal) return null
  return (
    <PanelBoundary
      name="Dialog"
      resetKey={modal}
      fallback={({ reload }) => (
        <Modal title="Error" onClose={() => dismissModal(modal)} width={360}>
          <PanelErrorMessage name="Dialog" reload={reload} what="dialog" />
        </Modal>
      )}
    >
      <ModalContent modal={modal} />
    </PanelBoundary>
  )
}

function ModalContent({ modal }: { modal: ModalState }): React.JSX.Element {
  const modalKey = keyOf(modal)
  switch (modal.kind) {
    case 'palette':
      return <CommandPalette key={modalKey} />
    case 'preferences':
      return <PreferencesDialog key={modalKey} />
    case 'shortcuts':
      return <ShortcutsDialog key={modalKey} />
    case 'website':
      return <WebsiteDialog key={modalKey} initialTitle={modal.title} diagrams={modal.diagrams} resolve={modal.resolve} />
    case 'checklist':
      return <ChecklistDialog key={modalKey} title={modal.title} message={modal.message} rows={modal.rows} required={modal.required} resolve={modal.resolve} />
    case 'list':
      return <ListDialog key={modalKey} title={modal.title} items={modal.items} />
    case 'prompt':
      return <PromptDialog key={modalKey} title={modal.title} initial={modal.initial} resolve={modal.resolve} />
    case 'picker':
      return <ElementPickerDialog key={modalKey} title={modal.title} types={modal.types} resolve={modal.resolve} />
    case 'refList':
      return <ReferenceListDialog key={modalKey} title={modal.title} types={modal.types} initial={modal.initial} resolve={modal.resolve} />
  }
}

export function Toasts(): React.JSX.Element {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <span>{t.text}</span>
          <button className="icon-button" aria-label="Dismiss" data-tip="Dismiss" onClick={() => uiStore.getState().dismissToast(t.id)}>
            <UiIcon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
