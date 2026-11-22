/**
 * Message boxes for the web build, in place of the desktop's native ones: the app's own dialog
 * look (`.modal` styles), a focus trap, Enter for the first button and Esc for the Cancel one.
 * Keys stay inside the dialog, so app shortcuts never run behind it.
 */

export interface MessageBoxOptions {
  message: string
  detail?: string
  buttons: string[]
  type?: 'none' | 'info' | 'warning' | 'question'
}

/** The button Esc answers with, as on the desktop: "Cancel" or "No" when there is one, else the first. */
export function cancelIndex(buttons: readonly string[]): number {
  const i = buttons.findIndex((b) => /^(cancel|no)$/i.test(b.trim()))
  return i >= 0 ? i : 0
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

/**
 * Shows a modal dialog and resolves the index of the button used, with the text of `field` (a
 * text field shown under the message) when there is one.
 */
function openDialog(
  title: string,
  body: HTMLElement[],
  buttons: readonly string[],
  escapeIndex: number,
  field?: HTMLInputElement
): Promise<{ index: number; value: string }> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null
    const backdrop = element('div', 'modal-backdrop web-dialog')
    const modal = element('div', 'modal')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', title)
    modal.style.width = '440px'
    const content = element('div', 'modal-body')
    content.append(...body)
    if (field) content.append(field)
    const footer = element('div', 'modal-footer')
    footer.append(element('span', 'spacer'))
    const finish = (index: number): void => {
      backdrop.remove()
      previous?.focus?.()
      resolve({ index, value: field?.value ?? '' })
    }
    const buttonEls = buttons.map((label, index) => {
      const b = element('button', index === 0 ? 'button primary' : 'button', label)
      b.type = 'button'
      b.addEventListener('click', () => finish(index))
      return b
    })
    // The first (default) button goes last, at the right, as in the app's dialogs.
    footer.append(...buttonEls.slice(1), ...buttonEls.slice(0, 1))
    modal.append(content, footer)
    backdrop.append(modal)
    backdrop.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(escapeIndex)
      } else if (e.key === 'Enter' && (e.target === field || e.target === modal)) {
        e.preventDefault()
        finish(0)
      } else if (e.key === 'Tab') {
        const focusable = [...modal.querySelectorAll<HTMLElement>('button, input')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    })
    modal.tabIndex = -1
    document.body.append(backdrop)
    if (field) {
      field.focus()
      field.select()
    } else (buttonEls[0] ?? modal).focus()
  })
}

export async function showMessageBox(options: MessageBoxOptions): Promise<number> {
  const body = [element('p', 'web-dialog-message', options.message)]
  if (options.detail) body.push(element('p', 'web-dialog-detail muted', options.detail))
  const buttons = options.buttons.length > 0 ? options.buttons : ['OK']
  return (await openDialog(options.message, body, buttons, cancelIndex(buttons))).index
}

/** Asks for a file name (Save As in browsers that cannot show a save dialog). Null when cancelled. */
export async function askFileName(defaultName: string): Promise<string | null> {
  const field = element('input', 'web-dialog-field')
  field.type = 'text'
  field.value = defaultName
  field.setAttribute('aria-label', 'File name')
  const body = [
    element('p', 'web-dialog-message', 'Save as'),
    element('p', 'web-dialog-detail muted', 'The file is saved to your downloads folder.')
  ]
  const { index, value } = await openDialog('Save as', body, ['Save', 'Cancel'], 1, field)
  return index === 0 && value.trim() ? value.trim() : null
}
