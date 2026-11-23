import { beforeEach, describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../commands'
import type { Elem } from '../../model'
import { projectStore } from '../../store'
import { canvasContextMenu } from '../menus/appMenu'
import { resolveMenu } from '../menus/menuModel'
import { addDiagram } from '../modelActions'
import { RadCommandIds, registerRad } from './rad'

const model = (): Elem => projectStore.getState().project.ownedElements[0] as Elem

function labels(): string[] {
  const registry = new CommandRegistry()
  registerRad(registry)
  return resolveMenu(canvasContextMenu(), { commands: registry, platform: 'darwin' }).flatMap((i) => (i.kind === 'separator' ? [] : [i.label]))
}

beforeEach(() => projectStore.getState().newProject())

describe('Compact Layout command', () => {
  it('is in the canvas menu (and the command palette) only while a RAD diagram is open', () => {
    const rad = addDiagram(projectStore.getState().engine, model(), 'RADDiagram')
    projectStore.getState().openDiagram(rad._id)
    expect(labels()).toContain('Compact Layout')
    const registry = new CommandRegistry()
    registerRad(registry)
    expect(registry.get(RadCommandIds.compactLayout)?.isEnabled?.()).toBe(true)
    const cls = addDiagram(projectStore.getState().engine, model(), 'ClassDiagram')
    projectStore.getState().openDiagram(cls._id)
    expect(labels()).not.toContain('Compact Layout')
    expect(registry.get(RadCommandIds.compactLayout)?.isEnabled?.()).toBe(false)
  })
})
