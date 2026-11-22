/**
 * Entry of the web build (openuml.org/app): installs the browser version of `window.openuml`,
 * then starts the same renderer the desktop app runs. Everything stays in the browser: files are
 * read and written through the browser, unsaved work is kept in its storage, nothing is uploaded.
 */
import { browserFileAccess, editFocusedText } from './browser'
import { browserPlatform, createWebBridge } from './bridge'
import { showMessageBox } from './dialog'
import { WebFiles } from './files'
import { indexedDbStore, memoryStore } from './store'
import './web.css'

const store = typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore('openuml')
const bridge = createWebBridge({
  version: __OPENUML_VERSION__,
  platform: browserPlatform(navigator as Navigator & { userAgentData?: { platform?: string } }),
  files: new WebFiles(browserFileAccess(), store),
  store,
  showMessageBox,
  makePdf: async (pages) => (await import('./pdf')).makePdf(pages),
  edit: editFocusedText,
  openUrl: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
  setTitle: (title) => (document.title = title)
})
window.openuml = bridge

// Closing or reloading the tab with unsaved changes asks first (the browser shows its own prompt).
window.addEventListener('beforeunload', (e) => {
  if (!bridge.dirty) return
  e.preventDefault()
  e.returnValue = ''
})

// Imported only now: the renderer reads `window.openuml` when it loads.
void import('../renderer/src/main')
