import { describe, expect, it } from 'vitest'
import { addAttribute } from '../commands'
import { isKindOf, type EdgeView, type Elem, type NodeView, type UMLClassifierView, type View } from '../model'
import { copyViews, duplicateViews, parseClipboard, pasteViews, serializeClipboard } from './clipboard'
import { createNodeAt, moveSelection } from './editor/actions'
import { testDiagram } from './testUtils'

describe('view clipboard', () => {
  it('pastes new views (fresh IDs, remapped internal references) of the same model elements', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    addAttribute(t.engine, a.model as Elem, { name: 'x' })
    const e = t.edge('Association', a, b) as EdgeView
    const payload = copyViews(t.repository, t.diagram, [a._id, b._id, e._id], t.layout())
    expect(payload).not.toBeNull()
    const text = serializeClipboard(payload!)
    const parsed = parseClipboard(text)
    expect(parsed?.outerRefs).toEqual(expect.arrayContaining([(a.model as Elem)._id, (b.model as Elem)._id, (e.model as Elem)._id]))

    const before = t.diagram.ownedViews.length
    const ids = pasteViews(t.engine, t.diagram, parsed!, { x: 500, y: 300 })
    expect(ids).toHaveLength(3)
    expect(t.diagram.ownedViews.length).toBe(before + 3)
    const pasted = ids.map((id) => t.repository.get(id) as View)
    const [pa, pb, pe] = pasted as [NodeView, NodeView, EdgeView]
    // New IDs, same models.
    expect(ids).not.toContain(a._id)
    expect(pa.model).toBe(a.model)
    expect(pb.model).toBe(b.model)
    expect(pe.model).toBe(e.model)
    // The edge connects the pasted views, not the originals.
    expect(pe.tail).toBe(pa)
    expect(pe.head).toBe(pb)
    // Sub-views were remapped: compartments are the copy's own, item views show the same attribute.
    const compartment = (pa as UMLClassifierView).attributeCompartment as NodeView
    expect(compartment._parent).toBe(pa)
    expect(compartment).not.toBe((a as UMLClassifierView).attributeCompartment)
    expect(compartment.subViews[0]?.model).toBe((a.model as Elem)['attributes'] && ((a.model as Elem)['attributes'] as Elem[])[0])
    // Edge labels point at the pasted edge.
    expect((pe['nameLabel'] as View)['hostEdge']).toBe(pe)
    // Centered on the target point (copied bounds 0..400 × 0..60 → center 200, 30).
    expect(pa.left).toBe(300)
    expect(pa.top).toBe(270)
    // One undo step.
    t.engine.undo()
    expect(t.diagram.ownedViews.length).toBe(before)
  })

  it('drops edges whose ends are not copied and outer container references', () => {
    const t = testDiagram()
    const pkg = t.node('Package', 0, 0, 400, 300)
    const a = t.node('Class', 20, 40, 100, 60)
    const b = t.node('Class', 200, 40, 100, 60)
    moveSelection(t, [a._id], 0, 0, { container: pkg })
    expect(a.containerView).toBe(pkg)
    const e = t.edge('Dependency', a, b)
    const payload = copyViews(t.repository, t.diagram, [a._id, e._id], t.layout())!
    expect(payload.views).toHaveLength(1)
    expect(payload.views[0]?.['containerView']).toBeUndefined()
    const [id] = pasteViews(t.engine, t.diagram, payload)
    const copy = t.repository.get(id) as View
    expect(copy.containerView).toBeNull()
    expect(pkg.containedViews).not.toContain(copy)
  })

  it('refuses to paste when a copied model element was deleted', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0)
    const payload = copyViews(t.repository, t.diagram, [a._id])!
    t.engine.transact('delete', (b) => {
      b.remove(a)
      b.remove(a.model as Elem)
    })
    expect(() => pasteViews(t.engine, t.diagram, payload)).toThrow(/no longer exist/)
  })

  it('duplicates models and the relationships between them', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    addAttribute(t.engine, a.model as Elem, { name: 'x' })
    const e = t.edge('Generalization', a, b)
    const owner = (a.model as Elem)._parent as Elem
    const ownedBefore = (owner['ownedElements'] as Elem[]).length
    const ids = duplicateViews(t.engine, t.diagram, [a._id, b._id, e._id])
    expect(ids).toHaveLength(3)
    const [da, db, de] = ids.map((id) => t.repository.get(id) as View) as [NodeView, NodeView, EdgeView]
    expect(da.model).not.toBe(a.model)
    expect(da.model?.['name']).toBe('Class1')
    expect(((da.model as Elem)['attributes'] as Elem[])[0]?.['name']).toBe('x')
    expect((owner['ownedElements'] as Elem[]).length).toBe(ownedBefore + 2)
    expect(de.tail).toBe(da)
    expect(de.head).toBe(db)
    const gen = de.model as Elem
    expect(isKindOf(gen, 'UMLGeneralization')).toBe(true)
    expect(gen['source']).toBe(da.model)
    expect(gen['target']).toBe(db.model)
    expect(gen._parent).toBe(da.model)
    expect(da.left).toBe((a as NodeView).left + 20)
    t.engine.undo()
    expect((owner['ownedElements'] as Elem[]).length).toBe(ownedBefore)
  })

  it('duplicates a model nested in another duplicated model only once, inside the copy of its owner', () => {
    const t = testDiagram()
    const pkg = t.node('Package', 0, 0, 400, 300)
    const cls = t.repository.get(createNodeAt(t, t.layout(), 'Class', { left: 40, top: 60, width: 120, height: 80 }) as string) as View
    expect(cls.model?._parent).toBe(pkg.model)
    const ids = duplicateViews(t.engine, t.diagram, [pkg._id, cls._id])
    const classes = t.repository.findByType('UMLClass')
    expect(classes).toHaveLength(2)
    const pkgCopy = ids.map((id) => t.repository.get(id) as View).find((v) => isKindOf(v.model, 'UMLPackage'))
    const clsCopy = ids.map((id) => t.repository.get(id) as View).find((v) => isKindOf(v.model, 'UMLClass'))
    expect(clsCopy?.model?._parent).toBe(pkgCopy?.model)
    for (const c of classes) expect(t.repository.viewsOf(c)).toHaveLength(1)
  })
})
