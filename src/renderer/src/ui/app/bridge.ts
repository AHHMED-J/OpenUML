/** Access to the preload bridge; null when running outside Electron (e.g. a plain browser preview). */
import type { OpenUmlBridge } from '../../../../shared/ipc'
import type { Platform } from '../keymap'

export const bridge: OpenUmlBridge | null =
  typeof window !== 'undefined' && (window as { openuml?: OpenUmlBridge }).openuml
    ? (window as { openuml: OpenUmlBridge }).openuml
    : null

function guessPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'linux'
  const p = navigator.platform.toLowerCase()
  if (p.startsWith('mac')) return 'darwin'
  if (p.startsWith('win')) return 'win32'
  return 'linux'
}

export const platform: Platform = bridge?.platform ?? guessPlatform()
export const isMac = platform === 'darwin'

/** True when keyboard focus is in an editable text control. */
export function isTextInputFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'range', 'file'].includes(el.type)
  }
  return false
}
