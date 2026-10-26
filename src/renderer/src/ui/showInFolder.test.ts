import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands'
import { projectStore } from '../store'
import { registerAppCommands } from './app/appCommands'
import { showInFolderLabel } from './app/bridge'
import { buildAppMenu } from './menus/appMenu'
import { Cmd } from './menus/commandIds'
import type { MenuNode } from './menus/menuModel'

const submenuOf = (node: MenuNode | undefined): readonly MenuNode[] => (typeof node?.submenu === 'function' ? node.submenu() : (node?.submenu ?? []))

describe('Show in Finder / Explorer', () => {
  it('is named after the system file manager', () => {
    expect(['Show in Finder', 'Show in Explorer', 'Show in File Manager']).toContain(showInFolderLabel)
  })

  it('is registered and needs a saved file (and the desktop app) to be enabled', () => {
    const registry = new CommandRegistry()
    registerAppCommands(registry)
    expect(registry.has(Cmd.fileShowInFolder)).toBe(true)
    projectStore.getState().newProject()
    expect(projectStore.getState().filePath).toBeNull()
    expect(registry.isEnabled(Cmd.fileShowInFolder)).toBe(false)
  })

  it('sits right after Save As in the File menu on every platform', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const file = submenuOf(buildAppMenu(platform).find((n) => n.id === 'file'))
      const index = file.findIndex((n) => n.command === Cmd.fileSaveAs)
      expect(index, platform).toBeGreaterThan(-1)
      expect(file[index + 1]?.command, platform).toBe(Cmd.fileShowInFolder)
    }
  })
})
