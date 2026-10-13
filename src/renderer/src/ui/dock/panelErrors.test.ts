// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectStore } from '../../store'
import { DockStack } from './DockArea'

// The Model Explorer fails to render; the rest of the sidebar must not go blank with it.
vi.mock('../explorer/ModelExplorer', () => ({
  ModelExplorer: (): never => {
    throw new Error('explorer exploded')
  },
  ExplorerActions: (): null => null
}))

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dock panel error boundaries', () => {
  it('replaces only the failing panel and keeps the project open', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const project = projectStore.getState().project
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(createElement(DockStack, { area: 'left' })))

    const panels = [...host.querySelectorAll('[data-dock-panel]')]
    const explorer = panels.find((p) => p.getAttribute('data-dock-panel') === 'explorer')
    const working = panels.find((p) => p.getAttribute('data-dock-panel') === 'workingDiagrams')
    expect(explorer?.textContent).toContain('This panel hit an error.')
    expect(explorer?.querySelector('.panel-header')?.textContent).toContain('Model Explorer')
    expect(working?.querySelector('[aria-label="Working diagrams"]')).not.toBeNull()
    expect(working?.textContent).not.toContain('hit an error')
    expect(projectStore.getState().project).toBe(project)

    act(() => root.unmount())
    host.remove()
  })
})
