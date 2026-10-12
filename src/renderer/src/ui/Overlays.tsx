/** Modal dialog host and toast notifications. */
import type React from 'react'
import { CommandPalette } from './dialogs/CommandPalette'
import { ListDialog } from './dialogs/ListDialog'
import { ElementPickerDialog, PromptDialog, ReferenceListDialog } from './dialogs/PickerDialogs'
import { PreferencesDialog } from './dialogs/PreferencesDialog'
import { UiIcon } from './icons'
import { uiStore, useUiStore } from './uiStore'

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

export function ModalHost(): React.JSX.Element | null {
  const modal = useUiStore((s) => s.modal)
  if (!modal) return null
  const modalKey = keyOf(modal)
  switch (modal.kind) {
    case 'palette':
      return <CommandPalette key={modalKey} />
    case 'preferences':
      return <PreferencesDialog key={modalKey} />
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
          <button className="icon-button" aria-label="Dismiss" onClick={() => uiStore.getState().dismissToast(t.id)}>
            <UiIcon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
