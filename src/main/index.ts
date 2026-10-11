import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannels, type FileFilter, type MenuItemSpec } from '../shared/ipc'

let mainWindow: BrowserWindow | null = null
let isDirty = false
let closeConfirmed = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'OpenUML',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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

function registerIpc(): void {
  ipcMain.on(IpcChannels.setMenu, (_event, menu: MenuItemSpec[]) => {
    Menu.setApplicationMenu(Menu.buildFromTemplate(toMenuTemplate(menu)))
  })

  ipcMain.handle(IpcChannels.openTextFile, async (_event, filters: FileFilter[]) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    return { path, content: await readFile(path, 'utf8') }
  })

  ipcMain.handle(IpcChannels.readTextFile, (_event, path: string) => readFile(path, 'utf8'))

  ipcMain.handle(IpcChannels.chooseSavePath, async (_event, defaultName: string, filters: FileFilter[]) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters })
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle(IpcChannels.writeTextFile, (_event, path: string, content: string) => writeFile(path, content, 'utf8'))

  ipcMain.handle(IpcChannels.writeBinaryFile, (_event, path: string, base64: string) =>
    writeFile(path, Buffer.from(base64, 'base64'))
  )

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
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
