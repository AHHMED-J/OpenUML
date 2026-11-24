/** The two RAD diagram styles: default, storage in the `.mdj`, undo, the Colorful look, user colors and the dark canvas. */
import { describe, expect, it } from 'vitest'
import { setFields } from '../../commands'
import { renderDiagramSvg } from '../../export'
import { readMdj, writeMdj } from '../../format'
import { walk, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { paintNode } from '../render/paintLayout'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout, EdgeLayout, NodeLayout } from '../layout/types'
import { clerkFixture, insuranceFixture, legendFixture, letterFixture, type RadBuilder } from './fixtures'
import type { ActivityData, MarkerData, RoleData, SymbolData } from './layout'
import { accentColors, radStyleOf, RAD_PALETTE } from './look'
import type { RadEdgeData } from './render'

const lay = (b: RadBuilder): DiagramLayout => computeDiagramLayout(b.diagram, b.repository, b.measurer)
const node = <D,>(l: DiagramLayout, v: View): NodeLayout<D> => l.nodes.get(v._id) as NodeLayout<D>
const center = (n: NodeLayout): { x: number; y: number } => ({ x: n.box.left + n.box.width / 2, y: n.box.top + n.box.height / 2 })

function colorful(b: RadBuilder): RadBuilder {
  setFields(b.engine, b.diagram, { diagramStyle: 'colorful' })
  return b
}

describe('the diagram style', () => {
  it('is Classic for a new RAD diagram, and is left out of the file until it changes', () => {
    const b = insuranceFixture()
    expect(radStyleOf(b.diagram)).toBe('classic')
    expect(writeMdj(b.repository.project as Elem)).not.toContain('diagramStyle')
  })

  it('is stored in the diagram, read back from the file, and other files open as Classic', () => {
    const b = colorful(insuranceFixture())
    const text = writeMdj(b.repository.project as Elem)
    expect(text).toContain('"diagramStyle": "colorful"')
    const back = readMdj(text)
    expect(back.warnings).toEqual([])
    expect(writeMdj(back.project)).toBe(text)
    const diagram = [...walk(back.project)].find((e) => e._type === 'RADDiagram') as Diagram
    expect(radStyleOf(diagram)).toBe('colorful')
    // A file written before the styles (or by another tool) has no style: Classic.
    const old = JSON.parse(text)
    const strip = (o: unknown): void => {
      if (!o || typeof o !== 'object') return
      delete (o as Record<string, unknown>)['diagramStyle']
      for (const v of Object.values(o)) strip(v)
    }
    strip(old)
    const plain = readMdj(JSON.stringify(old))
    expect(plain.warnings).toEqual([])
    expect(radStyleOf([...walk(plain.project)].find((e) => e._type === 'RADDiagram') as Diagram)).toBe('classic')
  })

  it('changes in one step that undo and redo restore', () => {
    const b = insuranceFixture()
    colorful(b)
    expect(radStyleOf(b.diagram)).toBe('colorful')
    b.engine.undo()
    expect(radStyleOf(b.diagram)).toBe('classic')
    expect(node<SymbolData>(lay(b), b.v('a2')).data.look).toBe('classic')
    b.engine.redo()
    expect(node<SymbolData>(lay(b), b.v('a2')).data.look).toBe('colorful')
  })

  it('never moves a symbol: every one keeps its center in both styles', () => {
    for (const make of [insuranceFixture, letterFixture, legendFixture]) {
      const b = make()
      const classic = lay(b)
      const centers = [...classic.nodes.values()].filter((n) => n.viewType !== 'RADRoleView').map((n) => [n.viewId, center(n)] as const)
      colorful(b)
      const other = lay(b)
      for (const [id, c] of centers) expect(center(other.nodes.get(id) as NodeLayout), id).toEqual(c)
    }
  })
})

describe('Colorful', () => {
  it('gives each role a color of the palette, in process order, on its header dot and its threads', () => {
    const b = colorful(insuranceFixture())
    const l = lay(b)
    const customer = node<RoleData>(l, b.roles.get('customer')?.view as View)
    const agent = node<RoleData>(l, b.roles.get('agent')?.view as View)
    expect(customer.data.dot?.swatch).toBe(RAD_PALETTE[0])
    expect(agent.data.dot?.swatch).toBe(RAD_PALETTE[1])
    expect(customer.data.separator).toBeNull()
    expect(customer.style).toMatchObject({ fillColor: '#f8fafc', lineColor: '#e2e8f0' })
    const thread = l.edges.get(b.e('a1', 'a2')._id) as EdgeLayout<RadEdgeData>
    expect(thread.data?.accent?.swatch).toBe(RAD_PALETTE[1])
    // Interaction links stay dark.
    const link = l.edges.get(b.k('c1', 'a1')._id) as EdgeLayout<RadEdgeData>
    expect(link.data?.accent).toBeNull()
    expect(link.style.lineColor).toBe('#1f2937')
    expect(link.data?.strokeWidth).toBe(2)
  })

  it('draws activities as filled cards and interactions as outlined cards, the name centered inside', () => {
    const b = colorful(insuranceFixture())
    const l = lay(b)
    const a2 = node<ActivityData>(l, b.v('a2'))
    expect(a2.data.card).toBe(true)
    expect(a2.data.accent).toMatchObject({ fill: 'accent', text: 'onAccent', line: true })
    expect(accentColors(a2.data.accent, 'light', a2.style)).toEqual({ fill: '#10b981', line: '#10b981', text: '#ffffff' })
    expect(a2.box.width).toBeGreaterThanOrEqual(96)
    expect(a2.box.height).toBeGreaterThanOrEqual(22)
    for (const line of a2.data.lines) {
      expect(line.align).toBe('center')
      expect(line.box.left).toBeGreaterThanOrEqual(a2.box.left)
      expect(line.box.left + line.box.width).toBeLessThanOrEqual(a2.box.left + a2.box.width)
      expect(line.font.style).toBe(1)
    }
    const c1 = node<ActivityData>(l, b.v('c1'))
    expect(accentColors(c1.data.accent, 'light', c1.style)).toEqual({ fill: '#ffffff', line: '#3b82f6', text: '#1f2937' })
    // One edit region: the card itself.
    expect(a2.regions).toHaveLength(1)
    expect(a2.regions[0]?.box).toEqual(a2.box)
  })

  it('grows a card with its name up to a maximum width, then wraps it onto more lines', () => {
    const b = colorful(insuranceFixture())
    const short = node<ActivityData>(lay(b), b.v('a4'))
    expect(short.data.lines).toHaveLength(1)
    expect(short.box.width).toBe(Math.max(96, Math.ceil((short.data.lines[0]?.box.width ?? 0) + 16)))
    const long = node<ActivityData>(lay(b), b.v('c2'))
    expect(long.box.width).toBeLessThanOrEqual(170)
    expect(long.data.lines.length).toBeGreaterThan(1)
    expect(long.box.height).toBeGreaterThan(22)
    const last = long.data.lines[long.data.lines.length - 1]
    expect(last ? last.box.top + last.box.height : 0).toBeLessThanOrEqual(long.box.top + long.box.height)
  })

  it('draws start, end and state markers as pills with their name inside', () => {
    const markers: NodeLayout<MarkerData>[] = []
    for (const make of [clerkFixture, legendFixture]) {
      const l = lay(colorful(make()))
      markers.push(...([...l.nodes.values()].filter((n) => n.viewType === 'RADStateMarkerView') as NodeLayout<MarkerData>[]))
    }
    const byKind = (k: string) => markers.find((m) => m.data.kind === k) as NodeLayout<MarkerData>
    expect(byKind('end').data.accent).toMatchObject({ fill: 'accent', text: 'onAccent' })
    expect(byKind('start').data.accent).toMatchObject({ fill: null, text: 'accent' })
    expect(byKind('state').data.accent).toMatchObject({ fill: 'tint', text: null })
    for (const m of markers) {
      expect(m.data.card).toBe(true)
      expect(m.box.width).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('roles near the edge of the canvas', () => {
  it('do not grow left past 0, where the canvas starts, when Colorful cards are wider', () => {
    const b = colorful(insuranceFixture())
    const l = lay(b)
    const customer = node<RoleData>(l, b.roles.get('customer')?.view as View)
    // The card of "Receive acceptance..." reaches left of the role's stored left (0).
    expect(node(l, b.v('c2')).box.left).toBeLessThan(16)
    expect(customer.box.left).toBe(0)
  })
})

describe('colors the user picked', () => {
  it('win over the style in both styles', () => {
    const b = insuranceFixture()
    setFields(b.engine, b.v('a2'), { fillColor: '#ff0000', lineColor: '#0000ff' })
    const classic = node<ActivityData>(lay(b), b.v('a2'))
    expect(classic.style).toMatchObject({ fillColor: '#ff0000', lineColor: '#0000ff' })
    colorful(b)
    const card = node<ActivityData>(lay(b), b.v('a2'))
    expect(accentColors(card.data.accent, 'light', card.style)).toMatchObject({ fill: '#ff0000', line: '#0000ff' })
    // A role the user filled keeps its fill; the old gray of earlier files counts as a default.
    const role = b.roles.get('agent')?.view as NodeView
    setFields(b.engine, role, { fillColor: '#c0c0c0' })
    expect(node(lay(b), role).style.fillColor).toBe('#f8fafc')
    setFields(b.engine, role, { fillColor: '#ffe4e1' })
    expect(node(lay(b), role).style.fillColor).toBe('#ffe4e1')
  })
})

describe('the dark canvas', () => {
  it('uses the dark swatch of a role and converts the neutral colors', () => {
    const b = colorful(insuranceFixture())
    const a2 = node<ActivityData>(lay(b), b.v('a2'))
    const dark = paintNode(a2, 'dark')
    expect(accentColors(dark.data.accent, 'dark', dark.style)).toMatchObject({ fill: '#34d399', text: '#0f1115' })
    const svg = renderDiagramSvg(b.diagram, b.repository, b.measurer, { canvas: 'dark' }).svg
    expect(svg).toContain('#34d399')
    expect(svg).not.toContain('#10b981')
  })

  it('draws Classic symbols light on dark', () => {
    const b = insuranceFixture()
    const a2 = paintNode(node<ActivityData>(lay(b), b.v('a2')), 'dark')
    // The dark ink of a filled square turns light on the dark canvas.
    expect(a2.style.fillColor).not.toBe('#1f2937')
    expect(a2.style.lineColor).not.toBe('#1f2937')
    // Its name, beside the square, stays light too (not darkened to read on the light square).
    expect(a2.data.label.fontColor).toBe(paintNode(node<ActivityData>(lay(b), b.v('c1')), 'dark').data.label.fontColor)
    const svg = renderDiagramSvg(b.diagram, b.repository, b.measurer, { canvas: 'dark' }).svg
    const fill = /<text[^>]*fill="([^"]+)"[^>]*>Create a customer</.exec(svg)?.[1]
    expect(fill).toBe(a2.data.label.fontColor)
  })
})

describe('exports', () => {
  it('fit the content in either style, with the role colors in Colorful', () => {
    const b = insuranceFixture()
    const classic = renderDiagramSvg(b.diagram, b.repository, b.measurer)
    colorful(b)
    const bright = renderDiagramSvg(b.diagram, b.repository, b.measurer)
    expect(bright.svg).toContain('#3b82f6')
    expect(bright.svg).toContain('#10b981')
    // The picture is cut to the content (plus the export margin), not to any canvas room.
    const bounds = lay(b).bounds
    expect(bright.bounds.height).toBeLessThanOrEqual(Math.ceil((bounds?.height ?? 0) + 2 * 10) + 1)
    expect(classic.bounds.height).toBeGreaterThan(0)
  })
})
