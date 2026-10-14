import { describe, expect, it } from 'vitest'
import { readMdj, writeMdj } from '../../format'
import { effectiveArrowName, shownArrowName, trunkOf, type Diagram, type Elem, type NodeView, type View } from '../../model'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { applyQuickEdit } from '../editor/quickEditApply'
import { addChildBoxes } from './boxCount'
import { decomposeFunction } from './decompose'
import type { ArrowData } from './edges'
import { createIdef0Edge } from './gestures'
import { measurer, newKit, type IdefKit } from './testkit'
import { validateIdef0 } from './validate'

const arrowsOf = (scope: Elem): Elem[] => (scope['arrows'] as Elem[]) ?? []
const viewOfArrow = (k: IdefKit, arrow: Elem): View => k.repository.viewsOf(arrow).find((v) => v._type === 'IDEF0ArrowView') as View

/** Draws an arrow from empty canvas at `from` to the `side` of `box`; returns its model. */
function boundaryArrow(k: IdefKit, box: NodeView, side: 'top' | 'bottom'): Elem {
  const x = box.left + box.width / 2
  const press = { x, y: side === 'top' ? 40 : 1000 }
  const release = { x, y: side === 'top' ? box.top + 2 : box.top + box.height - 2 }
  const id = createIdef0Edge(k.envOf(k.child), k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, null, box._id, press, release)
  if (!id) throw new Error('arrow not created')
  return (k.repository.get(id) as View).model as Elem
}

/** Forks `trunk` to the `side` of `box`; returns the branch. */
function branch(k: IdefKit, trunk: Elem, box: NodeView, side: 'top' | 'bottom'): Elem {
  const trunkView = viewOfArrow(k, trunk)
  const points = k.layoutOf(k.child).edges.get(trunkView._id)!.points
  const x = box.left + box.width / 2
  const press = points[0]!.x === points[1]!.x ? { x: points[0]!.x, y: (points[0]!.y + points[1]!.y) / 2 } : { x: (points[0]!.x + points[1]!.x) / 2, y: points[0]!.y }
  const release = { x, y: side === 'top' ? box.top + 2 : box.top + box.height - 2 }
  const id = createIdef0Edge(k.envOf(k.child), k.layoutOf(k.child), { kind: 'IDEF0Arrow' }, trunkView._id, box._id, press, release)
  if (!id) throw new Error('branch not created')
  return (k.repository.get(id) as View).model as Elem
}

/**
 * The structure of the user's file: a 6-box A0 diagram, a control "Shipping rates" and a
 * mechanism "warehouse staff" entering from the boundary, each forked to A5, and A5 decomposed
 * into 2 boxes. The arrows reaching A5 are the unlabeled branches.
 */
function userKit() {
  const k = newKit()
  addChildBoxes(k.envOf(k.child), 3)
  const boxes = k.boxes(k.child)
  const rates = boundaryArrow(k, boxes[0]!, 'top')
  applyQuickEdit(k.engine, { kind: 'name', elementId: rates._id }, 'Shipping rates')
  const staff = boundaryArrow(k, boxes[3]!, 'bottom')
  applyQuickEdit(k.engine, { kind: 'name', elementId: staff._id }, 'warehouse staff')
  const ratesBranch = branch(k, rates, boxes[4]!, 'top')
  const staffBranch = branch(k, staff, boxes[4]!, 'bottom')
  const a5 = boxes[4]!.model as Elem
  return { k, rates, staff, ratesBranch, staffBranch, a5 }
}

describe('labels inherited by child boundary arrows (unlabeled parent branches)', () => {
  it('builds the user structure: the arrows reaching A5 are unlabeled branches', () => {
    const { k, rates, staff, ratesBranch, staffBranch, a5 } = userKit()
    expect(k.boxes(k.child)).toHaveLength(6)
    expect(trunkOf(ratesBranch)).toBe(rates)
    expect(trunkOf(staffBranch)).toBe(staff)
    expect([ratesBranch['target'], staffBranch['target']]).toEqual([a5, a5])
    expect([ratesBranch['name'], staffBranch['name']]).toEqual(['', ''])
    expect([effectiveArrowName(ratesBranch), effectiveArrowName(staffBranch)]).toEqual(['Shipping rates', 'warehouse staff'])
  })

  it('labels the boundary arrows of the decomposition with the inherited labels (no W05/W07)', () => {
    const { k, ratesBranch, staffBranch, a5 } = userKit()
    const child = decomposeFunction(k.engine, a5, 2) as Diagram
    const boundary = (parent: Elem): Elem => arrowsOf(a5).find((a) => (a['source'] as Elem)['corresponds'] === parent) as Elem
    expect(boundary(ratesBranch)['name']).toBe('Shipping rates')
    expect(boundary(staffBranch)['name']).toBe('warehouse staff')
    const childIssues = validateIdef0(k.model).filter((i) => i.diagramId === child._id).map((i) => i.id)
    expect(childIssues).not.toContain('W05')
    expect(childIssues).not.toContain('W07')
    // The 2-box decomposition is still reported (W01).
    expect(childIssues).toContain('W01')
  })

  it('shows the inherited label for files whose boundary arrows were saved unlabeled', () => {
    const { k, ratesBranch, a5 } = userKit()
    const child = decomposeFunction(k.engine, a5, 2) as Diagram
    // What an older version wrote: the branch's own (empty) name.
    for (const a of arrowsOf(a5)) if (a['name'] === 'Shipping rates' || a['name'] === 'warehouse staff') a['name'] = ''
    const text = writeMdj(k.repository.project as Elem)
    const { repository } = readMdj(text)
    const loadedA5 = repository.get(a5._id) as Elem
    const loadedChild = repository.get(child._id) as Diagram
    const trunk = arrowsOf(loadedA5).find((a) => (a['source'] as Elem)['corresponds'] === repository.get(ratesBranch._id)) as Elem
    expect(trunk['name']).toBe('')
    expect(shownArrowName(trunk)).toBe('Shipping rates')
    // The child's fork of the control (to its second box) shares the inherited label without drawing it.
    const fork = arrowsOf(loadedA5).find((a) => a['source'] === trunk) as Elem
    expect(shownArrowName(fork)).toBe('')
    expect(effectiveArrowName(fork)).toBe('Shipping rates')
    // Drawn on the child diagram.
    const layout = computeDiagramLayout(loadedChild, repository, measurer)
    const view = repository.viewsOf(trunk).find((v) => v._type === 'IDEF0ArrowView') as View
    expect(layout.edges.get(view._id)!.labels.map((l) => l.text)).toEqual(['Shipping rates'])
    expect((layout.edges.get(view._id)!.data as ArrowData).role).toBe('control')
    // Validated as labeled; the file itself is not modified by loading.
    const model = repository.get(k.model._id) as Elem
    const issues = validateIdef0(model).filter((i) => i.diagramId === child._id).map((i) => i.id)
    expect(issues).not.toContain('W05')
    expect(issues).not.toContain('W07')
    expect(writeMdj(repository.project as Elem)).toBe(text)
  })

  it('relabels the child boundary arrow when the trunk is renamed, in one undo step', () => {
    const { k, rates, ratesBranch, a5 } = userKit()
    decomposeFunction(k.engine, a5, 2)
    const onChild = arrowsOf(a5).find((a) => (a['source'] as Elem)['corresponds'] === ratesBranch) as Elem
    const before = writeMdj(k.repository.project as Elem)
    const depth = k.engine.undoDepth
    expect(applyQuickEdit(k.engine, { kind: 'name', elementId: rates._id }, 'Carrier rates')).toBe(true)
    expect(k.engine.undoDepth).toBe(depth + 1)
    expect(onChild['name']).toBe('Carrier rates')
    // The branch keeps no label of its own: it still shares its trunk's.
    expect(ratesBranch['name']).toBe('')
    // The A-0 counterpart of the trunk follows as before.
    const onContext = arrowsOf(k.model).find((a) => a['name'] === 'Carrier rates')
    expect(onContext).toBeDefined()
    k.engine.undo()
    expect(writeMdj(k.repository.project as Elem)).toBe(before)
  })
})
