import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type OpenUmlBridge } from '../shared/ipc'

function subscribe<T extends unknown[]>(channel: string, listener: (...args: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => listener(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const bridge: OpenUmlBridge = {
  platform: process.platform,
  setMenu: (menu) => ipcRenderer.send(IpcChannels.setMenu, menu),
  onCommand: (listener) => subscribe<[string]>(IpcChannels.command, listener),
  openTextFile: (filters) => ipcRenderer.invoke(IpcChannels.openTextFile, filters),
  readTextFile: (path) => ipcRenderer.invoke(IpcChannels.readTextFile, path),
  chooseSavePath: (defaultName, filters) => ipcRenderer.invoke(IpcChannels.chooseSavePath, defaultName, filters),
  writeTextFile: (path, content) => ipcRenderer.invoke(IpcChannels.writeTextFile, path, content),
  writeBinaryFile: (path, base64) => ipcRenderer.invoke(IpcChannels.writeBinaryFile, path, base64),
  showMessageBox: (options) => ipcRenderer.invoke(IpcChannels.showMessageBox, options),
  setDirty: (dirty, title) => ipcRenderer.send(IpcChannels.setDirty, dirty, title),
  onCloseRequested: (listener) => subscribe<[]>(IpcChannels.closeRequested, listener),
  confirmClose: () => ipcRenderer.send(IpcChannels.confirmClose)
}

contextBridge.exposeInMainWorld('openuml', bridge)
