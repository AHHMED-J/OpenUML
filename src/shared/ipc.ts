/** Contract between the main process and the renderer, exposed via the preload bridge. */

export interface MenuItemSpec {
  /** Command ID dispatched to the renderer when clicked. Omit for submenus/separators. */
  command?: string
  label?: string
  /** Electron accelerator string, e.g. "CmdOrCtrl+S". */
  accelerator?: string
  type?: 'normal' | 'separator' | 'checkbox' | 'submenu'
  role?: string
  enabled?: boolean
  checked?: boolean
  submenu?: MenuItemSpec[]
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenFileResult {
  path: string
  content: string
}

export interface OpenUmlBridge {
  platform: NodeJS.Platform
  /** Replace the native application menu. */
  setMenu(menu: MenuItemSpec[]): void
  /** Subscribe to commands triggered from the native menu. Returns an unsubscribe function. */
  onCommand(listener: (command: string) => void): () => void
  /** Show an open dialog and read the selected text file. Resolves null if cancelled. */
  openTextFile(filters: FileFilter[]): Promise<OpenFileResult | null>
  /** Read a text file by path (used for recent files). */
  readTextFile(path: string): Promise<string>
  /** Show a save dialog. Resolves the chosen path or null if cancelled. */
  chooseSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null>
  writeTextFile(path: string, content: string): Promise<void>
  /** Write binary data (e.g. PNG export) given as base64. */
  writeBinaryFile(path: string, base64: string): Promise<void>
  /** Ask the user a question with buttons; resolves the clicked button index. */
  showMessageBox(options: { message: string; detail?: string; buttons: string[]; type?: 'none' | 'info' | 'warning' | 'question' }): Promise<number>
  /** Tell the main process whether the project has unsaved changes. */
  setDirty(dirty: boolean, title: string): void
  /** Subscribe to the window close request; the renderer must call confirmClose when ready. */
  onCloseRequested(listener: () => void): () => void
  confirmClose(): void
}

export const IpcChannels = {
  setMenu: 'openuml:set-menu',
  command: 'openuml:command',
  openTextFile: 'openuml:open-text-file',
  readTextFile: 'openuml:read-text-file',
  chooseSavePath: 'openuml:choose-save-path',
  writeTextFile: 'openuml:write-text-file',
  writeBinaryFile: 'openuml:write-binary-file',
  showMessageBox: 'openuml:show-message-box',
  setDirty: 'openuml:set-dirty',
  closeRequested: 'openuml:close-requested',
  confirmClose: 'openuml:confirm-close'
} as const
