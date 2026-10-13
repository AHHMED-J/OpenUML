import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderDiagramSvg } from '../../export/svg'
import { rootArrow, type Elem, type View } from '../../model'
import { SelectionOverlay } from '../editor/Overlays'
import { ArrowEdge } from './render'
import type { ArrowData } from './edges'
import { edgeLayoutOf, exampleKit, measurer, type IdefKit } from './testkit'

const named = (scope: Elem, name: string): Elem => (scope['arrows'] as Elem[]).find((a) => a['name'] === name) as Elem
const viewOf = (k: IdefKit, arrow: Elem): View => k.repository.viewsOf(arrow).find((v) => v._type === 'IDEF0ArrowView') as View

function fork() {
  const k = exampleKit()
  const trunk = named(k.top, 'Sales Policy')
  const branch = (k.top['arrows'] as Elem[]).find((a) => a['source'] === trunk) as Elem
  const tree = (k.top['arrows'] as Elem[]).filter((a) => rootArrow(a) === trunk).map((a) => viewOf(k, a)._id)
  return { k, tree, trunkView: viewOf(k, trunk), branchView: viewOf(k, branch), single: viewOf(k, named(k.top, 'Customer Order')) }
}

const halos = (markup: string): number => (markup.match(/stroke-opacity="0.3"/g) ?? []).length

describe('IDEF0 arrow highlight', () => {
  it('groups a trunk with every branch, whichever is selected', () => {
    const { k, tree, trunkView, branchView, single } = fork()
    const layout = k.layoutOf(k.child)
    expect(tree.length).toBeGreaterThanOrEqual(2)
    expect([...layout.edges.get(trunkView._id)!.highlightGroup!].sort()).toEqual([...tree].sort())
    expect([...layout.edges.get(branchView._id)!.highlightGroup!].sort()).toEqual([...tree].sort())
    expect(layout.edges.get(single._id)?.highlightGroup).toEqual([single._id])
  })

  it('highlights the whole tree and its label when one arrow of it is selected', () => {
    const { k, tree, trunkView, branchView, single } = fork()
    const layout = k.layoutOf(k.child)
    const forBranch = renderToStaticMarkup(createElement('svg', null, createElement(SelectionOverlay, { layout, selected: [branchView._id], zoom: 1 })))
    // A band along the trunk and every branch...
    expect(halos(forBranch)).toBe(tree.length)
    // ...and one around the trunk's label (the branch has none).
    const label = layout.edges.get(trunkView._id)!.labels[0]!
    expect(forBranch).toContain(`width="${label.box.width + 4}"`)
    const forSingle = renderToStaticMarkup(createElement('svg', null, createElement(SelectionOverlay, { layout, selected: [single._id], zoom: 1 })))
    expect(halos(forSingle)).toBe(1)
    // Nodes are unaffected.
    const box = k.boxes(k.child)[0]!
    expect(halos(renderToStaticMarkup(createElement('svg', null, createElement(SelectionOverlay, { layout, selected: [box._id], zoom: 1 }))))).toBe(0)
  })

  it('marks the line and the label so hovering the label highlights the line, and exports no highlight', () => {
    const { k, trunkView } = fork()
    const markup = renderToStaticMarkup(createElement('svg', null, createElement(ArrowEdge, { layout: edgeLayoutOf<ArrowData>(k.layoutOf(k.child), trunkView) })))
    expect(markup).toContain('class="idef0-arrow"')
    expect(markup).toContain('class="idef0-arrow-line"')
    expect(markup).toContain('class="idef0-arrow-label"')
    const svg = renderDiagramSvg(k.child, k.repository, measurer).svg
    expect(svg.toLowerCase()).not.toContain('#4f99ff')
    expect(svg).not.toContain('<style')
  })
})
