/**
 * The real browser behind the web bridge: file pickers (File System Access API where the browser
 * has it), file uploads and downloads, clipboard editing and links.
 */
import type { FileFilter, NativeEditAction } from '../shared/ipc'
import { askFileName } from './dialog'
import { mimeType, type BrowserFileAccess, type DirectoryHandleLike, type FileHandleLike } from './files'

interface PickerType {
  description: string
  accept: Record<string, string[]>
}

/** The File System Access API (Chrome, Edge); absent in Firefox and Safari. */
interface FileSystemAccessWindow {
  showOpenFilePicker?(options: { types: PickerType[]; multiple: boolean; excludeAcceptAllOption?: boolean }): Promise<FileHandleLike[]>
  showSaveFilePicker?(options: { suggestedName: string; types: PickerType[] }): Promise<FileHandleLike>
  showDirectoryPicker?(options: { mode: 'readwrite' }): Promise<DirectoryHandleLike>
}

function pickerTypes(filters: FileFilter[]): PickerType[] {
  return filters.map((f) => ({
    description: f.name,
    accept: { [mimeType(`x.${f.extensions[0] ?? ''}`)]: f.extensions.map((e) => `.${e}`) }
  }))
}

/** Null when the person closed the picker (an `AbortError`), the error otherwise. */
async function unlessCancelled<T>(pick: () => Promise<T>): Promise<T | null> {
  try {
    return await pick()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

function uploadFile(filters: FileFilter[]): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
    input.style.display = 'none'
    const done = (): void => input.remove()
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      done()
      if (!file) return resolve(null)
      file.text().then((text) => resolve({ name: file.name, text }), reject)
    })
    input.addEventListener('cancel', () => {
      done()
      resolve(null)
    })
    document.body.append(input)
    input.click()
  })
}

function download(name: string, data: Blob): void {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  // Long enough for the browser to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function browserFileAccess(win: Window & FileSystemAccessWindow = window): BrowserFileAccess {
  const access: BrowserFileAccess = { uploadFile, askFileName, download }
  const open = win.showOpenFilePicker?.bind(win)
  const save = win.showSaveFilePicker?.bind(win)
  const folder = win.showDirectoryPicker?.bind(win)
  if (open && save) {
    access.openFilePicker = async (filters) =>
      (await unlessCancelled(() => open({ types: pickerTypes(filters), multiple: false, excludeAcceptAllOption: false })))?.[0] ?? null
    access.saveFilePicker = (suggestedName, filters) => unlessCancelled(() => save({ suggestedName, types: pickerTypes(filters) }))
  }
  if (folder) access.directoryPicker = () => unlessCancelled(() => folder({ mode: 'readwrite' }))
  return access
}

/** Editing actions on the focused text field (the desktop runs them natively). */
export function editFocusedText(action: NativeEditAction): void {
  switch (action) {
    case 'paste':
      // Reading the clipboard needs the browser's permission; a refusal leaves the field as it is.
      void navigator.clipboard
        ?.readText()
        .then((text) => document.execCommand('insertText', false, text))
        .catch(() => undefined)
      return
    case 'selectAll':
      document.execCommand('selectAll')
      return
    default:
      document.execCommand(action)
  }
}
