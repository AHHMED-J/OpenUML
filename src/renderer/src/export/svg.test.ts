import { describe, expect, it } from 'vitest'
import { addAttribute, setFields } from '../commands'
import type { Elem } from '../model'
import { testDiagram } from '../diagram/testUtils'
import { renderDiagramSvg } from './svg'

describe('SVG export', () => {
  it('writes a standalone SVG of the content bounds plus a 10 margin', () => {
    const t = testDiagram()
    const a = t.node('Class', 40, 40, 120, 80)
    const b = t.node('Class', 300, 40, 120, 80)
    addAttribute(t.engine, a.model as Elem, { name: 'id', type: 'int' })
    t.edge('Generalization', a, b)
    const { svg, bounds } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    // Union of the view boxes (shadows are not part of it; the 10 margin covers their 7 offset).
    expect(bounds).toEqual({ left: 30, top: 30, width: 420 - 40 + 20, height: 120 - 40 + 20 })
    expect(svg).toContain(`viewBox="30 30 ${bounds.width} ${bounds.height}"`)
    expect(svg).toContain(`width="${bounds.width}"`)
    // Text as <text> with a generic font fallback; names bold.
    expect(svg).toMatch(/<text[^>]*font-weight="bold"[^>]*>Class1<\/text>/)
    expect(svg).toContain('>+id: int</text>')
    expect(svg).toContain('font-family="Arial, sans-serif"')
    expect(svg).toContain('xml:space="preserve"')
    // Hollow generalization triangle stays white-filled.
    expect(svg).toMatch(/<path d="M299 [^"]*Z" fill="#ffffff" stroke="#000000"/)
  })

  it('never contains selection, handles or grid, and is transparent by default', () => {
    const t = testDiagram()
    t.node('Class', 0, 0)
    const { svg } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(svg.toLowerCase()).not.toContain('#4f99ff')
    expect(svg).not.toContain('<pattern')
    expect(svg).not.toContain('url(#')
    // No background rectangle: the drawing starts right away.
    expect(svg).toMatch(/font-family="Arial, sans-serif"><g>/)
    const withBg = renderDiagramSvg(t.diagram, t.repository, t.measurer, { background: '#ffffff' }).svg
    expect(withBg).toMatch(/<rect x="-10" y="-10" width="\d+" height="\d+" fill="#ffffff"/)
  })

  it('escapes text and renders dashed lines with stroke-dasharray', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    setFields(t.engine, a.model as Elem, { name: 'A<B>&C' })
    t.edge('Dependency', a, b)
    const { svg } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(svg).toContain('A&lt;B&gt;&amp;C')
    expect(svg).toContain('stroke-dasharray="3 3"')
  })

  it('exports an empty diagram as a small empty SVG', () => {
    const t = testDiagram()
    const { svg, bounds } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(bounds).toEqual({ left: 0, top: 0, width: 20, height: 20 })
    expect(svg).toContain('<svg')
  })
})
