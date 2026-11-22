import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, browserKeymap } from '../renderer/src/ui/menus/keymaps'
import { Cmd } from '../renderer/src/ui/menus/commandIds'
import { base64ToBytes, browserPlatform, createWebBridge } from './bridge'
import { cancelIndex } from './dialog'
import { WebFiles, type BrowserFileAccess, type DirectoryHandleLike, type FileHandleLike } from './files'
import { deflate, pdfDocument } from './pdf'
import { memoryStore, type KeyValueStore } from './store'

const MDJ = [{ name: 'Models', extensions: ['mdj'] }]

/** A file on a fake disk, with the File System Access handle methods the app uses. */
function fakeFile(name: string, text = ''): FileHandleLike & { text: string } {
  const file = {
    name,
    text,
    getFile: async () => ({ text: async () => file.text }),
    createWritable: async () => {
      let next = ''
      return {
        write: async (data: Blob | string) => void (next = typeof data === 'string' ? data : await data.text()),
        close: async () => void (file.text = next)
      }
    },
    isSameEntry: async (other: FileHandleLike) => other === file
  }
  return file
}

function fakeFolder(name = 'exports'): DirectoryHandleLike & { files: Map<string, string> } {
  const files = new Map<string, string>()
  const folder = (prefix: string): DirectoryHandleLike => ({
    name,
    getDirectoryHandle: async (sub) => folder(`${prefix}${sub}/`),
    getFileHandle: async (fileName) => {
      const f = fakeFile(fileName)
      const writable = f.createWritable.bind(f)
      f.createWritable = async () => {
        const w = await writable()
        return { write: w.write, close: async () => (await w.close(), void files.set(prefix + fileName, f.text)) }
      }
      return f
    }
  })
  return Object.assign(folder(''), { files })
}

interface Recorder {
  downloads: Array<{ name: string; text: string }>
  asked: string[]
}

/** Browser without the File System Access API (Firefox, Safari). */
function plainBrowser(upload: { name: string; text: string } | null, answer: string | null = 'Saved.mdj'): BrowserFileAccess & Recorder {
  const downloads: Recorder['downloads'] = []
  const asked: string[] = []
  return {
    downloads,
    asked,
    uploadFile: async () => upload,
    askFileName: async (name) => (asked.push(name), answer),
    download: (name, data) => void data.text().then((text) => downloads.push({ name, text }))
  }
}

/** Chrome or Edge: pickers return the given handles. */
function fsaBrowser(open: FileHandleLike | null, save: FileHandleLike | null, folder: DirectoryHandleLike | null = null): BrowserFileAccess & Recorder {
  return { ...plainBrowser(null), openFilePicker: async () => open, saveFilePicker: async () => save, directoryPicker: async () => folder }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('web files with the File System Access API (Chrome, Edge)', () => {
  it('opens, saves in place and reopens the same file after a reload', async () => {
    const store = memoryStore()
    const disk = fakeFile('Order.mdj', '{"v":1}')
    const files = new WebFiles(fsaBrowser(disk, null), store)
    const opened = await files.openTextFile(MDJ)
    expect(opened?.content).toBe('{"v":1}')
    expect(opened?.path).toMatch(/^file\/[a-z0-9]+\/Order\.mdj$/)
    const path = opened?.path as string
    expect(files.writesInPlace(path)).toBe(true)
    await files.write(path, '{"v":2}')
    expect(disk.text).toBe('{"v":2}')
    // A new visit (new WebFiles) finds the handle in the store: Open Recent works.
    expect(await new WebFiles(fsaBrowser(null, null), store).readTextFile(path)).toBe('{"v":2}')
  })

  it('keeps one id per file, however often it is opened', async () => {
    const store = memoryStore()
    const disk = fakeFile('A.mdj', 'a')
    const first = await new WebFiles(fsaBrowser(disk, null), store).openTextFile(MDJ)
    const again = await new WebFiles(fsaBrowser(disk, null), store).openTextFile(MDJ)
    expect(again?.path).toBe(first?.path)
  })

  it('saves as through the save picker, and a closed picker cancels', async () => {
    const target = fakeFile('New.mdj')
    const files = new WebFiles(fsaBrowser(null, target), memoryStore())
    const path = await files.chooseSavePath('Untitled.mdj', MDJ)
    await files.write(path as string, 'text')
    expect(target.text).toBe('text')
    expect(await new WebFiles(fsaBrowser(null, null), memoryStore()).chooseSavePath('x.mdj', MDJ)).toBeNull()
  })

  it('exports into a picked folder, creating its subfolder', async () => {
    const folder = fakeFolder()
    const files = new WebFiles(fsaBrowser(null, null, folder), memoryStore())
    const root = await files.chooseFolder()
    await files.write(`${root}/png/Main_0.png`, new Blob(['png']))
    await files.write(`${root}\\svg\\Main_0.svg`, '<svg/>')
    expect([...folder.files.keys()].sort()).toEqual(['png/Main_0.png', 'svg/Main_0.svg'])
  })

  it('says when a remembered file is gone', async () => {
    await expect(new WebFiles(fsaBrowser(null, null), memoryStore()).readTextFile('file/missing/A.mdj')).rejects.toThrow()
  })
})

describe('web files without the API (Firefox, Safari)', () => {
  it('opens an uploaded file and keeps a copy, so Open Recent works after a reload', async () => {
    const store = memoryStore()
    const files = new WebFiles(plainBrowser({ name: 'Shop.mdj', text: 'v1' }), store)
    const opened = await files.openTextFile(MDJ)
    expect(opened).toEqual({ path: 'copy/Shop.mdj', content: 'v1' })
    expect(files.writesInPlace('copy/Shop.mdj')).toBe(false)
    expect(await new WebFiles(plainBrowser(null), store).readTextFile('copy/Shop.mdj')).toBe('v1')
  })

  it('saves as a download under the name asked for, and remembers that text', async () => {
    const store = memoryStore()
    const browser = plainBrowser(null, 'Order System.mdj')
    const files = new WebFiles(browser, store)
    const path = await files.chooseSavePath('Untitled.mdj', MDJ)
    expect(browser.asked).toEqual(['Untitled.mdj'])
    expect(path).toBe('copy/Order System.mdj')
    await files.write(path as string, 'saved')
    await flush()
    expect(browser.downloads).toEqual([{ name: 'Order System.mdj', text: 'saved' }])
    expect(await files.readTextFile('copy/Order System.mdj')).toBe('saved')
  })

  it('cancels Save As when no name is given', async () => {
    expect(await new WebFiles(plainBrowser(null, null), memoryStore()).chooseSavePath('a.mdj', MDJ)).toBeNull()
    expect(await new WebFiles(plainBrowser(null, '  '), memoryStore()).chooseSavePath('a.mdj', MDJ)).toBeNull()
  })

  it('exports every diagram as downloads', async () => {
    const browser = plainBrowser(null)
    const files = new WebFiles(browser, memoryStore())
    const root = await files.chooseFolder()
    await files.write(`${root}/svg/A_0.svg`, '<svg/>')
    await flush()
    expect(browser.downloads).toEqual([{ name: 'A_0.svg', text: '<svg/>' }])
  })

  it('keeps at most 30 copies, dropping the least recently used', async () => {
    const store = memoryStore()
    const files = new WebFiles(plainBrowser(null), store)
    for (let i = 0; i < 32; i++) await files.write(`copy/F${i}.mdj`, String(i))
    const copies = (await store.keys()).filter((k) => k.startsWith('copy:'))
    expect(copies).toHaveLength(30)
    expect(copies).not.toContain('copy:F0.mdj')
    expect(copies).toContain('copy:F31.mdj')
  })
})

function bridgeWith(store: KeyValueStore = memoryStore()) {
  const titles: string[] = []
  const opened: string[] = []
  const bridge = createWebBridge({
    version: '0.2.0',
    platform: 'linux',
    files: new WebFiles(plainBrowser(null), store),
    store,
    showMessageBox: async () => 0,
    makePdf: async () => new Blob(['%PDF']),
    edit: () => undefined,
    openUrl: (url) => void opened.push(url),
    setTitle: (title) => void titles.push(title)
  })
  return { bridge, titles, opened }
}

describe('web bridge', () => {
  it('keeps the recovery copy across visits and forgets it when cleared', async () => {
    const store = memoryStore()
    const snapshot = { text: '{}', filePath: null, name: 'Untitled', savedAt: 1 }
    await bridgeWith(store).bridge.saveRecovery(snapshot)
    const next = bridgeWith(store).bridge
    expect(await next.readRecovery()).toEqual(snapshot)
    await next.clearRecovery()
    expect(await next.readRecovery()).toBeNull()
  })

  it('tracks unsaved changes for leaving the page, and sets the tab title', () => {
    const { bridge, titles } = bridgeWith()
    expect(bridge.web).toBe(true)
    expect(bridge.dirty).toBe(false)
    bridge.setDirty(true, 'OpenUML — a.mdj •')
    expect(bridge.dirty).toBe(true)
    expect(titles).toEqual(['OpenUML — a.mdj •'])
  })

  it('opens only https links, never offers an update, and saves downloads only on request', async () => {
    const { bridge, opened } = bridgeWith()
    bridge.openExternal('https://github.com/AHHMED-J/OpenUML')
    bridge.openExternal('javascript:alert(1)')
    expect(opened).toEqual(['https://github.com/AHHMED-J/OpenUML'])
    expect((await bridge.checkForUpdates()).available).toBe(false)
    expect(bridge.savesInPlace?.('copy/a.mdj')).toBe(false)
    expect(bridge.savesInPlace?.('file/x/a.mdj')).toBe(true)
  })

  it('names the platform from the browser and decodes binary exports', () => {
    expect(browserPlatform({ userAgentData: { platform: 'macOS' } })).toBe('darwin')
    expect(browserPlatform({ platform: 'Win32' })).toBe('win32')
    expect(browserPlatform({ platform: 'Linux x86_64' })).toBe('linux')
    expect([...base64ToBytes(btoa('PNG'))]).toEqual([80, 78, 71])
  })

  it('answers Esc with the Cancel or No button, else the first', () => {
    expect(cancelIndex(['Save', "Don't Save", 'Cancel'])).toBe(2)
    expect(cancelIndex(['Yes', 'No'])).toBe(1)
    expect(cancelIndex(['Recover', 'Discard'])).toBe(0)
  })
})

describe('browser shortcuts', () => {
  it('moves the keys a browser keeps for itself, and nothing else', () => {
    const web = browserKeymap(DEFAULT_KEYMAP)
    const key = (command: string): string[] => web.filter((b) => b.command === command).map((b) => b.key)
    expect(key(Cmd.fileNew)).toEqual(['cmdctrl-alt-n'])
    expect(key(Cmd.formatWordWrap)).toEqual(['cmdctrl-alt-shift-w'])
    expect(key(Cmd.formatSuppressLiterals)).toEqual(['cmdctrl-alt-shift-t'])
    expect(key(Cmd.viewCloseOtherDiagrams)).toEqual(['alt-shift-f4'])
    for (const reserved of ['cmdctrl-n', 'cmdctrl-shift-w', 'cmdctrl-shift-t', 'cmdctrl-f4']) {
      expect(web.some((b) => b.key === reserved)).toBe(false)
    }
    expect(web.filter((b, i) => b.key !== DEFAULT_KEYMAP[i]?.key)).toHaveLength(4)
  })
})

describe('PDF export in the browser', () => {
  it('writes one full-page image per page, sized like the desktop PDF, with a valid cross-reference table', async () => {
    const pixels = new Uint8Array(2 * 1 * 3).fill(255)
    const data = await deflate(pixels)
    const bytes = pdfDocument([
      { width: 300, height: 150, pixelWidth: 2, pixelHeight: 1, data },
      { width: 75, height: 75, pixelWidth: 2, pixelHeight: 1, data }
    ])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 2')
    expect(text).toContain('/MediaBox [0 0 300 150]')
    expect(text).toContain('/Filter /FlateDecode')
    // Every xref offset points at its object.
    const xref = text.slice(text.lastIndexOf('\nxref\n'))
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(8)
    offsets.forEach((offset, i) => expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
    expect(text).toContain(`startxref\n${text.lastIndexOf('\nxref\n') + 1}`)
    // The image data inflates back to the pixels.
    const inflated = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
    expect([...inflated]).toEqual([...pixels])
  })
})
