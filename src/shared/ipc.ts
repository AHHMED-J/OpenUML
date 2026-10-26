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

/** Version and build information of the running application. */
export interface AppInfo {
  version: string
}

/** Result of asking GitHub for the latest release (`checkForUpdates`). */
export interface UpdateCheckResult {
  /** Running version. */
  current: string
  /** Latest published version (`X.Y.Z`), null when GitHub listed no usable release. */
  latest: string | null
  /** Release page of `latest`. */
  url: string | null
  /** True when `latest` is newer than `current`. */
  available: boolean
}

/** Unsaved work kept by the main process for recovery after a crash (see `saveRecovery`). */
export interface RecoverySnapshot {
  /** Project text (`.mdj`). */
  text: string
  /** File the project belongs to, null when untitled. */
  filePath: string | null
  /** Project name, for the recovery prompt. */
  name: string
  /** When the snapshot was taken (ms since epoch). */
  savedAt: number
}

/** One page of an exported PDF: a standalone SVG drawn to fill a page of the given CSS-pixel size. */
export interface PdfPage {
  svg: string
  width: number
  height: number
}

/** Native editing actions forwarded to the focused text field (see `nativeEdit`). */
export type NativeEditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'delete'

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
  /** Runs a native editing action on the focused web contents (text fields). */
  nativeEdit(action: NativeEditAction): void
  /** Show a folder picker. Resolves the chosen folder or null if cancelled. */
  chooseFolder(title: string): Promise<string | null>
  /** Opens an https URL in the OS browser. Other schemes are ignored. */
  openExternal(url: string): void
  /** Shows a `.mdj` file in the OS file manager (Finder, Explorer), selected in its folder. */
  showItemInFolder(path: string): void
  /** Adds a path to the OS recent-documents list. */
  addRecentDocument(path: string): void
  /** The `.mdj` file passed on the command line or by the OS at launch (once), else null. */
  takeStartupFile(): Promise<string | null>
  /** Subscribe to files the OS asks to open while running (macOS open-file). */
  onOpenFile(listener: (path: string) => void): () => void
  /** Version of the running application. */
  getAppInfo(): Promise<AppInfo>
  /** Asks GitHub for the latest published release (a network request). */
  checkForUpdates(): Promise<UpdateCheckResult>
  /** Keeps a copy of unsaved work outside the project file, for recovery after a crash. */
  saveRecovery(snapshot: RecoverySnapshot): Promise<void>
  /** The unsaved work kept by `saveRecovery` (left in place until `clearRecovery`), else null. */
  readRecovery(): Promise<RecoverySnapshot | null>
  /** Forgets the unsaved work kept by `saveRecovery` (it was saved or discarded). */
  clearRecovery(): Promise<void>
  /** Writes `pages` as a PDF to `path` (a path from `chooseSavePath`). */
  writePdf(path: string, pages: PdfPage[]): Promise<void>
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
  confirmClose: 'openuml:confirm-close',
  nativeEdit: 'openuml:native-edit',
  chooseFolder: 'openuml:choose-folder',
  openExternal: 'openuml:open-external',
  showItemInFolder: 'openuml:show-item-in-folder',
  addRecentDocument: 'openuml:add-recent-document',
  takeStartupFile: 'openuml:take-startup-file',
  openFile: 'openuml:open-file',
  getAppInfo: 'openuml:get-app-info',
  checkForUpdates: 'openuml:check-for-updates',
  saveRecovery: 'openuml:save-recovery',
  readRecovery: 'openuml:read-recovery',
  clearRecovery: 'openuml:clear-recovery',
  writePdf: 'openuml:write-pdf'
} as const
