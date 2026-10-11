import type { OpenUmlBridge } from '../../shared/ipc'

declare global {
  interface Window {
    openuml: OpenUmlBridge
  }
}

export {}
