// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { createNode } from '../../commands'
import type { Diagram, Elem } from '../../model'
import { projectStore } from '../../store'
import { ModelExplorer } from './ModelExplorer'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

describe('Model Explorer virtualization', () => {
  it('keeps the focused row (the aria-activedescendant) in the document when it is out of the rendered window', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const { engine, repository, activeDiagramId } = projectStore.getState()
    const diagram = repository.get(activeDiagramId as string) as Diagram
    const classes: Elem[] = []
    for (let i = 0; i < 200; i++) classes.push(createNode(engine, { kind: 'Class', diagram, left: 0, top: i * 10 }).view?.model as Elem)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(createElement(ModelExplorer)))
    const tree = host.querySelector('[role="tree"]') as HTMLElement
    const rendered = (): number => tree.querySelectorAll('[role="treeitem"]').length
    // Without a measured viewport the first 60 rows are rendered, not all 200 classes.
    expect(rendered()).toBe(60)

    // Focus a row far below the rendered window (as after scrolling it away with the mouse).
    const far = classes[180] as Elem
    act(() => projectStore.getState().select({ elements: [far._id] }))
    const active = tree.getAttribute('aria-activedescendant') as string
    const row = document.getElementById(active)
    expect(row).not.toBeNull()
    expect(row?.getAttribute('aria-selected')).toBe('true')
    expect(row?.textContent).toContain(far['name'] as string)
    expect(rendered()).toBe(61)
    // Spacers and rows still add up to the full height of the list, so nothing shifts.
    const heights = [...tree.children].map((c) => (c.getAttribute('role') === 'treeitem' ? 22 : parseFloat((c as HTMLElement).style.height) || 0))
    const total = heights.reduce((a, b) => a + b, 0)
    const rows = 3 + classes.length
    expect(total).toBe(rows * 22)

    act(() => root.unmount())
    host.remove()
  })
})
