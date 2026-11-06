import { describe, expect, it } from 'vitest'
import { addAttribute } from '../commands'
import { isKindOf, type EdgeView, type Elem, type NodeView, type UMLClassifierView, type View } from '../model'
import { diagramCanHostView } from '../ui/toolbox/palettes'
import { createDiagram, createNode } from '../commands'
import { copyViews, duplicateViews, parseClipboard, pasteViews, PasteError, serializeClipboard } from './clipboard'
import { createNodeAt, moveSelection } from './editor/actions'
import { testDiagram } from './testUtils'
import { FixedWidthTextMeasurer } from './core'
import { decomposeFunction } from './idef0/decompose'
import { createIdef0Edge } from './idef0/gestures'
import { computeDiagramLayout } from './layout/layoutDiagram'
import { newKit } from './idef0/testkit'
import { validateIdef0 } from './idef0/validate'

describe('view clipboard', () => {
  it('pastes new, independent elements (fresh IDs, remapped references) with views of them', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    addAttribute(t.engine, a.model as Elem, { name: 'x' })
    const e = t.edge('Association', a, b) as EdgeView
    const payload = copyViews(t.repository, t.diagram, [a._id, b._id, e._id], t.layout())
    expect(payload).not.toBeNull()
    const text = serializeClipboard(payload!)
    const parsed = parseClipboard(text)
    // The models travel with the views; only their owner is referenced from outside.
    expect(parsed?.models?.map((m) => m.json['_type'])).toEqual(['UMLClass', 'UMLClass', 'UMLAssociation'])
    const owner = (a.model as Elem)._parent as Elem
    expect(parsed?.outerRefs).toContain(owner._id)
    expect(parsed?.outerRefs).not.toContain((a.model as Elem)._id)

    const before = t.diagram.ownedViews.length
    const ownedBefore = (owner['ownedElements'] as Elem[]).length
    const ids = pasteViews(t.engine, t.diagram, parsed!, { x: 500, y: 300 })
    expect(ids).toHaveLength(3)
    expect(t.diagram.ownedViews.length).toBe(before + 3)
    const pasted = ids.map((id) => t.repository.get(id) as View)
    const [pa, pb, pe] = pasted as [NodeView, NodeView, EdgeView]
    // New IDs and new models with the same names, owned where the originals are.
    expect(ids).not.toContain(a._id)
    expect(pa.model).not.toBe(a.model)
    expect(pa.model?.['name']).toBe(a.model?.['name'])
    expect(pb.model).not.toBe(b.model)
    expect(pe.model).not.toBe(e.model)
    expect(pa.model?._parent).toBe(owner)
    // Two classes in the package; the association goes where the original is owned (in the copy of A).
    expect((owner['ownedElements'] as Elem[]).length).toBe(ownedBefore + 2)
    expect(pe.model?._parent).toBe(e.model?._parent === a.model ? pa.model : e.model?._parent)
    // The pasted association joins the pasted classes.
    const end = (k: string): Elem | undefined => ((pe.model as Elem)[k] as Elem)['reference'] as Elem
    expect([end('end1'), end('end2')]).toEqual([pa.model, pb.model])
    // The edge connects the pasted views, not the originals.
    expect(pe.tail).toBe(pa)
    expect(pe.head).toBe(pb)
    // Sub-views were remapped: compartments are the copy's own and show the copied attribute.
    const compartment = (pa as UMLClassifierView).attributeCompartment as NodeView
    expect(compartment._parent).toBe(pa)
    expect(compartment).not.toBe((a as UMLClassifierView).attributeCompartment)
    const copiedAttribute = ((pa.model as Elem)['attributes'] as Elem[])[0]
    expect(copiedAttribute?.['name']).toBe('x')
    expect(compartment.subViews[0]?.model).toBe(copiedAttribute)
    expect(copiedAttribute).not.toBe(((a.model as Elem)['attributes'] as Elem[])[0])
    // Edge labels point at the pasted edge.
    expect((pe['nameLabel'] as View)['hostEdge']).toBe(pe)
    // Centered on the target point (copied bounds 0..400 × 0..60 → center 200, 30).
    expect(pa.left).toBe(300)
    expect(pa.top).toBe(270)
    // One undo step removes the views and the new elements.
    t.engine.undo()
    expect(t.diagram.ownedViews.length).toBe(before)
    expect((owner['ownedElements'] as Elem[]).length).toBe(ownedBefore)
  })

  it('keeps a pasted element independent: renaming it leaves the original alone', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const [id] = pasteViews(t.engine, t.diagram, copyViews(t.repository, t.diagram, [a._id], t.layout())!)
    const copy = (t.repository.get(id as string) as View).model as Elem
    t.engine.transact('Rename', (b) => b.set(copy, 'name', 'Other'))
    expect(copy['name']).toBe('Other')
    expect(a.model?.['name']).toBe('Class1')
  })

  it('pastes a copied element even after the original was deleted, into its owner', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0)
    const owner = (a.model as Elem)._parent as Elem
    const payload = copyViews(t.repository, t.diagram, [a._id])!
    t.engine.transact('delete', (b) => {
      b.remove(a)
      b.remove(a.model as Elem)
    })
    const [id] = pasteViews(t.engine, t.diagram, payload)
    expect(((t.repository.get(id as string) as View).model as Elem)._parent).toBe(owner)
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

  it('puts an IDEF0 box pasted on another diagram in that diagram, numbered there', () => {
    const kit = newKit()
    const [first, second] = kit.boxes(kit.child)
    createIdef0Edge(kit.envOf(kit.child), kit.layoutOf(kit.child), { kind: 'IDEF0Arrow' }, first!._id, second!._id, { x: first!.left + first!.width, y: first!.top + 20 }, { x: second!.left, y: second!.top + 20 })
    const arrow = kit.child.ownedViews.find((v) => v._type === 'IDEF0ArrowView') as View
    const scope = first!.model as Elem
    const target = decomposeFunction(kit.engine, scope, 3)
    const payload = copyViews(kit.repository, kit.child, [first!._id, second!._id, arrow._id], kit.layoutOf(kit.child))!
    const ids = pasteViews(kit.engine, target, payload, { x: 700, y: 500 })

    const models = ids.map((id) => (kit.repository.get(id) as View).model as Elem)
    const boxes = models.filter((m) => m._type === 'IDEF0Function')
    expect(boxes.map((m) => m._parent)).toEqual([scope, scope])
    expect(boxes.map((m) => m['boxNumber'])).toEqual([4, 5])
    expect((scope['functions'] as Elem[]).length).toBe(5)
    expect((kit.top['functions'] as Elem[]).length).toBe(3)
    expect(models.find((m) => m._type === 'IDEF0Arrow')?._parent).toBe(scope)
  })

  it('refuses to paste an IDEF0 box on the context diagram', () => {
    const kit = newKit()
    const payload = copyViews(kit.repository, kit.child, [kit.boxes(kit.child)[0]!._id], kit.layoutOf(kit.child))!
    expect(() => pasteViews(kit.engine, kit.context, payload)).toThrow(PasteError)
    expect((kit.top['functions'] as Elem[]).length).toBe(3)
  })

  it('puts a class pasted on a diagram of another package in that package', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const pkg = t.node('Package', 300, 0, 200, 150)
    const other = createDiagram(t.engine, 'ClassDiagram', pkg.model as Elem).diagram
    const [id] = pasteViews(t.engine, other, copyViews(t.repository, t.diagram, [a._id], t.layout())!)
    expect((t.repository.get(id as string) as View).model?._parent).toBe(pkg.model)
    // Pasting on the same diagram keeps the owner of the original.
    const [same] = pasteViews(t.engine, t.diagram, copyViews(t.repository, t.diagram, [a._id], t.layout())!)
    expect((t.repository.get(same as string) as View).model?._parent).toBe(a.model?._parent)
  })

  it('puts a state pasted on another state machine in its first region', () => {
    const t = testDiagram()
    const model = t.diagram._parent as Elem
    const first = createDiagram(t.engine, 'StatechartDiagram', model).diagram
    const second = createDiagram(t.engine, 'StatechartDiagram', model).diagram
    const state = createNode(t.engine, { kind: 'State', diagram: first, left: 100, top: 100 }).view as View
    const layout = computeDiagramLayout(first, t.repository, new FixedWidthTextMeasurer())
    const [id] = pasteViews(t.engine, second, copyViews(t.repository, first, [state._id], layout)!)
    const region = ((second._parent as Elem)['regions'] as Elem[])[0]
    expect((t.repository.get(id as string) as View).model?._parent).toBe(region)
  })

  it('pastes an IDEF0 box as a plain new box with the next free number', () => {
    const kit = newKit()
    const [box] = kit.boxes(kit.child)
    const fn = box!.model as Elem
    const grandchild = decomposeFunction(kit.engine, fn, 3)
    const payload = copyViews(kit.repository, kit.child, [box!._id], kit.layoutOf(kit.child))!
    const [id] = pasteViews(kit.engine, kit.child, payload, { x: 700, y: 500 })
    const copy = (kit.repository.get(id as string) as View).model as Elem
    expect(copy).not.toBe(fn)
    expect(copy['name']).toBe(fn['name'])
    expect(copy['boxNumber']).toBe(4)
    // The decomposition stays with the original box only.
    expect(copy['childDiagram']).toBeNull()
    expect(copy['functions']).toEqual([])
    expect(fn['childDiagram']).toBe(grandchild)
    expect(validateIdef0(kit.model).some((w) => /Box numbers/.test(w.message))).toBe(false)
  })

  it('refuses to paste when the owner of a copied element was deleted', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0)
    const payload = copyViews(t.repository, t.diagram, [a._id])!
    t.engine.transact('delete', (b) => b.remove((a.model as Elem)._parent as Elem))
    expect(() => pasteViews(t.engine, t.diagram, payload)).toThrow(/no longer exist/)
  })

  it('still pastes an older payload (no models) as views of the same elements', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0)
    const { models: _models, ...old } = copyViews(t.repository, t.diagram, [a._id])!
    const [id] = pasteViews(t.engine, t.diagram, { ...old, outerRefs: [(a.model as Elem)._id] })
    expect((t.repository.get(id as string) as View).model).toBe(a.model)
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

  it('pastes views copied from another diagram type only where that diagram can draw them', () => {
    const t = testDiagram()
    const cls = t.node('Class', 0, 0)
    const note = t.node('Note', 200, 0)
    const owner = t.diagram._parent as Elem
    const classPayload = copyViews(t.repository, t.diagram, [cls._id], t.layout())!
    const notePayload = copyViews(t.repository, t.diagram, [note._id], t.layout())!
    const idef0 = createDiagram(t.engine, 'IDEF0Diagram', owner).diagram
    const composite = createDiagram(t.engine, 'CompositeStructureDiagram', owner).diagram
    const other = createDiagram(t.engine, 'ClassDiagram', owner).diagram
    // Same diagram type: always.
    expect(pasteViews(t.engine, other, classPayload)).toHaveLength(1)
    // Another type: refused without a predicate, and where the palette cannot draw the view.
    expect(() => pasteViews(t.engine, composite, classPayload)).toThrow(PasteError)
    const idef0Views = idef0.ownedViews.length
    expect(() => pasteViews(t.engine, idef0, classPayload, undefined, diagramCanHostView)).toThrow(PasteError)
    expect(idef0.ownedViews).toHaveLength(idef0Views)
    // Accepted where the palette draws it (classes on composite structure, notes everywhere).
    expect(pasteViews(t.engine, composite, classPayload, undefined, diagramCanHostView)).toHaveLength(1)
    expect(pasteViews(t.engine, idef0, notePayload, undefined, diagramCanHostView)).toHaveLength(1)
  })

  it('rejects malformed clipboard payloads', () => {
    const base = { format: 'openuml/views', version: 1, diagramType: 'UMLClassDiagram', views: [], outerRefs: [], bounds: null }
    expect(parseClipboard(JSON.stringify(base))).not.toBeNull()
    expect(parseClipboard(JSON.stringify({ ...base, outerRefs: undefined }))).toBeNull()
    expect(parseClipboard(JSON.stringify({ ...base, diagramType: 3 }))).toBeNull()
    expect(parseClipboard(JSON.stringify({ ...base, views: [1] }))).toBeNull()
    expect(parseClipboard('hello')).toBeNull()
  })
})
