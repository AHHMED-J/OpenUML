import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainEvent, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IpcChannels, type MenuItemSpec } from '../shared/ipc'
import { FileAccess, readProjectFile, writeFileAtomic } from './fileAccess'
import {
  allowedExternalUrl,
  findFileArgument,
  isAbsolutePath,
  isProjectPath,
  sanitizeFilters,
  sanitizeMenu,
  sanitizeMessageBox,
  sanitizeTitle
} from './ipcValidation'
import appIcon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let isDirty = false
let closeConfirmed = false
/** File to open at launch (command line or macOS open-file before the renderer asked). */
let startupFile: string | null = findFileArgument(process.argv, process.cwd())
/** Set once the renderer has asked for the startup file; later open-file events are forwarded. */
let rendererReady = false
/** Paths the renderer may read and write (see `FileAccess`). */
const fileAccess = new FileAccess()

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const rendererRoot = join(__dirname, '../renderer')

const rendererEntry = join(rendererRoot, 'index.html')

/** Opens `path` in the running window (asking about unsaved changes), or at launch if not ready yet. */
function openFile(path: string): void {
  if (!isProjectPath(path)) return
  if (rendererReady && mainWindow) mainWindow.webContents.send(IpcChannels.openFile, path)
  else startupFile = path
}

// macOS delivers files opened from Finder/Dock through this event, possibly before `ready`.
app.on('open-file', (event, path) => {
  event.preventDefault()
  openFile(path)
})

/** True for URLs of the app's own pages (the packaged origin or the development server). */
function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return parsed.pathname === pathToFileURL(rendererEntry).pathname
    return devServerUrl !== undefined && parsed.origin === new URL(devServerUrl).origin
  } catch {
    return false
  }
}

function createWindow(): void {
  closeConfirmed = false
  isDirty = false
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'OpenUML',
    show: false,
    // macOS and Windows take the icon from the application bundle; Linux needs it on the window.
    ...(process.platform === 'linux' ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => window.show())

  window.on('close', (event) => {
    if (isDirty && !closeConfirmed) {
      event.preventDefault()
      window.webContents.send(IpcChannels.closeRequested)
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      rendererReady = false
    }
  })

  // Never navigate away from the app or open arbitrary windows.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  if (devServerUrl) void window.loadURL(devServerUrl)
  else void window.loadFile(rendererEntry)
}

function toMenuTemplate(items: MenuItemSpec[]): MenuItemConstructorOptions[] {
  return items.map((item) => {
    const options: MenuItemConstructorOptions = {
      label: item.label,
      accelerator: item.accelerator,
      enabled: item.enabled ?? true,
      checked: item.checked,
      type: item.type === 'submenu' ? undefined : item.type
    }
    if (item.role) options.role = item.role as MenuItemConstructorOptions['role']
    if (item.submenu) options.submenu = toMenuTemplate(item.submenu)
    if (item.command) {
      const command = item.command
      options.click = () => mainWindow?.webContents.send(IpcChannels.command, command)
    }
    return options
  })
}

/** Development-only menu (never shown in packaged builds). */
function debugMenu(): MenuItemConstructorOptions {
  return {
    label: 'Debug',
    submenu: [
      { label: 'Show DevTools', role: 'toggleDevTools', accelerator: 'Shift+Alt+T' },
      { label: 'Reload', role: 'reload' }
    ]
  }
}

function denied(path: unknown): Error {
  return new Error(`Access to ${typeof path === 'string' ? path.slice(0, 300) : 'this path'} is not allowed`)
}

/** Only the app's own top-level page in the main window may use the IPC channels. */
function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return (
    mainWindow !== null &&
    event.sender === mainWindow.webContents &&
    frame !== null &&
    frame === event.sender.mainFrame &&
    isAppUrl(frame.url)
  )
}

function handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender')
    return listener(event, ...args)
  })
}

function on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    if (isTrustedSender(event)) listener(event, ...args)
  })
}

function registerIpc(): void {
  on(IpcChannels.setMenu, (_event, menu) => {
    const template = toMenuTemplate(sanitizeMenu(menu))
    if (!app.isPackaged) template.push(debugMenu())
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  })

  handle(IpcChannels.openTextFile, async (_event, filters) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: sanitizeFilters(filters) })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    // The user picked this file, so a symbolic link to any file name is followed.
    const content = await readProjectFile(path, false)
    fileAccess.grantFile(path)
    return { path, content }
  })

  handle(IpcChannels.readTextFile, async (_event, path) => {
    if (!fileAccess.canRead(path)) throw denied(path)
    const content = await readProjectFile(path, true)
    // A project opened by path (recent files, the OS) may be saved back in place.
    fileAccess.grantFile(path)
    return content
  })

  handle(IpcChannels.chooseSavePath, async (_event, defaultName, rawFilters) => {
    if (!mainWindow) return null
    const filters = sanitizeFilters(rawFilters)
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: typeof defaultName === 'string' ? defaultName.slice(0, 1000) : undefined,
      filters
    })
    if (result.canceled || !result.filePath) return null
    // The renderer appends the extension when the user typed none.
    fileAccess.grantFile(
      result.filePath,
      filters.flatMap((f) => f.extensions)
    )
    return result.filePath
  })

  handle(IpcChannels.chooseFolder, async (_event, title) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: sanitizeTitle(title, 'Choose a folder'),
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    fileAccess.grantFolder(path)
    return path
  })

  handle(IpcChannels.writeTextFile, async (_event, path, content) => {
    if (typeof content !== 'string' || !(await fileAccess.canWriteResolved(path))) throw denied(path)
    return writeFileAtomic(path as string, content)
  })

  handle(IpcChannels.writeBinaryFile, async (_event, path, base64) => {
    if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw denied(path)
    if (!(await fileAccess.canWriteResolved(path))) throw denied(path)
    return writeFileAtomic(path as string, Buffer.from(base64, 'base64'))
  })

  handle(IpcChannels.showMessageBox, async (_event, rawOptions) => {
    const options = sanitizeMessageBox(rawOptions)
    if (!mainWindow || !options) return 0
    const result = await dialog.showMessageBox(mainWindow, { ...options, title: 'OpenUML' })
    return result.response
  })

  on(IpcChannels.setDirty, (_event, dirty, title) => {
    isDirty = dirty === true
    mainWindow?.setTitle(sanitizeTitle(title))
    mainWindow?.setDocumentEdited(isDirty)
  })

  on(IpcChannels.confirmClose, () => {
    closeConfirmed = true
    mainWindow?.close()
  })

  on(IpcChannels.nativeEdit, (event, action) => {
    const contents = event.sender
    switch (action) {
      case 'undo':
        return contents.undo()
      case 'redo':
        return contents.redo()
      case 'cut':
        return contents.cut()
      case 'copy':
        return contents.copy()
      case 'paste':
        return contents.paste()
      case 'selectAll':
        return contents.selectAll()
      case 'delete':
        return contents.delete()
    }
  })

  on(IpcChannels.openExternal, (_event, url) => {
    const allowed = allowedExternalUrl(url)
    if (allowed) void shell.openExternal(allowed)
  })

  on(IpcChannels.addRecentDocument, (_event, path) => {
    if (isProjectPath(path)) app.addRecentDocument(path)
  })

  handle(IpcChannels.takeStartupFile, () => {
    rendererReady = true
    const path = startupFile
    startupFile = null
    return isAbsolutePath(path) ? path : null
  })
}

// One running application: opening a .mdj file from the OS while it runs (Windows, Linux) starts
// a second process, which hands the file to this one and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const file = findFileArgument(argv, typeof workingDirectory === 'string' && workingDirectory ? workingDirectory : process.cwd())
    if (file) openFile(file)
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
