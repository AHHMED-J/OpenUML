import { beforeEach, describe, expect, it } from 'vitest'
import { CommandRegistry, createEdge, createNode, setFields } from '../../commands'
import type { Diagram, Elem, UMLAssociation, View } from '../../model'
import { projectStore } from '../../store'
import { canvasContextMenu } from '../menus/appMenu'
import { setContextEdgeEnd } from '../../diagram/editor/activeEditor'
import { endLabel, endMultiplicityCommandId, endMultiplicityMenu, registerAssociationEndCommands } from './associationEnds'

const ps = () => projectStore.getState()

function setup(self = false) {
  ps().newProject()
  const s = ps()
  const diagram = s.repository.defaultDiagram() as Diagram
  const make = (name: string, left: number): View => {
    const view = createNode(s.engine, { kind: 'Class', diagram, left, top: 0, width: 100, height: 50 }).view as View
    setFields(s.engine, view.model as Elem, { name })
    return view
  }
  const customer = make('Customer', 0)
  const order = self ? customer : make('Order', 400)
  const edge = createEdge(s.engine, { kind: 'Association', diagram, tail: customer, head: order }).view as View
  ps().select({ views: [edge._id] })
  const assoc = edge.model as UMLAssociation
  const registry = new CommandRegistry()
  registerAssociationEndCommands(registry)
  return { edge, end1: assoc.end1 as Elem, end2: assoc.end2 as Elem, registry }
}

beforeEach(() => setContextEdgeEnd(null))

describe('association end multiplicity commands', () => {
  it('set the chosen end in one undo step', () => {
    const { end1, end2, registry } = setup()
    registry.get(endMultiplicityCommandId('end2', '0..*'))?.run()
    expect(end2['multiplicity']).toBe('0..*')
    expect(end1['multiplicity'] ?? '').toBe('')
    registry.get(endMultiplicityCommandId('end1', '1'))?.run()
    expect(end1['multiplicity']).toBe('1')
    ps().engine.undo()
    expect(end1['multiplicity'] ?? '').toBe('')
    expect(end2['multiplicity']).toBe('0..*')
    ps().engine.undo()
    expect(end2['multiplicity'] ?? '').toBe('')
    // (none) clears it.
    registry.get(endMultiplicityCommandId('end2', '*'))?.run()
    registry.get(endMultiplicityCommandId('end2', ''))?.run()
    expect(end2['multiplicity']).toBe('')
  })

  it('are labelled by the class each end touches and only enabled for an association', () => {
    const { registry } = setup()
    const cmd = registry.get(endMultiplicityCommandId('end1', '0..*'))
    expect(cmd?.label).toBe('Multiplicity (Customer end): 0..*')
    expect(registry.get(endMultiplicityCommandId('end2', ''))?.label).toBe('Multiplicity (Order end): (none)')
    expect(registry.isEnabled(endMultiplicityCommandId('end1', '1'))).toBe(true)
    expect(registry.isChecked(endMultiplicityCommandId('end1', '1'))).toBe(false)
    registry.get(endMultiplicityCommandId('end1', '1'))?.run()
    expect(registry.isChecked(endMultiplicityCommandId('end1', '1'))).toBe(true)
    ps().select({ views: [] })
    expect(registry.isEnabled(endMultiplicityCommandId('end1', '1'))).toBe(false)
  })

  it('number the ends of a self-association', () => {
    const { end1, end2 } = setup(true)
    expect(endLabel(end1, end2, 'end1')).toBe('End 1, Customer')
    expect(endLabel(end1, end2, 'end2')).toBe('End 2, Customer')
  })
})

describe('end multiplicity context menu', () => {
  it('offers one submenu per end when not opened near an end', () => {
    setup()
    expect(endMultiplicityMenu().map((m) => m.label)).toEqual(['Multiplicity (Customer end)', 'Multiplicity (Order end)'])
    const first = canvasContextMenu()[0]
    expect(first?.label).toBe('Multiplicity (Customer end)')
  })

  it('offers the near end only, with its values and (none)', () => {
    const { edge, end2 } = setup()
    setContextEdgeEnd({ viewId: edge._id, endId: end2._id })
    const menu = endMultiplicityMenu()
    expect(menu.map((m) => m.label)).toEqual(['Multiplicity'])
    const items = (menu[0]?.submenu as readonly { label?: string; command?: string }[]).map((i) => [i.label, i.command])
    expect(items).toEqual([
      ['0..1', 'edit.multiplicity.end2.0-1'],
      ['1', 'edit.multiplicity.end2.1'],
      ['0..*', 'edit.multiplicity.end2.0-n'],
      ['1..*', 'edit.multiplicity.end2.1-n'],
      ['*', 'edit.multiplicity.end2.n'],
      ['(none)', 'edit.multiplicity.end2.none']
    ])
  })

  it('is absent without a selected association', () => {
    setup()
    ps().select({ views: [] })
    expect(endMultiplicityMenu()).toEqual([])
    expect(canvasContextMenu()[0]?.label).not.toMatch(/Multiplicity/)
  })
})
