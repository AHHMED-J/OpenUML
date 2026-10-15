import { describe, expect, it } from 'vitest'
import { Keymap, type KeyBinding } from './keymap'
import { assignKeystroke, effectiveBindings, removeKeystroke, resetKeystrokes, sanitizeOverrides } from './keybindings'

const DEFAULTS: KeyBinding[] = [
  { key: 'cmdctrl-s', command: 'file.save' },
  { key: 'cmdctrl-shift-s', command: 'file.save-as' },
  { key: 'esc', command: 'tool.select' },
  { key: 'a', command: 'tool.select', when: 'toolActive' },
  { key: 'cmd-,', command: 'app.preferences', platforms: ['darwin'] }
]

function keymapWith(overrides: Record<string, string[]>, platform = 'darwin'): Keymap {
  return new Keymap(platform, effectiveBindings(DEFAULTS, overrides, platform))
}

describe('customized shortcuts', () => {
  it('replaces the defaults of a customized command only', () => {
    const km = keymapWith({ 'file.save': ['cmd-alt-s'] })
    expect(km.keystrokesFor('file.save')).toEqual(['cmd-alt-s'])
    expect(km.match('cmd-s')).toBeUndefined()
    expect(km.keystrokesFor('file.save-as')).toEqual(['cmd-shift-s'])
  })

  it('an empty list removes the shortcuts of a command', () => {
    expect(keymapWith({ 'file.save': [] }).keystrokesFor('file.save')).toEqual([])
  })

  it('keeps the context of a default keystroke the user kept', () => {
    const km = keymapWith({ 'tool.select': ['a', 'f2'] })
    expect(km.match('a')?.when).toBe('toolActive')
    expect(km.match('f2')?.when).toBeUndefined()
  })

  it('moves a keystroke from the command that had it', () => {
    const km = keymapWith({})
    const current = (c: string): string[] => km.keystrokesFor(c)
    const next = assignKeystroke({}, current, 'file.save-as', 'cmd-s', 'file.save')
    expect(next).toEqual({ 'file.save': [], 'file.save-as': ['cmd-shift-s', 'cmd-s'] })
    const after = keymapWith(next as Record<string, string[]>)
    expect(after.match('cmd-s')?.command).toBe('file.save-as')
    expect(after.warnings).toEqual([])
  })

  it('removes one keystroke and resets a command to its defaults', () => {
    const km = keymapWith({})
    const current = (c: string): string[] => km.keystrokesFor(c)
    expect(removeKeystroke({}, current, 'tool.select', 'esc')).toEqual({ 'tool.select': ['a'] })
    expect(resetKeystrokes({ 'file.save': [], 'tool.select': ['f2'] }, 'file.save')).toEqual({ 'tool.select': ['f2'] })
  })

  it('reads stored overrides defensively', () => {
    expect(sanitizeOverrides({ 'file.save': ['Cmd-Alt-S', 'cmd-alt-s', 'bogus-key-', 42], 'x': 'cmd-x', 'y': [] }, 'darwin')).toEqual({
      'file.save': ['cmd-alt-s'],
      y: []
    })
    for (const bad of [null, [], 'text', 5]) expect(sanitizeOverrides(bad, 'darwin')).toEqual({})
  })

  it('rebuilds a keymap in place', () => {
    const km = keymapWith({})
    km.reset(effectiveBindings(DEFAULTS, { 'file.save': ['f5'] }, 'darwin'))
    expect(km.keystrokeFor('file.save')).toBe('f5')
    expect(km.match('cmd-s')).toBeUndefined()
  })
})
