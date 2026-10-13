import { describe, expect, it } from 'vitest'
import { readMdj, writeMdj } from '../../format'
import { renderDiagramSvg } from '../../export/svg'
import type { Diagram, Elem, View } from '../../model'
import { arrowFlow, colorIdef0Arrows, isFlowColorEdit } from './colorFlow'
import { IDEF0_ROLE_COLORS } from './colors'
import { decomposeFunction } from './decompose'
import type { ArrowData } from './edges'
import { edgeLayoutOf, exampleKit, measurer, type IdefKit } from './testkit'

const RED = '#d1242f'
const BLUE = '#0969da'
const GREEN = '#116329'

const named = (scope: Elem, name: string): Elem => (scope['arrows'] as Elem[]).find((a) => a['name'] === name) as Elem
const viewOf = (k: IdefKit, arrow: Elem): View => k.repository.viewsOf(arrow).find((v) => v._type === 'IDEF0ArrowView') as View
const branchesOf = (arrow: Elem): Elem[] => ((arrow._parent as Elem)['arrows'] as Elem[]).filter((a) => a['source'] === arrow || a['target'] === arrow)
const serialized = (k: IdefKit): string => writeMdj(k.repository.project as Elem)

/** The example with its "Sales Policy" control: a boundary trunk on A0 forked to A3, linked to the A-0 arrow. */
function salesPolicy() {
  const k = exampleKit()
  const trunk = named(k.top, 'Sales Policy')
  const [branch] = branchesOf(trunk) as [Elem]
  const context = named(k.model, 'Sales Policy')
  return { k, trunk, branch, context }
}

function drawn(k: IdefKit, diagram: Diagram, arrow: Elem) {
  return edgeLayoutOf<ArrowData>(k.layoutOf(diagram), viewOf(k, arrow))
}

describe('IDEF0 arrow colors', () => {
  it('colors a fork as one arrow: trunk, branches, arrowheads, label and the A-0 counterpart, in one undo step', () => {
    const { k, trunk, branch, context } = salesPolicy()
    expect(arrowFlow(trunk)).toEqual(expect.arrayContaining([trunk, branch, context]))
    const before = serialized(k)
    const depth = k.engine.undoDepth
    colorIdef0Arrows(k.engine, [viewOf(k, trunk)], 'lineColor', RED)
    expect(k.engine.undoDepth).toBe(depth + 1)
    for (const a of [trunk, branch, context]) expect(viewOf(k, a).lineColor).toBe(RED)
    const t = drawn(k, k.child, trunk)
    const b = drawn(k, k.child, branch)
    expect([t.style.lineColor, b.style.lineColor]).toEqual([RED, RED])
    // The label follows the line color by default.
    expect(t.labels.map((l) => l.fontColor)).toEqual([RED])
    expect(drawn(k, k.context, context).style.lineColor).toBe(RED)
    k.engine.undo()
    expect(serialized(k)).toBe(before)
  })

  it('lets a single branch override the trunk color, and a text color override the label', () => {
    const { k, trunk, branch, context } = salesPolicy()
    colorIdef0Arrows(k.engine, [viewOf(k, trunk)], 'lineColor', RED)
    colorIdef0Arrows(k.engine, [viewOf(k, branch)], 'lineColor', BLUE)
    expect(drawn(k, k.child, branch).style.lineColor).toBe(BLUE)
    expect(drawn(k, k.child, trunk).style.lineColor).toBe(RED)
    expect(viewOf(k, context).lineColor).toBe(RED)
    colorIdef0Arrows(k.engine, [viewOf(k, trunk)], 'fontColor', GREEN)
    const t = drawn(k, k.child, trunk)
    expect(t.style.lineColor).toBe(RED)
    expect(t.labels.map((l) => l.fontColor)).toEqual([GREEN])
    // Coloring the trunk again recolors the whole fork.
    colorIdef0Arrows(k.engine, [viewOf(k, trunk)], 'lineColor', BLUE)
    expect([drawn(k, k.child, trunk).style.lineColor, drawn(k, k.child, branch).style.lineColor]).toEqual([BLUE, BLUE])
  })

  it('draws a branch without a color of its own in its trunk color (e.g. a branch added later)', () => {
    const { k, trunk, branch } = salesPolicy()
    k.engine.transact('color trunk only', (b) => b.set(viewOf(k, trunk), 'lineColor', RED))
    expect(viewOf(k, branch).lineColor).toBe('#000000')
    expect(drawn(k, k.child, branch).style.lineColor).toBe(RED)
  })

  it('colors the child boundary arrows standing for a colored parent arrow', () => {
    const { k } = salesPolicy()
    const child = decomposeFunction(k.engine, k.example.a3, 3) as Diagram
    const parent = named(k.top, 'Shipped Order')
    colorIdef0Arrows(k.engine, [viewOf(k, parent)], 'lineColor', RED)
    const onChild = named(k.example.a3, 'Shipped Order')
    expect(drawn(k, child, onChild).style.lineColor).toBe(RED)
    // ...and the A-0 counterpart of the same output.
    expect(viewOf(k, named(k.model, 'Shipped Order')).lineColor).toBe(RED)
  })

  it('colors arrows by role when the model asks for it; manual colors win; off by default', () => {
    const { k, trunk, branch } = salesPolicy()
    const input = named(k.top, 'Customer Order')
    const output = named(k.top, 'Shipped Order')
    const mechanism = named(k.top, 'Order Staff')
    expect(k.model['colorArrowsByRole']).toBe(false)
    expect(drawn(k, k.child, input).style.lineColor).toBe('#000000')
    k.engine.transact('by role', (b) => b.set(k.model, 'colorArrowsByRole', true))
    expect(drawn(k, k.child, input).style.lineColor).toBe(IDEF0_ROLE_COLORS.input)
    expect(drawn(k, k.child, trunk).style.lineColor).toBe(IDEF0_ROLE_COLORS.control)
    expect(drawn(k, k.child, branch).style.lineColor).toBe(IDEF0_ROLE_COLORS.control)
    expect(drawn(k, k.child, output).style.lineColor).toBe(IDEF0_ROLE_COLORS.output)
    expect(drawn(k, k.child, mechanism).style.lineColor).toBe(IDEF0_ROLE_COLORS.mechanism)
    expect(drawn(k, k.child, input).labels.map((l) => l.fontColor)).toEqual([IDEF0_ROLE_COLORS.input])
    colorIdef0Arrows(k.engine, [viewOf(k, input)], 'lineColor', RED)
    expect(drawn(k, k.child, input).style.lineColor).toBe(RED)
  })

  it('validates colors: a color from a file that is not plain color syntax is drawn black, and edits refuse it', () => {
    const { k, trunk, branch } = salesPolicy()
    viewOf(k, trunk).lineColor = 'url(https://example.invalid/x)'
    viewOf(k, trunk).fontColor = 'expression(alert(1))'
    const t = drawn(k, k.child, trunk)
    expect(t.style.lineColor).toBe('#000000')
    expect(t.labels.map((l) => l.fontColor)).toEqual(['#000000'])
    expect(drawn(k, k.child, branch).style.lineColor).toBe('#000000')
    expect(() => colorIdef0Arrows(k.engine, [viewOf(k, branch)], 'lineColor', 'url(#x)')).toThrow()
    expect(() => colorIdef0Arrows(k.engine, [viewOf(k, branch)], 'fillColor', RED)).toThrow()
  })

  it('applies to the Style editor only for line and text colors of IDEF0 arrows', () => {
    const { k, trunk } = salesPolicy()
    const box = k.boxes(k.child)[0] as View
    expect(isFlowColorEdit([viewOf(k, trunk)], 'lineColor')).toBe(true)
    expect(isFlowColorEdit([viewOf(k, trunk)], 'fontColor')).toBe(true)
    expect(isFlowColorEdit([viewOf(k, trunk)], 'fillColor')).toBe(false)
    expect(isFlowColorEdit([box], 'lineColor')).toBe(false)
  })

  it('round-trips colors and the role setting through .mdj and keeps them in SVG export', () => {
    const { k, trunk, branch } = salesPolicy()
    expect(serialized(k)).not.toContain('colorArrowsByRole')
    colorIdef0Arrows(k.engine, [viewOf(k, trunk)], 'lineColor', RED)
    colorIdef0Arrows(k.engine, [viewOf(k, branch)], 'lineColor', BLUE)
    k.engine.transact('by role', (b) => b.set(k.model, 'colorArrowsByRole', true))
    const text = serialized(k)
    const { repository } = readMdj(text)
    expect(writeMdj(repository.project as Elem)).toBe(text)
    expect((repository.get(k.model._id) as Elem)['colorArrowsByRole']).toBe(true)
    const svg = renderDiagramSvg(repository.get(k.child._id) as Diagram, repository, measurer).svg
    expect(svg).toContain(`stroke="${RED}"`)
    expect(svg).toContain(`stroke="${BLUE}"`)
    expect(svg).toContain(`fill="${RED}"`)
    expect(svg).toContain(`stroke="${IDEF0_ROLE_COLORS.input}"`)
  })
})
