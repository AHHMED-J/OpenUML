import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../commands'
import { Keymap } from '../keymap'
import {
  decodeMenuCommand,
  encodeMenuCommand,
  resolveMenu,
  toNativeMenu,
  type MenuContext,
  type MenuNode,
  type ResolvedMenuItem
} from './menuModel'

function setup(): { registry: CommandRegistry; ctx: MenuContext; state: { canUndo: boolean; grid: boolean } } {
  const registry = new CommandRegistry()
  const state = { canUndo: false, grid: true }
  registry.register({ id: 'edit.undo', label: 'Undo', run: () => undefined, isEnabled: () => state.canUndo })
  registry.register({ id: 'file.save', label: 'Save', run: () => undefined })
  registry.register({ id: 'view.show-grid', label: 'Show Grid', run: () => undefined, isChecked: () => state.grid })
  registry.register({ id: 'model.add', label: 'Add', run: () => undefined })
  const keymap = new Keymap('darwin', [
    { key: 'cmdctrl-z', command: 'edit.undo' },
    { key: 'cmdctrl-s', command: 'file.save' },
    { key: 'cmdctrl-g', command: 'view.show-grid' },
    { key: 'delete', command: 'edit.delete' }
  ])
  return { registry, state, ctx: { commands: registry, platform: 'darwin', keystrokeFor: (c) => keymap.keystrokeFor(c) } }
}

const item = (items: readonly ResolvedMenuItem[], label: string) => {
  const found = items.find((i) => i.kind !== 'separator' && i.label === label)
  if (!found || found.kind === 'separator') throw new Error(`no item ${label}`)
  return found
}

describe('resolveMenu', () => {
  it('takes enablement and checked state from the registry', () => {
    const { ctx, state } = setup()
    const nodes: MenuNode[] = [
      { label: 'Undo', command: 'edit.undo' },
      { label: 'Save', command: 'file.save' },
      { label: 'Grid', command: 'view.show-grid', checkbox: true },
      { label: 'Unknown', command: 'nope.missing' }
    ]
    let items = resolveMenu(nodes, ctx)
    expect(item(items, 'Undo')).toMatchObject({ enabled: false, keystroke: 'cmd-z' })
    expect(item(items, 'Save')).toMatchObject({ enabled: true, keystroke: 'cmd-s' })
    expect(item(items, 'Grid')).toMatchObject({ enabled: true, checked: true })
    expect(item(items, 'Unknown')).toMatchObject({ enabled: false })
    state.canUndo = true
    state.grid = false
    items = resolveMenu(nodes, ctx)
    expect(item(items, 'Undo').enabled).toBe(true)
    expect(item(items, 'Grid')).toMatchObject({ checked: false })
  })

  it('forces enablement for listed commands (native edit with a focused text field)', () => {
    const { ctx } = setup()
    const items = resolveMenu([{ label: 'Undo', command: 'edit.undo' }], { ...ctx, forceEnabled: new Set(['edit.undo']) })
    expect(item(items, 'Undo').enabled).toBe(true)
  })

  it('evaluates dynamic labels, overrides and visibility', () => {
    const { ctx } = setup()
    const items = resolveMenu(
      [
        { label: () => 'Undo Move', command: 'edit.undo', enabled: () => true },
        { label: 'Hidden', command: 'file.save', visible: () => false }
      ],
      ctx
    )
    expect(items).toHaveLength(1)
    expect(item(items, 'Undo Move').enabled).toBe(true)
  })

  it('tidies separators and drops empty submenus or shows their placeholder', () => {
    const { ctx } = setup()
    const items = resolveMenu(
      [
        { separator: true },
        { label: 'Save', command: 'file.save' },
        { separator: true },
        { label: 'Gone', submenu: [{ label: 'x', command: 'file.save', visible: () => false }] },
        { separator: true },
        { label: 'Add', placeholder: '(nothing to add here)', submenu: () => [] },
        { separator: true }
      ],
      ctx
    )
    expect(items.map((i) => i.kind)).toEqual(['item', 'separator', 'submenu'])
    const add = items[2]
    expect(add?.kind === 'submenu' && add.items).toEqual([{ kind: 'item', label: '(nothing to add here)', enabled: false }])
  })

  it('omits keystrokes for items with arguments', () => {
    const { ctx } = setup()
    const items = resolveMenu([{ label: 'Class', command: 'model.add', args: { id: 'class' } }], ctx)
    expect(item(items, 'Class')).not.toHaveProperty('keystroke')
  })
})

describe('native menu conversion', () => {
  it('encodes commands with arguments and converts accelerators', () => {
    const { ctx } = setup()
    const resolved = resolveMenu(
      [
        {
          label: 'File',
          submenu: [
            { label: 'Save', command: 'file.save' },
            { label: 'Delete', command: 'edit.delete' },
            { label: 'Add Class', command: 'model.add', args: { id: 'class' } },
            { separator: true },
            { label: 'Quit', role: 'quit' }
          ]
        },
        { label: 'Grid', command: 'view.show-grid', checkbox: true }
      ],
      ctx
    )
    const native = toNativeMenu(resolved, 'darwin')
    const file = native[0]?.submenu ?? []
    expect(file[0]).toMatchObject({ label: 'Save', command: 'file.save', accelerator: 'Cmd+S', enabled: true })
    // Unmodified keys (Delete) stay with the focused widget: no native accelerator.
    expect(file[1]?.accelerator).toBeUndefined()
    expect(decodeMenuCommand(file[2]?.command ?? '')).toEqual({ command: 'model.add', args: { id: 'class' } })
    expect(file[3]).toEqual({ type: 'separator' })
    expect(file[4]).toEqual({ role: 'quit', label: 'Quit' })
    expect(native[1]).toMatchObject({ type: 'checkbox', checked: true, accelerator: 'Cmd+G' })
  })

  it('round-trips command tokens', () => {
    expect(decodeMenuCommand(encodeMenuCommand('file.open-recent', '/tmp/a b.mdj'))).toEqual({
      command: 'file.open-recent',
      args: '/tmp/a b.mdj'
    })
    expect(decodeMenuCommand(encodeMenuCommand('file.save'))).toEqual({ command: 'file.save' })
  })
})
