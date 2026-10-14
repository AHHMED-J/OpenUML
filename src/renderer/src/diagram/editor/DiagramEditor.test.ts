import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createNode } from '../../commands'
import type { Diagram } from '../../model'
import { projectStore } from '../../store'
import { FixedWidthTextMeasurer } from '../core'
import { setTextMeasurer } from '../layout/measurer'
import { ensureNotations } from '../notations'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { DiagramEditor } from './DiagramEditor'
import { DragOverlay, SelectionOverlay } from './Overlays'

describe('DiagramEditor (static render)', () => {
  it('renders the diagram, grid and selection overlay without errors', () => {
    ensureNotations()
    setTextMeasurer(new FixedWidthTextMeasurer())
    // Server rendering reads the store's initial state.
    const { engine, repository, activeDiagramId } = projectStore.getInitialState()
    const diagram = repository.get(activeDiagramId) as Diagram
    createNode(engine, { kind: 'Class', diagram, left: 10, top: 10 })
    const html = renderToStaticMarkup(
      createElement(DiagramEditor, {
        diagramId: diagram._id,
        tool: null,
        onToolUsed: () => undefined,
        zoom: 1.5,
        onZoomChange: () => undefined,
        showGrid: true,
        snapToGrid: true
      })
    )
    expect(html).toContain('class="ou-diagram-editor"')
    expect(html).toContain('transform="scale(1.5)"')
    expect(html).toContain('<pattern')
    expect(html).toContain('>Class1</text>')
    const layout = computeDiagramLayout(diagram, repository, new FixedWidthTextMeasurer())
    const overlay = renderToStaticMarkup(
      createElement('svg', null, createElement(SelectionOverlay, { layout, selected: [...layout.nodes.keys()], zoom: 1.5 }))
    )
    // Selection: accent outline and 8 handles of 8 screen px (8 / 1.5 diagram units).
    expect(overlay.toLowerCase()).toContain('#4f99ff')
    expect(overlay.match(/width="5.333" height="5.333"/g)).toHaveLength(8)
    setTextMeasurer(null)
  })

  it('draws the grid at the grid size it is given', () => {
    ensureNotations()
    setTextMeasurer(new FixedWidthTextMeasurer())
    const { activeDiagramId } = projectStore.getInitialState()
    const render = (gridSize?: number): string =>
      renderToStaticMarkup(
        createElement(DiagramEditor, {
          diagramId: activeDiagramId as string,
          tool: null,
          onToolUsed: () => undefined,
          zoom: 1,
          onZoomChange: () => undefined,
          showGrid: true,
          snapToGrid: true,
          ...(gridSize === undefined ? {} : { gridSize })
        })
      )
    expect(render()).toMatch(/<pattern[^>]* width="16" height="16"/)
    expect(render(20)).toMatch(/<pattern[^>]* width="40" height="40"/)
    // Out of range: the default grid.
    expect(render(500)).toMatch(/<pattern[^>]* width="16" height="16"/)
    setTextMeasurer(null)
  })

  it('renders a message for a missing diagram', () => {
    const html = renderToStaticMarkup(
      createElement(DiagramEditor, {
        diagramId: 'missing',
        tool: null,
        onToolUsed: () => undefined,
        zoom: 1,
        onZoomChange: () => undefined,
        showGrid: false,
        snapToGrid: false
      })
    )
    expect(html).toContain('Diagram not found')
  })

  it('draws a window band solid and blue, a crossing band dashed and green', () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 }
    const draw = (mode: 'contain' | 'intersect'): string =>
      renderToStaticMarkup(createElement('svg', null, createElement(DragOverlay, { preview: { kind: 'band', rect, mode }, zoom: 1 }))).toLowerCase()
    const window = draw('contain')
    expect(window).toContain('stroke="#4f99ff"')
    expect(window).not.toContain('stroke-dasharray')
    const crossing = draw('intersect')
    expect(crossing).toContain('stroke="#1f9d55"')
    expect(crossing).toContain('stroke-dasharray="3 3"')
    expect(crossing).toContain('rgba(31,157,85,0.10)')
  })
})
