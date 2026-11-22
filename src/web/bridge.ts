/**
 * `window.openuml` for the web build: the same contract as the desktop preload bridge
 * (`src/shared/ipc.ts`), done with browser APIs. Files go through `WebFiles`, the recovery copy is
 * kept in IndexedDB, message boxes are the page's own dialogs. There is no native menu (the page
 * draws its menu bar), no OS file manager and no update check (the page is always the latest).
 */
import type { NativeEditAction, OpenUmlBridge, PdfPage, RecoverySnapshot } from '../shared/ipc'
import type { WebFiles } from './files'
import type { KeyValueStore } from './store'

export interface WebBridgeEnv {
  readonly version: string
  readonly platform: NodeJS.Platform
  readonly files: WebFiles
  readonly store: KeyValueStore
  showMessageBox: OpenUmlBridge['showMessageBox']
  /** Builds a PDF of `pages` (loaded on first use). */
  makePdf(pages: PdfPage[]): Promise<Blob>
  /** Runs an editing action on the focused text field. */
  edit(action: NativeEditAction): void
  openUrl(url: string): void
  setTitle(title: string): void
}

/** The browser's platform, as Node names it (macOS, Windows, else Linux). */
export function browserPlatform(nav: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } }): NodeJS.Platform {
  const p = (nav.userAgentData?.platform || nav.platform || nav.userAgent || '').toLowerCase()
  if (p.includes('mac') || p.includes('iphone') || p.includes('ipad')) return 'darwin'
  if (p.includes('win')) return 'win32'
  return 'linux'
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const RECOVERY_KEY = 'recovery'

export interface WebBridge extends OpenUmlBridge {
  /** True while the project has unsaved changes (leaving the page then asks first). */
  readonly dirty: boolean
}

export function createWebBridge(env: WebBridgeEnv): WebBridge {
  let dirty = false
  const noop = (): (() => void) => () => undefined
  return {
    web: true,
    platform: env.platform,
    get dirty() {
      return dirty
    },
    setMenu: () => undefined,
    onCommand: noop,
    openTextFile: (filters) => env.files.openTextFile(filters),
    readTextFile: (path) => env.files.readTextFile(path),
    chooseSavePath: (defaultName, filters) => env.files.chooseSavePath(defaultName, filters),
    writeTextFile: (path, content) => env.files.write(path, content),
    writeBinaryFile: (path, base64) => env.files.write(path, new Blob([base64ToBytes(base64)])),
    showMessageBox: (options) => env.showMessageBox(options),
    setDirty: (value, title) => {
      dirty = value
      env.setTitle(title)
    },
    // A browser tab closes without asking the page: `beforeunload` covers unsaved changes instead.
    onCloseRequested: noop,
    confirmClose: () => undefined,
    nativeEdit: (action) => env.edit(action),
    chooseFolder: () => env.files.chooseFolder(),
    openExternal: (url) => {
      if (/^https:\/\//i.test(url)) env.openUrl(url)
    },
    showItemInFolder: () => undefined,
    addRecentDocument: () => undefined,
    takeStartupFile: async () => null,
    onOpenFile: noop,
    getAppInfo: async () => ({ version: env.version }),
    checkForUpdates: async () => ({ current: env.version, latest: env.version, url: null, available: false }),
    saveRecovery: (snapshot) => env.store.set(RECOVERY_KEY, snapshot),
    readRecovery: async () => (await env.store.get<RecoverySnapshot>(RECOVERY_KEY)) ?? null,
    clearRecovery: () => env.store.delete(RECOVERY_KEY),
    writePdf: async (path, pages) => env.files.write(path, await env.makePdf(pages)),
    savesInPlace: (path) => env.files.writesInPlace(path),
    forgetRecentFiles: () => env.files.forgetAll()
  }
}
