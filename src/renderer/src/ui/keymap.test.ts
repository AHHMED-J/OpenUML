import { describe, expect, it } from 'vitest'
import {
  bindingToDispatch,
  displayKeystroke,
  eventToDescriptor,
  formatKeystroke,
  isNativeEditKeystroke,
  Keymap,
  parseKeystroke,
  toAccelerator,
  type KeyEventLike
} from './keymap'
import { DEFAULT_KEYMAP, WHEN_TOOL_ACTIVE } from './menus/keymaps'

const key = (k: string, code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('parseKeystroke', () => {
  it('maps cmdctrl to cmd on macOS and ctrl elsewhere', () => {
    expect(parseKeystroke('cmdctrl-s', 'darwin')).toEqual({ cmd: true, ctrl: false, alt: false, shift: false, key: 's' })
    expect(parseKeystroke('cmdctrl-s', 'win32')).toEqual({ cmd: false, ctrl: true, alt: false, shift: false, key: 's' })
    expect(parseKeystroke('cmdctrl-s', 'linux')?.ctrl).toBe(true)
  })

  it('normalizes modifier order and key aliases', () => {
    expect(formatKeystroke(parseKeystroke('shift-cmd-s', 'darwin')!)).toBe('cmd-shift-s')
    expect(parseKeystroke('escape', 'darwin')?.key).toBe('esc')
    expect(parseKeystroke('cmd--', 'darwin')?.key).toBe('minus')
    expect(parseKeystroke('cmdctrl-shift-]', 'linux')?.key).toBe(']')
    expect(parseKeystroke('cmd-,', 'darwin')?.key).toBe(',')
  })

  it('rejects malformed descriptors', () => {
    expect(parseKeystroke('', 'darwin')).toBeNull()
    expect(parseKeystroke('cmd-shift', 'darwin')).toBeNull()
    expect(parseKeystroke('hyper-a', 'darwin')).toBeNull()
  })
})

describe('eventToDescriptor', () => {
  it('uses physical codes for letters, digits and punctuation', () => {
    expect(eventToDescriptor(key('S', 'KeyS', { metaKey: true, shiftKey: true }))).toBe('cmd-shift-s')
    expect(eventToDescriptor(key('{', 'BracketLeft', { ctrlKey: true, shiftKey: true }))).toBe('ctrl-shift-[')
    expect(eventToDescriptor(key('0', 'Digit0', { ctrlKey: true }))).toBe('ctrl-0')
    expect(eventToDescriptor(key('-', 'Minus', { metaKey: true }))).toBe('cmd-minus')
  })

  it('treats Shift+= as plus and named keys by name', () => {
    expect(eventToDescriptor(key('+', 'Equal', { metaKey: true, shiftKey: true }))).toBe('cmd-plus')
    expect(eventToDescriptor(key('=', 'Equal', { metaKey: true }))).toBe('cmd-=')
    expect(eventToDescriptor(key('Escape', 'Escape'))).toBe('esc')
    expect(eventToDescriptor(key('ArrowUp', 'ArrowUp', { ctrlKey: true, shiftKey: true }))).toBe('ctrl-shift-up')
    expect(eventToDescriptor(key('F4', 'F4', { shiftKey: true }))).toBe('shift-f4')
    expect(eventToDescriptor(key('Delete', 'Delete'))).toBe('delete')
  })

  it('ignores lone modifiers', () => {
    expect(eventToDescriptor(key('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(eventToDescriptor(key('Meta', 'MetaLeft', { metaKey: true }))).toBeNull()
  })
})

describe('Keymap', () => {
  it('matches events to commands per platform', () => {
    const mac = new Keymap('darwin', DEFAULT_KEYMAP)
    const win = new Keymap('win32', DEFAULT_KEYMAP)
    expect(mac.match(key('s', 'KeyS', { metaKey: true }))?.command).toBe('file.save')
    expect(mac.match(key('s', 'KeyS', { ctrlKey: true }))).toBeUndefined()
    expect(win.match(key('s', 'KeyS', { ctrlKey: true }))?.command).toBe('file.save')
    expect(win.match(key('z', 'KeyZ', { ctrlKey: true, shiftKey: true }))?.command).toBe('edit.redo')
    expect(mac.match('cmd-backspace')?.command).toBe('edit.delete-from-model')
    expect(win.match('ctrl-delete')?.command).toBe('edit.delete-from-model')
    expect(mac.match('cmd-,')?.command).toBe('app.preferences')
    expect(win.match('ctrl-,')).toBeUndefined()
  })

  it('records the primary keystroke per command and warns on overrides', () => {
    const km = new Keymap('linux', [
      { key: 'cmdctrl-y', command: 'edit.redo' },
      { key: 'cmdctrl-shift-z', command: 'edit.redo' },
      { key: 'cmdctrl-d', command: 'a' },
      { key: 'cmdctrl-d', command: 'b' },
      { key: 'bogus-x', command: 'c' }
    ])
    expect(km.keystrokeFor('edit.redo')).toBe('ctrl-y')
    expect(km.match('ctrl-d')?.command).toBe('b')
    expect(km.keystrokeFor('a')).toBeUndefined()
    expect(km.warnings).toHaveLength(2)
  })

  it('has no conflicting default bindings', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(new Keymap(platform, DEFAULT_KEYMAP).warnings).toEqual([])
    }
  })
})

describe('formatting', () => {
  it('produces Electron accelerators', () => {
    expect(toAccelerator('cmd-shift-s', 'darwin')).toBe('Cmd+Shift+S')
    expect(toAccelerator('ctrl-shift-]', 'win32')).toBe('Ctrl+Shift+]')
    expect(toAccelerator('ctrl-minus', 'linux')).toBe('Ctrl+-')
    expect(toAccelerator('ctrl-plus', 'linux')).toBe('Ctrl+Plus')
    expect(toAccelerator('f4', 'linux')).toBe('F4')
  })

  it('produces display labels', () => {
    expect(displayKeystroke('cmd-shift-s', 'darwin')).toBe('⇧⌘S')
    expect(displayKeystroke('cmd-backspace', 'darwin')).toBe('⌘⌫')
    expect(displayKeystroke('ctrl-shift-s', 'win32')).toBe('Ctrl+Shift+S')
    expect(displayKeystroke('ctrl-delete', 'linux')).toBe('Ctrl+Del')
  })

  it('identifies native text-editing keystrokes', () => {
    expect(isNativeEditKeystroke('cmd-z', 'darwin')).toBe(true)
    expect(isNativeEditKeystroke('cmd-shift-z', 'darwin')).toBe(true)
    expect(isNativeEditKeystroke('ctrl-c', 'win32')).toBe(true)
    expect(isNativeEditKeystroke('backspace', 'darwin')).toBe(true)
    expect(isNativeEditKeystroke('a', 'darwin')).toBe(true)
    expect(isNativeEditKeystroke('cmd-s', 'darwin')).toBe(false)
    expect(isNativeEditKeystroke('ctrl-c', 'darwin')).toBe(false)
    expect(isNativeEditKeystroke('f4', 'linux')).toBe(false)
  })

  it('dispatches menu-accelerator shortcuts from the page (Cmd+Z on the canvas)', () => {
    const mac = new Keymap('darwin', DEFAULT_KEYMAP)
    // Regression: undo/redo were left to the native menu and did nothing when the page had focus.
    expect(bindingToDispatch(mac, 'cmd-z', { textFocused: false })?.command).toBe('edit.undo')
    expect(bindingToDispatch(mac, 'cmd-shift-z', { textFocused: false })?.command).toBe('edit.redo')
    expect(mac.keystrokeFor('edit.redo')).toBe('cmd-shift-z')
    const win = new Keymap('win32', DEFAULT_KEYMAP)
    expect(bindingToDispatch(win, 'ctrl-y', { textFocused: false })?.command).toBe('edit.redo')
    expect(win.keystrokeFor('edit.redo')).toBe('ctrl-y')
    // Focused text fields keep native editing keys and unmodified keys.
    expect(bindingToDispatch(mac, 'cmd-z', { textFocused: true })).toBeUndefined()
    expect(bindingToDispatch(mac, 'delete', { textFocused: true })).toBeUndefined()
    expect(bindingToDispatch(mac, 'esc', { textFocused: true, textBlockedCommands: new Set(['tool.select']) })).toBeUndefined()
    expect(bindingToDispatch(mac, 'cmd-s', { textFocused: true })?.command).toBe('file.save')
  })

  it('returns to the Select tool with a plain A only while a tool is active and no text field has focus', () => {
    const blocked = new Set(['tool.select'])
    const toolActive = new Set([WHEN_TOOL_ACTIVE])
    for (const platform of ['darwin', 'win32', 'linux']) {
      const km = new Keymap(platform, DEFAULT_KEYMAP)
      expect(km.warnings).toEqual([])
      const a = eventToDescriptor(key('a', 'KeyA'))!
      expect(a).toBe('a')
      // A tool is active: A runs the Select tool command, like Esc.
      expect(bindingToDispatch(km, a, { textFocused: false, textBlockedCommands: blocked, contextKeys: toolActive })?.command).toBe('tool.select')
      expect(bindingToDispatch(km, 'esc', { textFocused: false, textBlockedCommands: blocked, contextKeys: toolActive })?.command).toBe('tool.select')
      // No tool: A is left alone (Esc still runs the command, as before).
      expect(bindingToDispatch(km, a, { textFocused: false, textBlockedCommands: blocked })).toBeUndefined()
      expect(bindingToDispatch(km, a, { textFocused: false, textBlockedCommands: blocked, contextKeys: new Set() })).toBeUndefined()
      expect(bindingToDispatch(km, 'esc', { textFocused: false, textBlockedCommands: blocked })?.command).toBe('tool.select')
      // Typing in an input, the quick editor or a property field keeps the letter.
      expect(bindingToDispatch(km, a, { textFocused: true, textBlockedCommands: blocked, contextKeys: toolActive })).toBeUndefined()
      // Shift+A, Alt+A and Cmd/Ctrl+A are other keystrokes: Select All still works.
      for (const mods of [{ shiftKey: true }, { altKey: true }]) {
        expect(bindingToDispatch(km, eventToDescriptor(key('A', 'KeyA', mods))!, { textFocused: false, contextKeys: toolActive })).toBeUndefined()
      }
      const selectAll = eventToDescriptor(key('a', 'KeyA', platform === 'darwin' ? { metaKey: true } : { ctrlKey: true }))!
      expect(bindingToDispatch(km, selectAll, { textFocused: false, contextKeys: toolActive })?.command).toBe('edit.select-all')
      expect(bindingToDispatch(km, selectAll, { textFocused: false })?.command).toBe('edit.select-all')
      // Esc stays the keystroke shown for the command.
      expect(km.keystrokeFor('tool.select')).toBe('esc')
    }
  })

  it('keeps a `when` key with the resolved binding', () => {
    const km = new Keymap('darwin', [{ key: 'b', command: 'x.cmd', when: 'someKey' }])
    expect(km.match('b')).toMatchObject({ command: 'x.cmd', when: 'someKey' })
    expect(bindingToDispatch(km, 'b', { textFocused: false, contextKeys: new Set(['someKey']) })?.command).toBe('x.cmd')
    expect(bindingToDispatch(km, 'b', { textFocused: false, contextKeys: new Set(['other']) })).toBeUndefined()
  })
})
