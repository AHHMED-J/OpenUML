import { describe, expect, it } from 'vitest'
import { addAttribute, addEnumerationLiteral, addFeature, addOperation, setFields } from '../../../commands'
import type { Elem, NodeView } from '../../../model'
import { BOLD_CHAR, CHAR, testDiagram } from '../../testUtils'
import type { NodeLayout } from '../../layout/types'
import type { ClassifierData, PackageData } from './layout'
import { attributeText, operationText } from './strings'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).

function classifier(layout: NodeLayout | undefined): NodeLayout<ClassifierData> {
  if (!layout) throw new Error('no layout')
  return layout as NodeLayout<ClassifierData>
}

describe('classifier layout', () => {
  it('sizes a name-only class: 25 + 10 + 10 = 45 tall, name width + 10 wide', () => {
    const t = testDiagram()
    const view = t.node('Class', 40, 40, 20, 20)
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.minHeight).toBe(45)
    expect(l.minWidth).toBe(Math.ceil(6 * BOLD_CHAR) + 10)
    // The stored 20×20 box grows to the minimum.
    expect(l.box).toEqual({ left: 40, top: 40, width: l.minWidth, height: 45 })
    expect(l.data.nameRect.height).toBe(25)
    expect(l.data.compartments.map((c) => [c.kind, c.rect.height])).toEqual([
      ['attributes', 10],
      ['operations', 10]
    ])
    // The name sits 5 + 2 below the top, bold and centered.
    const name = l.data.nameLines[0]
    expect(name?.box.top).toBe(47)
    expect(name?.align).toBe('center')
    expect(name?.font.style).toBe(1)
  })

  it('keeps a larger stored size and stacks compartments from the top', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0, 200, 150)
    const model = view.model as Elem
    addAttribute(t.engine, model, { name: 'a', type: 'int' })
    addAttribute(t.engine, model, { name: 'b' })
    addOperation(t.engine, model, { name: 'run' })
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.box).toEqual({ left: 0, top: 0, width: 200, height: 150 })
    const [attrs, ops] = l.data.compartments
    // 5 + 13 + 2 + 13 + 5 = 38 for two rows; 5 + 13 + 5 = 23 for one.
    expect(attrs?.rect).toEqual({ left: 0, top: 25, width: 200, height: 38 })
    expect(ops?.rect).toEqual({ left: 0, top: 63, width: 200, height: 23 })
    expect(attrs?.rows.map((r) => r.text)).toEqual(['+a: int', '+b'])
    expect(attrs?.rows[1]?.box.top).toBe(25 + 5 + 13 + 2)
    expect(ops?.rows[0]?.text).toBe('+run()')
    expect(l.minHeight).toBe(25 + 38 + 23)
  })

  it('shows stereotypes in guillemets (38-tall name compartment) and italicizes abstract names', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0)
    setFields(t.engine, view.model as Elem, { stereotype: 'entity', isAbstract: true })
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.data.nameRect.height).toBe(38)
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«entity»', 'Class1'])
    expect(l.data.nameLines[1]?.font.style).toBe(3)
  })

  it('underlines static members and italicizes abstract operations', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0)
    const model = view.model as Elem
    addAttribute(t.engine, model, { name: 'count', isStatic: true })
    addOperation(t.engine, model, { name: 'draw', isAbstract: true })
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.data.compartments[0]?.rows[0]?.underline).toBe(true)
    expect(l.data.compartments[1]?.rows[0]?.font.style).toBe(2)
  })

  it('suppresses compartments per view flags and draws enumeration literals', () => {
    const t = testDiagram()
    const view = t.node('Enumeration', 0, 0)
    addEnumerationLiteral(t.engine, view.model as Elem, { name: 'RED' })
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.data.nameLines.map((n) => n.text)).toEqual(['«enumeration»', 'Enumeration1'])
    expect(l.data.compartments.map((c) => c.kind)).toEqual(['literals'])
    expect(l.data.compartments[0]?.rows[0]?.text).toBe('RED')
  })

  it('draws interfaces in iconic form as a lollipop with an ellipse endpoint', () => {
    const t = testDiagram()
    const view = t.node('Interface', 100, 100)
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.data.form).toBe('icon')
    expect(l.data.icon?.kind).toBe('interface')
    expect(l.data.icon?.rect.width).toBe(24)
    expect(l.endpoint?.outline).toBe('ellipse')
    expect(l.minHeight).toBe(24 + 25)
    // Label form shows «interface» in a box.
    setFields(t.engine, view, { stereotypeDisplay: 'label', suppressAttributes: false })
    const box = classifier(t.layout().nodes.get(view._id))
    expect(box.data.form).toBe('box')
    expect(box.data.nameLines[0]?.text).toBe('«interface»')
  })

  it('auto-resize forces the minimum size and hides handles', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0, 300, 300) as NodeView
    setFields(t.engine, view, { autoResize: true })
    const l = classifier(t.layout().nodes.get(view._id))
    expect([l.box.width, l.box.height]).toEqual([l.minWidth, l.minHeight])
    expect(l.sizable).toBe('none')
  })

  it('lays out packages with a 2/5 tab and minimum 50 × 40', () => {
    const t = testDiagram()
    const view = t.node('Package', 0, 0, 10, 10)
    const l = t.layout().nodes.get(view._id) as NodeLayout<PackageData>
    expect(l.minWidth).toBe(Math.max(50, Math.ceil(8 * BOLD_CHAR) + 10))
    expect(l.minHeight).toBe(40)
    expect(l.data.tab).toEqual({ left: 0, top: 0, width: Math.round(l.box.width * 0.4), height: 15 })
    expect(l.data.body.top).toBe(14)
  })

  it('formats attribute and operation rows', () => {
    const t = testDiagram()
    const view = t.node('Class', 0, 0)
    const model = view.model as Elem
    const attr = addAttribute(t.engine, model, { name: 'size', type: 'int', multiplicity: '0..1', defaultValue: '3', isReadOnly: true, visibility: 'private' })
    expect(attributeText(attr)).toBe('-size: int[0..1] = 3 {readOnly}')
    const op = addOperation(t.engine, model, { name: 'find', visibility: 'protected', isQuery: true })
    addFeature(t.engine, op, 'Parameter', { name: 'key', type: 'String' })
    addFeature(t.engine, op, 'Parameter', { name: 'out', direction: 'out', type: 'int' })
    addFeature(t.engine, op, 'Parameter', { name: '', direction: 'return', type: 'Item', multiplicity: '*' })
    expect(operationText(op)).toBe('#find(key: String, out out: int): Item[*] {query}')
    expect(operationText(op, { showOperationSignature: false })).toBe('#find()')
    // Width follows the widest row.
    const l = classifier(t.layout().nodes.get(view._id))
    expect(l.minWidth).toBe(Math.ceil('#find(key: String, out out: int): Item[*] {query}'.length * CHAR) + 10)
  })
})
