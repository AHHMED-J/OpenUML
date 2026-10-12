import { describe, expect, it } from 'vitest'
import { createNodeAt } from '../editor/actions'
import { renderDiagramSvg } from '../../export'
import type { Diagram, Elem, NodeView, View } from '../../model'
import { applyPlan, createEdge } from '../../commands'
import { planIdef0Arrow, slotOffsets } from '../../model'
import type { ArrowData } from './edges'
import type { FrameData, FunctionData, PortData } from './layout'
import { arrowView, edgeLayoutOf, exampleKit, measurer, newKit, nodeLayoutOf } from './testkit'

// FixedWidthTextMeasurer: char width = 0.6 x size.

describe('function box layout', () => {
  it('draws the box number lower-right and the DRE below the corner', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.context)
    const top = k.boxes(k.context)[0] as NodeView
    const n = nodeLayoutOf<FunctionData>(layout, top)
    expect(n.box).toMatchObject({ left: 392, top: 290, width: 240, height: 120 })
    expect(n.data.numberLine.text).toBe('0')
    expect(n.data.numberLine.box.top + n.data.numberLine.box.height).toBe(410 - 4)
    expect(n.data.numberLine.box.left + n.data.numberLine.box.width).toBe(632 - 6)
    expect(n.data.dreLine?.text).toBe('A0')
    expect(n.data.dreLine?.box.top).toBe(413)
    expect(n.data.dreLine!.box.left + n.data.dreLine!.box.width).toBe(632)
    // The undecomposed boxes of A0 show no DRE.
    const a1 = nodeLayoutOf<FunctionData>(k.layoutOf(k.child), k.boxes(k.child)[0] as NodeView)
    expect(a1.data.dreLine).toBeNull()
    expect(a1.data.numberLine.text).toBe('1')
  })

  it('offers the inline name edit only while the box has no child diagram (double-click then opens the child)', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.context)
    expect(nodeLayoutOf<FunctionData>(layout, k.boxes(k.context)[0] as NodeView).regions).toEqual([])
    expect(nodeLayoutOf<FunctionData>(k.layoutOf(k.child), k.boxes(k.child)[0] as NodeView).regions).toHaveLength(1)
  })

  it('hides the DRE when showDre is off', () => {
    const k = exampleKit()
    const top = k.boxes(k.context)[0] as NodeView
    ;(top as View)['showDre'] = false
    expect(nodeLayoutOf<FunctionData>(k.layoutOf(k.context), top).data.dreLine).toBeNull()
  })

  it('wraps the name inside the box, grows to the minimum 120 x 64 and offers a name edit region', () => {
    const k = exampleKit()
    const view = k.boxes(k.child)[1] as NodeView
    view.width = 40
    view.height = 20
    const n = nodeLayoutOf<FunctionData>(k.layoutOf(k.child), view)
    expect(n.box.width).toBeGreaterThanOrEqual(120)
    expect(n.box.height).toBeGreaterThanOrEqual(64)
    expect(n.sizable).toBe('free')
    expect(n.outline).toBe('rect')
    expect(n.regions[0]?.target).toEqual({ kind: 'name', elementId: (view.model as Elem)._id })
    ;(view.model as Elem)['name'] = 'Check Credit and Stock Levels For Every Order Line'
    view.width = 120
    const wrapped = nodeLayoutOf<FunctionData>(k.layoutOf(k.child), view)
    expect(wrapped.data.nameLines.length).toBeGreaterThan(1)
    expect(wrapped.box.height).toBeGreaterThan(64)
    const widest = Math.max(...wrapped.data.nameLines.map((l) => measurer.measure(l.text, l.font).width))
    expect(widest).toBeLessThanOrEqual(wrapped.box.width - 8)
  })
})

describe('boundary port layout', () => {
  it('shows ICOM codes derived from the parent box and keeps ports on their area edge', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.child)
    const ports = k.child.ownedViews.filter((v) => v._type === 'IDEF0PortView')
    const codes = ports.map((p) => nodeLayoutOf<PortData>(layout, p).data.codeLine?.text)
    expect(codes).toEqual(['I1', 'C1', 'O1', 'M1'])
    const axes = ports.map((p) => nodeLayoutOf<PortData>(layout, p).moveAxis)
    expect(axes).toEqual(['vert', 'horz', 'vert', 'horz'])
    expect(nodeLayoutOf<PortData>(layout, ports[0] as View).data.anchor).toEqual({ x: 24, y: 154 })
    expect(nodeLayoutOf<PortData>(layout, ports[1] as View).sizable).toBe('none')
  })

  it('draws no codes on the A-0 diagram', () => {
    const k = exampleKit()
    const layout = k.layoutOf(k.context)
    for (const p of k.context.ownedViews.filter((v) => v._type === 'IDEF0PortView')) expect(nodeLayoutOf<PortData>(layout, p).data.codeLine).toBeNull()
  })

  it('flags a port with no parent arrow unless its arrow is tunneled', () => {
    const k = newKit()
    const kit = k
    const port = kit.repository.findByType('IDEF0Port')[0]
    expect(port).toBeUndefined()
    const ex = exampleKit()
    const view = ex.child.ownedViews.find((v) => v._type === 'IDEF0PortView') as View
    ;(view.model as Elem)['corresponds'] = null
    expect(nodeLayoutOf<PortData>(ex.layoutOf(ex.child), view).data.unlinked).toBe(true)
    const arrow = (ex.top['arrows'] as Elem[]).find((a) => a['source'] === view.model) as Elem
    arrow['tunnelSource'] = true
    expect(nodeLayoutOf<PortData>(ex.layoutOf(ex.child), view).data.unlinked).toBe(false)
  })
})

describe('frame and title block', () => {
  const frame = (k: ReturnType<typeof exampleKit>, d: Diagram) => k.layoutOf(d).nodes.get(d.ownedViews[0]!._id)!

  it('is a fixed 1008 x 752 sheet at (8, 8) behind everything, hit only on its bands', () => {
    const k = exampleKit()
    const f = frame(k, k.child)
    expect(f.box).toEqual({ left: 8, top: 8, width: 1008, height: 752 })
    expect(f.zIndex).toBe(-1)
    expect(f.sizable).toBe('none')
    expect(f.movable).toBe(false)
    expect(f.hitAreas?.some((r) => r.top === 8 && r.height === 40)).toBe(true)
    expect(f.hitAreas?.every((r) => r.top < 48 || r.top >= 640 || r.top >= 712)).toBe(true)
  })

  it('fills node, title and context cells: reference, detailed box name, thumbnail of the parent', () => {
    const k = exampleKit()
    const d = frame(k, k.child).data as FrameData
    const text = (caption: string) => d.cells.find((c) => c.caption.text === caption)?.value?.text
    expect(text('NODE')).toBe('OM/A0')
    expect(text('TITLE')).toBe('Process Customer Order')
    expect(text('AUTHOR')).toBe('A. Analyst')
    expect(text('PROJECT')).toBe('Order Handling')
    expect(d.thumbnail?.boxes).toHaveLength(1)
    expect(d.thumbnail?.highlight).not.toBeNull()
    expect(d.contextTop).toBeNull()
    const a0 = frame(k, k.context).data as FrameData
    expect(a0.contextTop?.text).toBe('TOP')
    expect(a0.thumbnail).toBeNull()
    expect(a0.cells.find((c) => c.caption.text === 'NODE')?.value?.text).toBe('OM/A-0')
  })

  it('shows the purpose and viewpoint on A-0 only, with multiline edit regions on the model', () => {
    const k = exampleKit()
    const f = frame(k, k.context)
    expect((f.data as FrameData).purposeLines.map((l) => l.text).join(' ')).toContain('PURPOSE: Describe how a customer order')
    expect((f.data as FrameData).purposeLines.some((l) => l.text.startsWith('VIEWPOINT: Order desk supervisor'))).toBe(true)
    const targets = f.regions.map((r) => r.target)
    expect(targets).toContainEqual({ kind: 'field', elementId: k.model._id, field: 'purpose' })
    expect(targets).toContainEqual({ kind: 'field', elementId: k.model._id, field: 'viewpoint' })
    expect(f.regions.filter((r) => r.multiline)).toHaveLength(2)
    expect(frame(k, k.child).regions.some((r) => r.multiline)).toBe(false)
  })

  it('edits author, date and number as fields of the diagram', () => {
    const k = exampleKit()
    const fields = frame(k, k.child).regions.map((r) => r.target)
    for (const field of ['author', 'date', 'number']) expect(fields).toContainEqual({ kind: 'field', elementId: k.child._id, field })
  })

  it('marks exactly the current stage for each of the four statuses', () => {
    for (const status of ['working', 'draft', 'recommended', 'publication']) {
      const k = exampleKit()
      k.child['status'] = status
      const stages = (frame(k, k.child).data as FrameData).stages
      expect(stages.map((s) => s.line.text)).toEqual(['WORKING', 'DRAFT', 'RECOMMENDED', 'PUBLICATION'])
      expect(stages.filter((s) => s.current).map((s) => s.line.text)).toEqual([status.toUpperCase()])
    }
  })

  it('hides the working band or the whole title block on request', () => {
    const k = exampleKit()
    k.child['showWorkingBand'] = false
    let d = frame(k, k.child).data as FrameData
    expect(d.cells.map((c) => c.caption.text)).toEqual(['NODE', 'TITLE', 'NUMBER'])
    k.child['showTitleBlock'] = false
    d = frame(k, k.child).data as FrameData
    expect(d.cells).toHaveLength(0)
  })

  it('falls back to the project author and exports with the frame included', () => {
    const k = exampleKit()
    k.child['author'] = ''
    ;(k.repository.project as Elem)['author'] = 'P. Owner'
    expect(((frame(k, k.child).data as FrameData).cells.find((c) => c.caption.text === 'AUTHOR')?.value?.text)).toBe('P. Owner')
    const svg = renderDiagramSvg(k.child, k.repository, measurer).svg
    expect(svg).toContain('OM/A0')
    expect(svg).toContain('WORKING')
  })
})

describe('slots and labels', () => {
  it('spreads n = 1..5 input arrows evenly along the left side, ordered by the other end', () => {
    for (let n = 1; n <= 5; n++) {
      const k = newKit()
      const [a1] = k.boxes(k.child) as [NodeView]
      const box = k.layoutOf(k.child).nodes.get(a1._id)!.box
      // Ports are created bottom-up so the slot order has to come from the other end, not the list order.
      for (let i = n - 1; i >= 0; i--) {
        const plan = planIdef0Arrow({ diagram: k.child, tail: null, head: a1, role: 'input', at: { x: 0, y: 100 + i * 40 }, name: `In${i}` })
        k.engine.transact('Create', (b) => applyPlan(b, plan))
      }
      const layout = k.layoutOf(k.child)
      const ys = k.child.ownedViews
        .filter((v) => v._type === 'IDEF0ArrowView' && (v.model as Elem)['role'] === 'input' && (v as never as { head: View }).head === a1)
        .map((v) => edgeLayoutOf(layout, v).points.at(-1)!.y)
        .sort((a, b) => a - b)
      expect(ys).toHaveLength(n)
      expect(ys.map((y) => y - box.top)).toEqual(slotOffsets(box.height, n))
    }
  })

  it('places an arrow label above the longest horizontal run and is deterministic', () => {
    const k = exampleKit()
    const view = arrowView(k.child, 'Customer Order')
    const a = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view)
    const b = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view)
    expect(a.labels[0]?.box).toEqual(b.labels[0]?.box)
    const label = a.labels[0]!
    expect(label.text).toBe('Customer Order')
    expect(label.box.top + label.box.height).toBeLessThanOrEqual(154)
    expect(label.edit).toEqual({ kind: 'name', elementId: (view.model as Elem)._id })
    expect(a.data.squiggle).toBeNull()
  })

  it('places a label right of a vertical run and links a dragged-away label with a squiggle', () => {
    const k = exampleKit()
    const view = arrowView(k.child, 'Order Staff')
    const vertical = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view).labels[0]!
    expect(vertical.box.left).toBeGreaterThan(204)
    const lv = (view as never as { nameLabel: View }).nameLabel
    lv['distance'] = 60
    const moved = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view)
    expect(moved.data.squiggle).not.toBeNull()
    expect(moved.data.squiggle!.length).toBeGreaterThan(4)
    view['showSquiggle'] = false
    expect(edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view).data.squiggle).toBeNull()
  })

  it('retracts a tunneled end and frames it with two parentheses', () => {
    const k = exampleKit()
    const view = arrowView(k.child, 'Validated Order')
    const plain = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view)
    ;(view.model as Elem)['tunnelTarget'] = true
    const tunneled = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), view)
    expect(tunneled.data.tunnels).toHaveLength(1)
    expect(tunneled.data.tunnels[0]?.paths).toHaveLength(2)
    expect(tunneled.points.at(-1)!.x).toBe(plain.points.at(-1)!.x - 10)
    expect(tunneled.points[0]).toEqual(plain.points[0])
  })

  it('draws a call arrow as a 24-long stub down from the bottom with the called reference as label', () => {
    const k = exampleKit()
    const [a1, a2] = k.boxes(k.child) as [NodeView, NodeView]
    const call = createEdge(k.engine, { kind: 'IDEF0Call', diagram: k.child, tail: a1, head: a2 })
    ;(a1.model as Elem)['calledFunction'] = a2.model
    const layout = edgeLayoutOf<ArrowData>(k.layoutOf(k.child), call.view as View)
    expect(layout.points).toHaveLength(2)
    expect(layout.points[1]!.y - layout.points[0]!.y).toBe(24)
    expect(layout.points[1]!.x).toBe(layout.points[0]!.x)
    expect(layout.labels[0]?.text).toBe('OM/A2')
    expect(layout.labels[0]?.edit).toMatchObject({ kind: 'custom', syntax: 'idef0.call' })
  })

  it('refuses a second box on the A-0 sheet', () => {
    const k = exampleKit()
    expect(createNodeAt(k.envOf(k.context), k.layoutOf(k.context), 'IDEF0Function', { left: 100, top: 100, width: 0, height: 0 })).toBeNull()
  })
})
