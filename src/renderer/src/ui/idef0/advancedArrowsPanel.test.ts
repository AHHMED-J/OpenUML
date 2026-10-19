import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../commands'
import { Idef0CommandIds } from '../../diagram'
import { writeMdj } from '../../format'
import type { Diagram } from '../../model'
import { buildOrderExample } from '../../model/idef0-example'
import { projectStore } from '../../store'
import { registerAppCommands } from '../app/appCommands'
import { registerIdef0 } from '../app/idef0'
import { buildAppMenu, explorerContextMenu } from '../menus/appMenu'
import { resolveMenu, type ResolvedMenuItem } from '../menus/menuModel'
import { uiStore } from '../uiStore'
import { AdvancedArrowsTable } from './AdvancedArrowsPanel'

function setup() {
  const ex = buildOrderExample()
  projectStore.getState().openProject(writeMdj(ex.project), null)
  uiStore.getState().resetLayout()
  const registry = new CommandRegistry()
  registerAppCommands(registry)
  if (!registry.has(Idef0CommandIds.advancedArrows)) registerIdef0(registry)
  const labels = (items: readonly ResolvedMenuItem[]): string[] => items.map((i) => (i.kind === 'separator' ? '-' : i.label))
  const explorerMenu = (): string[] => labels(resolveMenu(explorerContextMenu(), { commands: registry, platform: 'darwin' }))
  return { ex, registry, explorerMenu, labels }
}

describe('the Advanced Arrows panel', () => {
  it('is offered on a decomposition diagram in the Model Explorer and opens docked for that diagram', async () => {
    const { ex, registry, explorerMenu } = setup()
    projectStore.getState().select({ elements: [ex.contextDiagram._id] })
    expect(explorerMenu()).not.toContain('Advanced Arrows')
    projectStore.getState().select({ elements: [ex.childDiagram._id] })
    expect(explorerMenu()).toContain('Advanced Arrows')
    expect(uiStore.getState().dock.panels.advancedArrows.visible).toBe(false)
    await registry.execute(Idef0CommandIds.advancedArrows)
    expect(uiStore.getState().dock.panels.advancedArrows.visible).toBe(true)
    expect(projectStore.getState().activeDiagramId).toBe(ex.childDiagram._id)
  })

  it('lists the parent arrows against the boxes, with an empty state off decomposition diagrams', () => {
    const { ex } = setup()
    const repo = projectStore.getState().repository
    const table = (id: string): string => renderToStaticMarkup(createElement(AdvancedArrowsTable, { diagram: repo.get(id) as Diagram, selectedIds: [] }))
    const html = table(ex.childDiagram._id)
    for (const text of ['A1', 'A2', 'A3', 'I1', 'C1', 'O1', 'M1', 'Result']) expect(html).toContain(text)
    expect(html).toContain('type="checkbox"')
    expect(table(ex.contextDiagram._id)).toContain('Open an IDEF0 child diagram (A0, A1…) to assign its parent arrows.')
  })

  it('has a View > Panels entry that toggles it', async () => {
    const { registry, labels } = setup()
    const view = resolveMenu(buildAppMenu('darwin'), { commands: registry, platform: 'darwin' }).find((m) => m.kind === 'submenu' && m.label === 'View')
    const panels = view?.kind === 'submenu' ? view.items.find((i) => i.kind === 'submenu' && i.label === 'Panels') : undefined
    expect(panels?.kind === 'submenu' ? labels(panels.items) : []).toContain('Advanced Arrows')
    await registry.execute('view.advanced-arrows')
    expect(uiStore.getState().dock.panels.advancedArrows.visible).toBe(true)
    await registry.execute('view.advanced-arrows')
    expect(uiStore.getState().dock.panels.advancedArrows.visible).toBe(false)
  })
})
