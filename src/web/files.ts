/**
 * Files for the web build. The app works with paths; here a path names where the browser keeps
 * the file:
 * - `file/<id>/<name>`: a file on disk, through the File System Access API (Chrome, Edge). Open
 *   and save act on the file itself; its handle is kept, so Open Recent works after a reload.
 * - `copy/<name>`: browsers without that API (Firefox, Safari). Opening reads a picked file;
 *   saving downloads it. The browser keeps the last text of each name, so Open Recent and Save
 *   keep working on that copy.
 * - `folder/<id>/<sub>/<name>`: a file inside a folder picked with the API (exports of every
 *   diagram); `downloads/<sub>/<name>`: the same without the API, each file is a download.
 * Nothing is sent anywhere: files only move between the page, the disk and the browser storage.
 */
import type { FileFilter, OpenFileResult } from '../shared/ipc'
import type { KeyValueStore } from './store'

/** The parts of a `FileSystemFileHandle` used here. */
export interface FileHandleLike {
  readonly kind?: 'file'
  readonly name: string
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>
  isSameEntry?(other: FileHandleLike): Promise<boolean>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

/** The parts of a `FileSystemDirectoryHandle` used here. */
export interface DirectoryHandleLike {
  readonly name: string
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandleLike>
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

/** What the browser offers; the File System Access members are absent in Firefox and Safari. */
export interface BrowserFileAccess {
  openFilePicker?(filters: FileFilter[]): Promise<FileHandleLike | null>
  saveFilePicker?(suggestedName: string, filters: FileFilter[]): Promise<FileHandleLike | null>
  directoryPicker?(): Promise<DirectoryHandleLike | null>
  /** A file chosen with an `<input type="file">` (null when cancelled). */
  uploadFile(filters: FileFilter[]): Promise<{ name: string; text: string } | null>
  /** Asks for the name of a file to save as (no save dialog without the API). */
  askFileName(defaultName: string): Promise<string | null>
  download(name: string, data: Blob): void
}

interface KeptHandle {
  readonly handle: FileHandleLike
  readonly usedAt: number
}

interface KeptCopy {
  readonly text: string
  readonly usedAt: number
}

/** At most this many file handles and saved copies are kept (Open Recent shows 10). */
const MAX_KEPT = 30

const MIME: Readonly<Record<string, string>> = {
  mdj: 'application/json',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html'
}

export function mimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Splits a path into its parts (`\` from Windows-style joins counts as a separator too). */
function parts(path: string): string[] {
  return path.split(/[\\/]+/).filter((p) => p.length > 0)
}

async function ensurePermission(handle: FileHandleLike | DirectoryHandleLike, mode: 'read' | 'readwrite'): Promise<void> {
  if (!handle.queryPermission || !handle.requestPermission) return
  if ((await handle.queryPermission({ mode })) === 'granted') return
  if ((await handle.requestPermission({ mode })) === 'granted') return
  throw new Error(`The browser did not allow access to ${handle.name}.`)
}

export class WebFiles {
  /** Handles picked in this visit (stored too, so they outlive a reload). */
  private readonly handles = new Map<string, FileHandleLike>()
  private readonly folders = new Map<string, DirectoryHandleLike>()

  constructor(
    private readonly access: BrowserFileAccess,
    private readonly store: KeyValueStore
  ) {}

  /** True when files are opened and saved in place (File System Access API). */
  get savesInPlace(): boolean {
    return this.access.saveFilePicker !== undefined
  }

  /** Whether writing `path` changes the file itself (a download otherwise). */
  writesInPlace(path: string): boolean {
    const kind = parts(path)[0]
    return kind === 'file' || kind === 'folder'
  }

  async openTextFile(filters: FileFilter[]): Promise<OpenFileResult | null> {
    if (this.access.openFilePicker) {
      const handle = await this.access.openFilePicker(filters)
      if (!handle) return null
      const id = await this.keepHandle(handle)
      return { path: `file/${id}/${handle.name}`, content: await (await handle.getFile()).text() }
    }
    const file = await this.access.uploadFile(filters)
    if (!file) return null
    await this.keepCopy(file.name, file.text)
    return { path: `copy/${file.name}`, content: file.text }
  }

  async readTextFile(path: string): Promise<string> {
    const [kind, id, ...rest] = parts(path)
    if (kind === 'file' && id) {
      const handle = await this.handle(id)
      await ensurePermission(handle, 'read')
      return (await handle.getFile()).text()
    }
    if (kind === 'copy' && id) {
      const copy = await this.store.get<KeptCopy>(`copy:${[id, ...rest].join('/')}`)
      if (copy) return copy.text
    }
    throw new Error(`${path} is not available in this browser.`)
  }

  async chooseSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null> {
    if (this.access.saveFilePicker) {
      const handle = await this.access.saveFilePicker(defaultName, filters)
      if (!handle) return null
      return `file/${await this.keepHandle(handle)}/${handle.name}`
    }
    const name = (await this.access.askFileName(defaultName))?.trim()
    return name ? `copy/${parts(name).pop() ?? name}` : null
  }

  async chooseFolder(): Promise<string | null> {
    if (!this.access.directoryPicker) return 'downloads'
    const folder = await this.access.directoryPicker()
    if (!folder) return null
    const id = newId()
    this.folders.set(id, folder)
    return `folder/${id}`
  }

  async write(path: string, data: string | Blob): Promise<void> {
    const [kind, id, ...rest] = parts(path)
    const name = parts(path).pop() ?? 'file'
    const blob = typeof data === 'string' ? new Blob([data], { type: mimeType(name) }) : data
    if (kind === 'file' && id) {
      const handle = await this.handle(id)
      await ensurePermission(handle, 'readwrite')
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    }
    if (kind === 'folder' && id) {
      let folder = this.folders.get(id)
      if (!folder) throw new Error('The export folder is no longer available.')
      await ensurePermission(folder, 'readwrite')
      const fileName = rest.pop() ?? 'file'
      for (const sub of rest) folder = await folder.getDirectoryHandle(sub, { create: true })
      const handle = await folder.getFileHandle(fileName, { create: true })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    }
    if (kind === 'copy' && id) {
      const copyName = [id, ...rest].join('/')
      if (typeof data === 'string') await this.keepCopy(copyName, data)
      this.access.download(name, blob)
      return
    }
    if (kind === 'downloads') {
      this.access.download(name, blob)
      return
    }
    throw new Error(`Cannot write ${path} in this browser.`)
  }

  /**
   * Deletes the stored file handles and copies (Clear Recent), so nothing of those files stays in
   * the browser. Handles picked in this visit stay in memory: the open file can still be saved.
   */
  async forgetAll(): Promise<void> {
    for (const key of await this.store.keys()) {
      if (key.startsWith('handle:') || key.startsWith('copy:')) await this.store.delete(key)
    }
  }

  private async handle(id: string): Promise<FileHandleLike> {
    const handle = this.handles.get(id) ?? (await this.store.get<KeptHandle>(`handle:${id}`))?.handle
    if (!handle) throw new Error('This file is not available in this browser any more.')
    this.handles.set(id, handle)
    return handle
  }

  /** Keeps `handle` (reusing the id of the same file picked before) and returns its id. */
  private async keepHandle(handle: FileHandleLike): Promise<string> {
    for (const [id, known] of this.handles) if (await sameEntry(known, handle)) return this.refresh(id, handle)
    for (const key of await this.store.keys()) {
      if (!key.startsWith('handle:')) continue
      const known = (await this.store.get<KeptHandle>(key))?.handle
      if (known && (await sameEntry(known, handle))) return this.refresh(key.slice('handle:'.length), handle)
    }
    return this.refresh(newId(), handle)
  }

  private async refresh(id: string, handle: FileHandleLike): Promise<string> {
    this.handles.set(id, handle)
    await this.store.set(`handle:${id}`, { handle, usedAt: Date.now() } satisfies KeptHandle)
    await this.prune('handle:')
    return id
  }

  private async keepCopy(name: string, text: string): Promise<void> {
    await this.store.set(`copy:${name}`, { text, usedAt: Date.now() } satisfies KeptCopy)
    await this.prune('copy:')
  }

  /** Drops the least recently used entries with `prefix` beyond `MAX_KEPT`. */
  private async prune(prefix: string): Promise<void> {
    const keys = (await this.store.keys()).filter((k) => k.startsWith(prefix))
    if (keys.length <= MAX_KEPT) return
    const dated = await Promise.all(keys.map(async (k) => ({ k, t: (await this.store.get<{ usedAt?: number }>(k))?.usedAt ?? 0 })))
    dated.sort((a, b) => a.t - b.t)
    for (const { k } of dated.slice(0, keys.length - MAX_KEPT)) await this.store.delete(k)
  }
}

async function sameEntry(a: FileHandleLike, b: FileHandleLike): Promise<boolean> {
  if (a === b) return true
  try {
    return (await a.isSameEntry?.(b)) ?? false
  } catch {
    return false
  }
}
