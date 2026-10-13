import { describe, expect, it } from 'vitest'
import { addAttribute, setFields } from '../commands'
import { cssColorOr, isCssColor } from '../format'
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

  it('keeps hostile names inert: no elements, handlers or script URLs in the markup', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 200, 60)
    const hostile = '</text><script>alert(1)</script><foreignObject><img src=x onerror="alert(1)"/></foreignObject><a href="javascript:alert(1)">x</a>]]>'
    setFields(t.engine, a.model as Elem, { name: hostile })
    const { svg } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(svg).not.toMatch(/<(script|foreignObject|img|a)\b/i)
    // Handler-looking text stays text (its quotes are escaped), never an attribute.
    expect(svg).not.toMatch(/\son\w+="/i)
    expect(svg).not.toContain('href="')
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('draws file colors only when they are plain colors', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    setFields(t.engine, a, {
      fillColor: 'url(https://tracker.example/x.svg#p)',
      lineColor: 'red" onload="alert(1)',
      fontColor: '#12ab34'
    })
    const { svg } = renderDiagramSvg(t.diagram, t.repository, t.measurer)
    expect(svg).not.toContain('tracker.example')
    expect(svg).not.toContain('onload')
    expect(svg).toContain('fill="#12ab34"')
  })
})

describe('isCssColor', () => {
  it('accepts plain color syntax', () => {
    for (const c of ['#fff', '#ffff', '#a1b2c3', '#a1b2c3d4', 'red', 'transparent', 'none', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'hsl(120deg 50% 50% / 0.3)']) {
      expect(isCssColor(c)).toBe(true)
    }
  })

  it('refuses references, functions and injection attempts', () => {
    for (const c of ['url(#a)', 'url(https://x)', 'var(--x)', 'red;stroke:url(x)', 'rgb(url(x))', 'expression(alert(1))', '#ggg', '', 'a'.repeat(100), 42, null]) {
      expect(isCssColor(c)).toBe(false)
    }
    expect(cssColorOr('url(x)', '#000000')).toBe('#000000')
  })
})
