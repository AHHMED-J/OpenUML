import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readMdj, writeMdj } from '../../format'
import { renderDiagramSvg } from '../../export'
import type { Diagram, Project } from '../../model'
import { createNode, setFields } from '../../commands'
import { FixedWidthTextMeasurer, type Rect } from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { EdgeLayout } from '../layout/types'
import { ensureNotations } from '../notations'
import { testDiagram } from '../testUtils'
import { paintEdge, paintNode } from './paintLayout'

const example = readFileSync(new URL('../../format/fixtures/example.mdj', import.meta.url), 'utf8')
const measurer = new FixedWidthTextMeasurer()

function exampleLayout() {
  ensureNotations()
  const { repository } = readMdj(example)
  return { repository, diagram: repository.defaultDiagram() as Diagram, layout: computeDiagramLayout(repository.defaultDiagram() as Diagram, repository, measurer) }
}

describe('painting a layout', () => {
  it('does nothing on the light canvas', () => {
    const { layout } = exampleLayout()
    for (const node of layout.nodes.values()) expect(paintNode(node, 'light')).toBe(node)
    for (const edge of layout.edges.values()) expect(paintEdge(edge, 'light')).toBe(edge)
  })

  it('never writes to the layout, and keeps one painted copy per layout so views can skip redrawing', () => {
    const { layout } = exampleLayout()
    const node = [...layout.nodes.values()][0]
    if (!node) throw new Error('no node')
    const before = JSON.stringify(node)
    const painted = paintNode(node, 'dark')
    expect(painted).not.toBe(node)
    expect(JSON.stringify(node)).toBe(before)
    expect(paintNode(node, 'dark')).toBe(painted)
    expect(painted.box).toBe(node.box)
    expect(painted.style.fillColor).toBe('#1b1f27')
  })

  it('moves a painted text that would be lost on its converted box', () => {
    const t = testDiagram()
    const { view } = createNode(t.engine, { kind: 'Class', diagram: t.diagram, left: 10, top: 10 })
    setFields(t.engine, view as never, { fillColor: '#101040', fontColor: '#000000' })
    const layout = computeDiagramLayout(t.diagram, t.repository, t.measurer).nodes.get((view as { _id: string })._id)
    if (!layout) throw new Error('no layout')
    const { style } = paintNode(layout, 'dark')
    expect(style.fontColor).not.toBe('#e8e8e8')
  })
})

describe('edge labels on the dark canvas', () => {
  const edge = (box: Rect, fillColor = '#ffffff'): EdgeLayout =>
    ({ style: { lineColor: '#000000', fillColor: '#ffffff', fontColor: '#000000' }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], labels: [{ box, text: 'a', fillColor, fontColor: '#000000' }] }) as unknown as EdgeLayout
  const box = (top: number): Rect => ({ left: 40, top, width: 20, height: 10 })

  it('goes without a box when the line does not run behind the text', () => {
    expect(paintEdge(edge(box(10)), 'dark').labels[0]?.fillColor).toBe('none')
  })

  it('keeps the box where it hides the line, or when the user painted it', () => {
    expect(paintEdge(edge(box(-5)), 'dark').labels[0]?.fillColor).toBe('#0f1115')
    expect(paintEdge(edge(box(10), '#ffcc00'), 'dark').labels[0]?.fillColor).not.toBe('none')
  })
})

describe('drawing on the dark canvas', () => {
  it('leaves no pure black or white anywhere in the drawing of a project', () => {
    const { repository } = readMdj(example)
    for (const diagram of repository.diagrams()) {
      const { svg } = renderDiagramSvg(diagram, repository, measurer, { canvas: 'dark' })
      expect(svg).not.toMatch(/#(?:000000|ffffff|000|fff)\b/i)
      expect(svg).toContain('fill="#0f1115"')
    }
  })

  it('changes neither the project nor its saved text', () => {
    const { repository } = readMdj(example)
    const before = writeMdj(repository.project as Project)
    for (const diagram of repository.diagrams()) renderDiagramSvg(diagram, repository, measurer, { canvas: 'dark' })
    expect(writeMdj(repository.project as Project)).toBe(before)
  })
})
