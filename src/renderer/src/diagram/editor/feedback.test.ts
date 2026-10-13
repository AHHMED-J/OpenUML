import { describe, expect, it, vi } from 'vitest'
import { ModelRuleError, type EdgeView, type NodeView } from '../../model'
import { testDiagram } from '../testUtils'
import { createEdgeBetween, createNodeAt, reconnectEnd, refusedDropHost } from './actions'
import { connectionRefusal, placementRefusal, readableName, refusalReason, withArticle } from './feedback'

describe('editor feedback wording', () => {
  it('names types and tools in plain words with the right article', () => {
    expect(readableName('UMLInterfaceRealization')).toBe('Interface Realization')
    expect(readableName('IDEF0Function')).toBe('Function')
    expect(readableName('RADStartMarker')).toBe('Start Marker')
    expect(readableName('InputPin')).toBe('Input Pin')
    expect(withArticle('Actor')).toBe('an Actor')
    expect(withArticle('Use Case')).toBe('a Use Case')
    expect(withArticle('Package')).toBe('a Package')
    expect(placementRefusal('InputPin', null)).toBe("An Input Pin can't be placed here")
  })

  it('shows the message of a modeling rule and logs only unexpected errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(refusalReason(new ModelRuleError('Place this element inside a role'), 'fallback')).toBe('Place this element inside a role')
      expect(error).not.toHaveBeenCalled()
      expect(refusalReason(new TypeError('x is undefined'), "Couldn't create a Class")).toBe("Couldn't create a Class")
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      error.mockRestore()
    }
  })
})

describe('refused editor gestures', () => {
  it('explains a connection the rules do not allow', () => {
    const t = testDiagram()
    const actor = t.node('Actor', 0, 0)
    const pkg = t.node('Package', 300, 0, 200, 150)
    const reasons: string[] = []
    const id = createEdgeBetween(t, t.layout(), { kind: 'Generalization' }, actor._id, pkg._id, { x: 0, y: 0 }, (r) => reasons.push(r))
    expect(id).toBeNull()
    expect(reasons).toEqual(["A Generalization can't connect an Actor to a Package"])
    expect(connectionRefusal('Generalization', actor, actor)).toBe("A Generalization can't connect an Actor to itself")
  })

  it('explains a refused reconnection, and says nothing when an end is dropped back where it was', () => {
    const t = testDiagram()
    const a = t.node('Class', 0, 0, 100, 60)
    const b = t.node('Class', 300, 0, 100, 60)
    const pkg = t.node('Package', 0, 300, 200, 150)
    const edge = t.edge('Generalization', a, b) as EdgeView
    const reasons: string[] = []
    expect(reconnectEnd(t, edge._id, 'head', pkg._id, undefined, (r) => reasons.push(r))).toBe(false)
    expect(reconnectEnd(t, edge._id, 'head', b._id, undefined, (r) => reasons.push(r))).toBe(false)
    expect(reasons).toEqual(["A Generalization can't connect a Class to a Package"])
    expect(edge.head).toBe(b)
  })

  it('explains why an element cannot be created where it was drawn', () => {
    const t = testDiagram()
    const reasons: string[] = []
    const rect = { left: 40, top: 60, width: 0, height: 0 }
    expect(createNodeAt(t, t.layout(), 'InputPin', rect, { onRefused: (r) => reasons.push(r) })).toBeNull()
    expect(reasons).toEqual(['A pin must be placed on an action'])
  })

  it('names the container that refused a drop only when the views were dropped inside it', () => {
    const t = testDiagram()
    const host = t.node('Class', 0, 0, 300, 200) as NodeView
    const moved = t.node('Class', 400, 0, 80, 40) as NodeView
    const layout = t.layout()
    const inside = [{ left: 20, top: 60, width: 80, height: 40 }]
    const across = [{ left: 250, top: 60, width: 80, height: 40 }]
    const refused = refusedDropHost(t, layout, { x: 60, y: 80 }, [moved], inside)
    // Class views host only ports and parts.
    expect(refused).toBe(host)
    expect(refusedDropHost(t, layout, { x: 260, y: 80 }, [moved], across)).toBeNull()
    expect(refusedDropHost(t, layout, { x: 600, y: 600 }, [moved], [{ left: 590, top: 590, width: 80, height: 40 }])).toBeNull()
  })
})
