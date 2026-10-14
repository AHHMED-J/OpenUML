import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ModelEngine } from '../../commands'
import { readMdj, writeMdj } from '../../format'
import {
  IDEF0_SHEET,
  SHEET_PRESETS,
  frameViewOf,
  matchingSheetPreset,
  sheetMinimumOf,
  sheetPreset,
  sheetSizeOf,
  type Diagram,
  type Elem,
  type NodeView,
  type View
} from '../../model'
import { SELECTION, rectContainsPoint, resizeHandles, type Point, type Rect } from '../core'
import { resizeNode, type DiagramEnv } from '../editor/actions'
import { hitTestDiagram } from '../editor/hitTest'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import type { DiagramLayout } from '../layout/types'
import { ensureNotations } from '../notations'
import { areaRectOf } from './geometry'
import type { FrameData } from './layout'
import { fitSheetToContent, setSheetSize } from './sheet'
import { measurer } from './testkit'

const EXAMPLE = readFileSync(new URL('../../../../../examples/software-release-idef0.mdj', import.meta.url), 'utf8')

interface Loaded {
  readonly engine: ModelEngine
  readonly diagrams: Diagram[]
  readonly a0: Diagram
  readonly env: (d: Diagram) => DiagramEnv
  readonly layout: (d: Diagram) => DiagramLayout
}

function loadExample(text = EXAMPLE): Loaded {
  ensureNotations()
  const repository = readMdj(text).repository
  const engine = new ModelEngine(repository)
  const diagrams = repository.diagrams().filter((d) => d._type === 'IDEF0Diagram') as Diagram[]
  return {
    engine,
    diagrams,
    a0: diagrams.find((d) => d['diagramKind'] === 'context') as Diagram,
    env: (diagram) => ({ engine, diagram, measurer }),
    layout: (diagram) => computeDiagramLayout(diagram, repository, measurer)
  }
}

const frameOf = (d: Diagram): NodeView => frameViewOf(d) as NodeView
const frameLayout = (l: DiagramLayout, d: Diagram) => l.nodes.get(frameOf(d)._id)!
const portViews = (d: Diagram, role: string): NodeView[] => d.ownedViews.filter((v) => v._type === 'IDEF0PortView' && (v.model as Elem)['role'] === role) as NodeView[]
const center = (v: NodeView): Point => ({ x: v.left + v.width / 2, y: v.top + v.height / 2 })
const inside = (r: Rect, p: Point, tol = 0.5): boolean => p.x >= r.left - tol && p.x <= r.left + r.width + tol && p.y >= r.top - tol && p.y <= r.top + r.height + tol

describe('IDEF0 sheet: older files', () => {
  it('draws a stored 1008 x 752 frame exactly as before: same box, cells, minimum and file', () => {
    const ex = loadExample()
    expect(ex.diagrams).toHaveLength(3)
    for (const d of ex.diagrams) {
      const f = frameLayout(ex.layout(d), d)
      expect(f.box).toEqual({ left: 8, top: 8, width: 1008, height: 752 })
      expect(f.minWidth).toBe(1008)
      expect(f.minHeight).toBe(752)
      const data = f.data as FrameData
      expect(data.cells.map((c) => [c.caption.text, c.rect.left, c.rect.width])).toEqual([
        ['AUTHOR', 8, 160],
        ['DATE', 168, 96],
        ['PROJECT', 264, 192],
        ['STATUS', 456, 304],
        ['CONTEXT', 760, 256],
        ['NODE', 8, 160],
        ['TITLE', 168, 688],
        ['NUMBER', 856, 160]
      ])
      expect(areaRectOf(d)).toEqual({ left: 24, top: 64, width: 976, height: 632 })
      expect(matchingSheetPreset(d)?.id).toBe('default')
    }
    // Loading and saving changes nothing.
    expect(writeMdj(ex.engine.repository.project as Elem)).toBe(writeMdj(readMdj(EXAMPLE).project as Elem))
  })

  it('draws a frame without a stored size (or a smaller one) at the default size', () => {
    const ex = loadExample()
    const frame = frameOf(ex.a0)
    delete (frame as Partial<NodeView>).width
    delete (frame as Partial<NodeView>).height
    expect(frameLayout(ex.layout(ex.a0), ex.a0).box).toEqual({ left: 8, top: 8, width: 1008, height: 752 })
    frame.width = 400
    frame.height = 300
    expect(frameLayout(ex.layout(ex.a0), ex.a0).box).toEqual({ left: 8, top: 8, width: 1008, height: 752 })
    expect(sheetSizeOf(ex.a0)).toEqual({ width: 1008, height: 752 })
  })
})

describe('IDEF0 sheet: resizing the frame', () => {
  it('offers only the right, bottom and bottom-right handles and never moves', () => {
    const ex = loadExample()
    const f = frameLayout(ex.layout(ex.a0), ex.a0)
    expect(f.sizable).toBe('grow')
    expect(f.movable).toBe(false)
    expect(resizeHandles(f.box, f.sizable).map((h) => h.position)).toEqual(['e', 'se', 's'])
  })

  it('stores the dragged size on the frame view, moves output and mechanism ports to the new edges and round-trips', () => {
    const ex = loadExample()
    const a0 = ex.diagrams.find((d) => d['diagramKind'] !== 'context' && portViews(d, 'output').length > 0) as Diagram
    const inputsBefore = portViews(a0, 'input').map((v) => ({ left: v.left, top: v.top }))
    const outputsBefore = portViews(a0, 'output').map((v) => center(v).y)
    resizeNode(ex.env(a0), frameOf(a0)._id, { left: 8, top: 8, width: 1400, height: 1000 })
    expect(frameOf(a0)).toMatchObject({ left: 8, top: 8, width: 1400, height: 1000 })
    const area = areaRectOf(a0)
    expect(area).toEqual({ left: 24, top: 64, width: 1368, height: 880 })
    // Output ports slide to the right edge (keeping their height), mechanisms to the bottom edge.
    expect(portViews(a0, 'output').map((v) => center(v))).toEqual(outputsBefore.map((y) => ({ x: 1392, y })))
    for (const v of portViews(a0, 'mechanism')) expect(center(v).y).toBe(944)
    expect(portViews(a0, 'input').map((v) => ({ left: v.left, top: v.top }))).toEqual(inputsBefore)

    const reread = readMdj(writeMdj(ex.engine.repository.project as Elem)).repository
    const again = reread.get(a0._id) as Diagram
    expect(frameViewOf(again)).toMatchObject({ width: 1400, height: 1000 })
    const layout = computeDiagramLayout(again, reread, measurer)
    expect(frameLayout(layout, again).box).toEqual({ left: 8, top: 8, width: 1400, height: 1000 })
  })

  it('keeps every arrow and port inside the larger drawing area; boundary arrows reach its edges', () => {
    const ex = loadExample()
    for (const d of ex.diagrams) {
      setSheetSize(ex.env(d), { width: 2016, height: 1424 })
      const area = areaRectOf(d)
      expect(area).toEqual({ left: 24, top: 64, width: 1984, height: 1304 })
      const layout = ex.layout(d)
      for (const v of d.ownedViews.filter((x) => x._type === 'IDEF0PortView') as NodeView[]) expect(inside(area, center(v))).toBe(true)
      for (const [, edge] of layout.edges) for (const p of edge.points) expect(inside(area, p, 2)).toBe(true)
      // Arrows ending on an output port end on the new right edge.
      if (d['diagramKind'] !== 'context') expect(portViews(d, 'output').length).toBeGreaterThan(0)
      for (const v of portViews(d, 'output')) {
        const arrow = d.ownedViews.find((x) => x._type === 'IDEF0ArrowView' && (x as View)['head'] === v)
        if (arrow) expect(layout.edges.get(arrow._id)?.points.at(-1)?.x).toBeGreaterThan(2000 - 8)
      }
    }
  })

  it('stretches the title block cells in proportion and keeps the bands at the sheet edges', () => {
    const ex = loadExample()
    setSheetSize(ex.env(ex.a0), { width: 2016, height: 1424 })
    const data = frameLayout(ex.layout(ex.a0), ex.a0).data as FrameData
    expect(data.sheet).toEqual({ left: 8, top: 8, width: 2016, height: 1424 })
    expect(data.bands.map((b) => [b.top, b.width, b.height])).toEqual([
      [8, 2016, 40],
      [8 + 1424 - 48, 2016, 48]
    ])
    expect(data.cells.map((c) => [c.caption.text, c.rect.width])).toEqual([
      ['AUTHOR', 320],
      ['DATE', 192],
      ['PROJECT', 384],
      ['STATUS', 608],
      ['CONTEXT', 512],
      ['NODE', 320],
      ['TITLE', 1376],
      ['NUMBER', 320]
    ])
    // Text keeps its size; the A-0 purpose and viewpoint stay in the lower-left of the area.
    expect(data.cells[0]?.value?.font.size).toBe(12)
    expect(data.purposeLines[0]?.box.top).toBe(64 + 1304 - 56)
  })

  it('never gets smaller than the default sheet or than the content plus margins', () => {
    const ex = loadExample()
    expect(sheetMinimumOf(ex.a0)).toEqual({ width: IDEF0_SHEET.width, height: IDEF0_SHEET.height })
    expect(setSheetSize(ex.env(ex.a0), { width: 300, height: 200 })).toBe(false)
    expect(sheetSizeOf(ex.a0)).toEqual({ width: 1008, height: 752 })
    // A box moved past the drawing area raises the minimum (rounded up to the grid).
    const box = ex.a0.ownedViews.find((v) => v._type === 'IDEF0FunctionView') as NodeView
    box.left = 1100
    box.top = 700
    const min = sheetMinimumOf(ex.a0)
    expect(min.width).toBe(Math.ceil((1100 + box.width + 48 + 16 - 8) / 8) * 8)
    expect(min.height).toBe(Math.ceil((700 + box.height + 48 + 64 - 8) / 8) * 8)
    expect(frameLayout(ex.layout(ex.a0), ex.a0)).toMatchObject({ minWidth: min.width, minHeight: min.height })
    setSheetSize(ex.env(ex.a0), { width: 1008, height: 752 })
    expect(sheetSizeOf(ex.a0)).toEqual(min)
  })

  it('is one undo step that restores the file exactly', () => {
    const ex = loadExample()
    const before = writeMdj(ex.engine.repository.project as Elem)
    const child = ex.diagrams.find((d) => d['diagramKind'] !== 'context') as Diagram
    const depth = ex.engine.undoDepth
    resizeNode(ex.env(child), frameOf(child)._id, { left: 8, top: 8, width: 1600, height: 1200 })
    expect(ex.engine.undoDepth).toBe(depth + 1)
    ex.engine.undo()
    expect(writeMdj(ex.engine.repository.project as Elem)).toBe(before)
    setSheetSize(ex.env(child), sheetPreset('tabloid-portrait')!)
    expect(ex.engine.undoDepth).toBe(depth + 1)
    ex.engine.undo()
    expect(writeMdj(ex.engine.repository.project as Elem)).toBe(before)
  })
})

describe('IDEF0 sheet: selection', () => {
  it('a press on empty canvas inside the drawing area hits nothing (rubber band); the border and bands select the frame', () => {
    const ex = loadExample()
    setSheetSize(ex.env(ex.a0), { width: 1600, height: 1200 })
    const layout = ex.layout(ex.a0)
    const id = frameOf(ex.a0)._id
    const none = new Set<string>()
    expect(hitTestDiagram(layout, { x: 1300, y: 1000 }, { selected: none, zoom: 1 })).toBeNull()
    expect(hitTestDiagram(layout, { x: 60, y: 300 }, { selected: none, zoom: 1 })).toBeNull()
    expect(hitTestDiagram(layout, { x: 10, y: 600 }, { selected: none, zoom: 1 })).toMatchObject({ kind: 'node', viewId: id })
    expect(hitTestDiagram(layout, { x: 1606, y: 600 }, { selected: none, zoom: 1 })).toMatchObject({ kind: 'node', viewId: id })
    // The AUTHOR value stays an inline edit region.
    const hit = hitTestDiagram(layout, { x: 40, y: 30 }, { selected: none, zoom: 1 })
    expect(hit).toMatchObject({ kind: 'node', viewId: id })
    expect(hit?.kind === 'node' ? hit.region?.target : null).toMatchObject({ kind: 'field', field: 'author' })
    // Once selected, the bottom-right handle resizes it.
    const se = resizeHandles(frameLayout(layout, ex.a0).box, 'grow', 1, SELECTION.handleSize).find((h) => h.position === 'se')!
    const p = { x: se.rect.left + se.rect.width / 2, y: se.rect.top + se.rect.height / 2 }
    expect(rectContainsPoint(se.rect, p)).toBe(true)
    expect(hitTestDiagram(layout, p, { selected: new Set([id]), zoom: 1 })).toMatchObject({ kind: 'handle', viewId: id, handle: 'se' })
  })
})

describe('IDEF0 sheet: presets', () => {
  it('has the default sheet and Letter, Legal, Tabloid/Ledger, A4 and A3 in both orientations, at the paper proportions', () => {
    const paper: Record<string, number> = { letter: 279.4 / 215.9, legal: 355.6 / 215.9, tabloid: 431.8 / 279.4, a4: 297 / 210, a3: 420 / 297 }
    expect(SHEET_PRESETS[0]).toMatchObject({ id: 'default', width: 1008, height: 752 })
    expect(SHEET_PRESETS).toHaveLength(11)
    for (const p of SHEET_PRESETS.slice(1)) {
      const [name, orientation] = p.id.split('-') as [string, string]
      expect(p.width % 8 + (p.height % 8)).toBe(0)
      expect(Math.min(p.width, p.height)).toBeGreaterThanOrEqual(1008)
      expect(orientation === 'landscape' ? p.width > p.height : p.width < p.height).toBe(true)
      expect(Math.max(p.width, p.height) / Math.min(p.width, p.height)).toBeCloseTo(paper[name] as number, 1)
    }
    expect(sheetPreset('a3-landscape')).toMatchObject({ width: 2016, height: 1424 })
    expect(sheetPreset('a4-portrait')).toMatchObject({ width: 1008, height: 1424 })
  })

  it('Fit to Content grows a sheet whose content outgrew it and shrinks an oversized one to the content', () => {
    const ex = loadExample()
    const child = ex.diagrams.find((d) => d['diagramKind'] !== 'context') as Diagram
    setSheetSize(ex.env(child), { width: 3000, height: 3000 })
    const box = child.ownedViews.find((v) => v._type === 'IDEF0FunctionView') as NodeView
    box.left = 1500
    expect(fitSheetToContent(ex.env(child))).toBe(true)
    expect(sheetSizeOf(child)).toEqual(sheetMinimumOf(child))
    expect(sheetSizeOf(child).width).toBeGreaterThan(1500)
    expect(sheetSizeOf(child).height).toBe(752)
  })
})
