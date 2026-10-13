import { describe, expect, it } from 'vitest'
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

describe('sanitizeMenu', () => {
  it('keeps known fields and allowed roles, drops everything else', () => {
    const menu = sanitizeMenu([
      { label: 'File', submenu: [{ label: 'Open', command: 'file.open', accelerator: 'CmdOrCtrl+O', click: 'x', enabled: 'yes' }] },
      { label: 'Quit', role: 'quit' },
      { label: 'Tools', role: 'toggleDevTools' },
      { label: 'Reload', role: 'forceReload' },
      42,
      null
    ])
    expect(menu).toEqual([
      { label: 'File', submenu: [{ label: 'Open', command: 'file.open', accelerator: 'CmdOrCtrl+O' }] },
      { label: 'Quit', role: 'quit' }
    ])
  })

  it('bounds nesting, item count and string sizes', () => {
    let deep: unknown = []
    for (let i = 0; i < 50; i++) deep = [{ label: 'x', submenu: deep }]
    let depth = 0
    for (let level = sanitizeMenu(deep); level.length > 0; level = level[0]?.submenu ?? []) depth++
    expect(depth).toBeLessThanOrEqual(9)
    expect(sanitizeMenu(Array.from({ length: 20_000 }, () => ({ label: 'a' }))).length).toBeLessThanOrEqual(5000)
    expect(sanitizeMenu([{ label: 'a'.repeat(10_000) }])[0]?.label?.length).toBe(200)
    expect(sanitizeMenu([{ accelerator: 'x'.repeat(100) }])).toEqual([{}])
    expect(sanitizeMenu('not a menu')).toEqual([])
  })
})

describe('sanitizeMessageBox', () => {
  it('passes only message, detail, buttons and type', () => {
    expect(sanitizeMessageBox({ message: 'Save?', detail: 'd', buttons: ['Yes', 'No', 3], type: 'warning', icon: '/etc/passwd', checkboxLabel: 'x' })).toEqual({
      message: 'Save?',
      detail: 'd',
      buttons: ['Yes', 'No'],
      type: 'warning'
    })
  })

  it('rejects malformed options and bounds sizes', () => {
    expect(sanitizeMessageBox(null)).toBeNull()
    expect(sanitizeMessageBox({ message: 5 })).toBeNull()
    expect(sanitizeMessageBox({ message: 'm', type: 'error' })).toEqual({ message: 'm', buttons: ['OK'] })
    const big = sanitizeMessageBox({ message: 'm'.repeat(50_000), buttons: Array.from({ length: 50 }, () => 'b') })
    expect(big?.message.length).toBe(10_000)
    expect(big?.buttons.length).toBe(8)
  })
})

describe('sanitizeFilters', () => {
  it('keeps names and alphanumeric extensions only', () => {
    expect(sanitizeFilters([{ name: 'Models', extensions: ['mdj', '../x', '*', 'p n g'] }, { name: 1 }, 'x'])).toEqual([
      { name: 'Models', extensions: ['mdj', '*'] }
    ])
    expect(sanitizeFilters(undefined)).toEqual([])
  })
})

describe('sanitizeTitle', () => {
  it('is single-line and bounded', () => {
    expect(sanitizeTitle('a\nb\0c')).toBe('a b c')
    expect(sanitizeTitle(7)).toBe('OpenUML')
    expect(sanitizeTitle('t'.repeat(1000)).length).toBe(500)
  })
})

describe('paths', () => {
  it('accepts absolute paths only', () => {
    expect(isAbsolutePath('/home/u/model.mdj')).toBe(true)
    expect(isAbsolutePath('model.mdj')).toBe(false)
    expect(isAbsolutePath('../model.mdj')).toBe(false)
    expect(isAbsolutePath('/home/u/a\0.mdj')).toBe(false)
    expect(isAbsolutePath(`/${'a'.repeat(5000)}`)).toBe(false)
    expect(isAbsolutePath(['/x'])).toBe(false)
  })

  it('recognizes project paths case-insensitively', () => {
    expect(isProjectPath('/home/u/MODEL.MDJ')).toBe(true)
    expect(isProjectPath('/home/u/model.mdj.exe')).toBe(false)
    expect(isProjectPath('relative.mdj')).toBe(false)
  })

  it('finds the project argument relative to the given working directory', () => {
    expect(findFileArgument(['/app/OpenUML', '--flag', '-psn_0_123', 'docs/a.mdj'], '/home/u')).toBe('/home/u/docs/a.mdj')
    expect(findFileArgument(['/app/OpenUML', '/abs/b.MDJ'], '/home/u')).toBe('/abs/b.MDJ')
    expect(findFileArgument(['/app/OpenUML', '--inspect=9229', 'notes.txt'], '/home/u')).toBeNull()
    expect(findFileArgument(['/app/OpenUML', 'a\0.mdj'], '/home/u')).toBeNull()
  })
})

describe('allowedExternalUrl', () => {
  it('allows the project pages on GitHub over https', () => {
    expect(allowedExternalUrl('https://github.com/AHHMED-J/OpenUML#readme')).toBe('https://github.com/AHHMED-J/OpenUML#readme')
    expect(allowedExternalUrl('https://github.com/AHHMED-J/OpenUML/issues')).toBe('https://github.com/AHHMED-J/OpenUML/issues')
  })

  it('refuses other schemes, hosts and look-alikes', () => {
    for (const url of [
      'http://github.com/AHHMED-J/OpenUML',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'smb://host/share',
      'https://evil.example/?d=secret',
      'https://github.com/AHHMED-J/OpenUML-evil',
      'https://github.com.evil.example/AHHMED-J/OpenUML',
      'https://user:pw@github.com/AHHMED-J/OpenUML',
      'https://github.com:8443/AHHMED-J/OpenUML',
      'not a url',
      42
    ]) {
      expect(allowedExternalUrl(url)).toBeNull()
    }
  })
})
