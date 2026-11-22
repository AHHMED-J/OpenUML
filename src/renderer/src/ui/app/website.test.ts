import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../commands'
import { Cmd } from '../menus/commandIds'

const bridge = vi.hoisted(() => ({ openExternal: vi.fn() }))
vi.mock('./bridge', async (importOriginal) => ({ ...(await importOriginal<typeof import('./bridge')>()), bridge }))

const { registerAppCommands } = await import('./appCommands')
const { buildAppMenu } = await import('../menus/appMenu')

describe('Help > OpenUML Website', () => {
  it('heads the Help menu on every platform and in the browser', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      for (const web of [false, true]) {
        const help = buildAppMenu(platform, web).find((n) => n.id === 'help')
        const items = typeof help?.submenu === 'function' ? help.submenu() : help?.submenu
        expect(items?.[0]?.command, `${platform} web=${web}`).toBe(Cmd.helpWebsite)
      }
    }
  })

  it('opens openuml.org and is in the command palette', async () => {
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    expect(registry.get(Cmd.helpWebsite)?.label).toBe('OpenUML Website')
    expect(registry.isEnabled(Cmd.helpWebsite)).toBe(true)
    await registry.execute(Cmd.helpWebsite)
    expect(bridge.openExternal).toHaveBeenCalledWith('https://openuml.org')
  })
})
