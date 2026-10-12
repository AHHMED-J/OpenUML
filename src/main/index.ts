import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { IpcChannels, type FileFilter, type MenuItemSpec, type NativeEditAction } from '../shared/ipc'
import { FileAccess, writeFileAtomic } from './fileAccess'
import appIcon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let isDirty = false
let closeConfirmed = false
/** File to open at launch (command line or macOS open-file before the renderer asked). */
let startupFile: string | null = findFileArgument(process.argv)
/** Set once the renderer has asked for the startup file; later open-file events are forwarded. */
let rendererReady = false
/** Paths the renderer may read and write (see `FileAccess`). */
const fileAccess = new FileAccess()

function findFileArgument(argv: readonly string[]): string | null {
  // Skip the executable (and, in development, the app path).
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('-') && extname(arg).toLowerCase() === '.mdj') return resolve(arg)
  }
  return null
}

/** Opens `path` in the running window (asking about unsaved changes), or at launch if not ready yet. */
function openFile(path: string): void {
  if (rendererReady && mainWindow) mainWindow.webContents.send(IpcChannels.openFile, path)
  else startupFile = path
}

// macOS delivers files opened from Finder/Dock through this event, possibly before `ready`.
app.on('open-file', (event, path) => {
  event.preventDefault()
  openFile(path)
})

function createWindow(): void {
  closeConfirmed = false
  isDirty = false
  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (event) => {
    if (isDirty && !closeConfirmed) {
      event.preventDefault()
      mainWindow?.webContents.send(IpcChannels.closeRequested)
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
  })

  // Never navigate away from the app or open arbitrary windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  return new Error(`Access to ${typeof path === 'string' ? path : 'this path'} is not allowed`)
}

function registerIpc(): void {
  ipcMain.on(IpcChannels.setMenu, (_event, menu: MenuItemSpec[]) => {
    const template = toMenuTemplate(menu)
    if (!app.isPackaged) template.push(debugMenu())
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  })

  ipcMain.handle(IpcChannels.openTextFile, async (_event, filters: FileFilter[]) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const content = await readFile(path, 'utf8')
    fileAccess.grantFile(path)
    return { path, content }
  })

  ipcMain.handle(IpcChannels.readTextFile, async (_event, path: unknown) => {
    if (!fileAccess.canRead(path)) throw denied(path)
    const content = await readFile(path, 'utf8')
    // A project opened by path (recent files, the OS) may be saved back in place.
    fileAccess.grantFile(path)
    return content
  })

  ipcMain.handle(IpcChannels.chooseSavePath, async (_event, defaultName: string, filters: FileFilter[]) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters })
    if (result.canceled || !result.filePath) return null
    // The renderer appends the extension when the user typed none.
    fileAccess.grantFile(result.filePath, filters.flatMap((f) => f.extensions))
    return result.filePath
  })

  ipcMain.handle(IpcChannels.chooseFolder, async (_event, title: string) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    fileAccess.grantFolder(path)
    return path
  })

  ipcMain.handle(IpcChannels.writeTextFile, (_event, path: unknown, content: unknown) => {
    if (!fileAccess.canWrite(path) || typeof content !== 'string') throw denied(path)
    return writeFileAtomic(path, content)
  })

  ipcMain.handle(IpcChannels.writeBinaryFile, (_event, path: unknown, base64: unknown) => {
    if (!fileAccess.canWrite(path) || typeof base64 !== 'string') throw denied(path)
    return writeFileAtomic(path, Buffer.from(base64, 'base64'))
  })

  ipcMain.handle(IpcChannels.showMessageBox, async (_event, options: Electron.MessageBoxOptions) => {
    if (!mainWindow) return 0
    const result = await dialog.showMessageBox(mainWindow, { ...options, title: 'OpenUML' })
    return result.response
  })

  ipcMain.on(IpcChannels.setDirty, (_event, dirty: boolean, title: string) => {
    isDirty = dirty
    mainWindow?.setTitle(title)
    mainWindow?.setDocumentEdited(dirty)
  })

  ipcMain.on(IpcChannels.confirmClose, () => {
    closeConfirmed = true
    mainWindow?.close()
  })

  ipcMain.on(IpcChannels.nativeEdit, (event, action: NativeEditAction) => {
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

  ipcMain.on(IpcChannels.openExternal, (_event, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://')) void shell.openExternal(url)
  })

  ipcMain.on(IpcChannels.addRecentDocument, (_event, path: string) => {
    if (typeof path === 'string' && path.length > 0) app.addRecentDocument(path)
  })

  ipcMain.handle(IpcChannels.takeStartupFile, () => {
    rendererReady = true
    const path = startupFile
    startupFile = null
    return path
  })
}

// One running application: opening a .mdj file from the OS while it runs (Windows, Linux) starts
// a second process, which hands the file to this one and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const file = findFileArgument(argv)
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
