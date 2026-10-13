import { describe, expect, it } from 'vitest'
import { createDiagram, createEdge, createNode, setFields } from '../../../commands'
import { renderDiagramSvg } from '../../../export'
import { readMdj, validateModel, writeMdj } from '../../../format'
import { isKindOf, type Diagram, type Project, type EdgeKind, type Elem, type NodeKind, type NodeView, type View } from '../../../model'
import { createEdgeBetween, createNodeAt, findDropContainer, moveSelection } from '../../editor/actions'
import { applyQuickEdit } from '../../editor/quickEditApply'
import { computeDiagramLayout } from '../../layout/layoutDiagram'
import type { EdgeLayout, NodeLayout } from '../../layout/types'
import { BOLD_CHAR, testDiagram } from '../../testUtils'
import { ADD_DIAGRAM_ITEMS, ADD_ITEMS, addDiagram, addModelElement } from '../../../ui/modelActions'
import type { ConnectionPointData, FinalStateData, PseudostateData, StateData } from './layout'
import { internalActivityRows, internalTransitions, parseTransition, stateNameText, transitionLabel, transitionText } from './strings'

// FixedWidthTextMeasurer: char width = 0.6 × size (bold × 1.1); line height = font size (13).

function stateDiagram() {
  const t = testDiagram()
  const owner = t.diagram._parent as Elem
  const diagram = createDiagram(t.engine, 'StatechartDiagram', owner).diagram as Diagram
  const env = { engine: t.engine, diagram, measurer: t.measurer }
  const machine = diagram._parent as Elem
  return {
    ...t,
    env,
    diagram,
    machine,
    region: (machine['regions'] as Elem[])[0] as Elem,
    node(kind: NodeKind, left: number, top: number, width?: number, height?: number, container?: View, owner?: Elem): View {
      return createNode(t.engine, {
        kind,
        diagram,
        left,
        top,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(container ? { container } : {}),
        ...(owner ? { owner } : {})
      }).view as View
    },
    edge(kind: EdgeKind, tail: View, head: View): View {
      return createEdge(t.engine, { kind, diagram, tail, head }).view as View
    },
    layout() {
      return computeDiagramLayout(diagram, t.repository, t.measurer)
    }
  }
}

function nodeOf<D>(layout: { nodes: ReadonlyMap<string, NodeLayout> }, view: View): NodeLayout<D> {
  const l = layout.nodes.get(view._id)
  if (!l) throw new Error(`no layout for ${view._type}`)
  return l as NodeLayout<D>
}

function edgeOf(layout: { edges: ReadonlyMap<string, EdgeLayout> }, view: View): EdgeLayout {
  const l = layout.edges.get(view._id)
  if (!l) throw new Error(`no layout for ${view._type}`)
  return l
}

function regionViews(state: View): NodeView[] {
  return ((state['decompositionCompartment'] as View).subViews as NodeView[]).filter((v) => v._type === 'UMLRegionView')
}

describe('state machine creation and ownership', () => {
  it('creates a state machine with one empty region and the diagram inside it', () => {
    const t = testDiagram()
    const pkg = t.diagram._parent as Elem
    const diagram = createDiagram(t.engine, 'StatechartDiagram', pkg).diagram as Diagram
    const machine = diagram._parent as Elem
    expect(machine._type).toBe('UMLStateMachine')
    expect(machine['name']).toBe('StateMachine1')
    expect(machine._parent).toBe(pkg)
    expect(diagram._type).toBe('UMLStatechartDiagram')
    expect(diagram['name']).toBe('StatechartDiagram1')
    const regions = machine['regions'] as Elem[]
    expect(regions).toHaveLength(1)
    expect(regions[0]?._type).toBe('UMLRegion')
    expect(diagram.ownedViews).toHaveLength(0)
  })

  it('adds a diagram under an existing state machine directly', () => {
    const a = stateDiagram()
    const second = createDiagram(a.engine, 'StatechartDiagram', a.machine).diagram as Diagram
    expect(second._parent).toBe(a.machine)
    expect(second['name']).toBe('StatechartDiagram2')
    expect(a.machine['regions']).toHaveLength(1)
  })

  it('owns top-level vertices in regions[0].vertices with unique State<n> names; pseudostates are unnamed', () => {
    const a = stateDiagram()
    const s1 = a.node('State', 10, 10)
    const s2 = a.node('State', 10, 100)
    const init = a.node('InitialState', 200, 10)
    const fin = a.node('FinalState', 200, 100)
    expect(s1.model?.['name']).toBe('State1')
    expect(s2.model?.['name']).toBe('State2')
    expect(init.model).toMatchObject({ _type: 'UMLPseudostate', kind: 'initial', name: '' })
    expect(fin.model).toMatchObject({ _type: 'UMLFinalState', name: '' })
    expect(a.region['vertices']).toEqual([s1.model, s2.model, init.model, fin.model])
    expect(s1.model?._parent).toBe(a.region)
  })

  it('creates every pseudostate kind', () => {
    const a = stateDiagram()
    const kinds: Array<[NodeKind, string]> = [
      ['Choice', 'choice'],
      ['Join', 'join'],
      ['Fork', 'fork'],
      ['Junction', 'junction'],
      ['ShallowHistory', 'shallowHistory'],
      ['DeepHistory', 'deepHistory'],
      ['EntryPoint', 'entryPoint'],
      ['ExitPoint', 'exitPoint'],
      ['Terminate', 'terminate']
    ]
    for (const [kind, expected] of kinds) expect(a.node(kind, 0, 0).model?.['kind']).toBe(expected)
  })

  it('composite states get 1 region, orthogonal 2, submachine states a sibling machine', () => {
    const a = stateDiagram()
    const simple = a.node('State', 0, 0)
    const comp = a.node('CompositeState', 0, 100)
    const orth = a.node('OrthogonalState', 300, 100)
    const sub = a.node('SubmachineState', 0, 400)
    expect(simple.model?.['regions']).toHaveLength(0)
    expect(comp.model?.['regions']).toHaveLength(1)
    expect(orth.model?.['regions']).toHaveLength(2)
    expect(regionViews(comp)).toHaveLength(1)
    expect(regionViews(orth).map((r) => r.model)).toEqual(orth.model?.['regions'])
    const submachine = sub.model?.['submachine'] as Elem
    expect(submachine._type).toBe('UMLStateMachine')
    expect(submachine._parent).toBe(a.machine._parent)
    expect(submachine['regions']).toHaveLength(1)
    expect(sub.model?.['regions']).toHaveLength(0)
  })

  it('owns a transition in the lowest region containing both ends', () => {
    const a = stateDiagram()
    const comp = a.node('CompositeState', 0, 0)
    const layout = a.layout()
    const inner1 = createNodeAt(a.env, layout, 'State', { left: 20, top: 60, width: 0, height: 0 }) as string
    const innerView1 = a.repository.get(inner1) as View
    const innerRegion = (comp.model?.['regions'] as Elem[])[0] as Elem
    expect(innerView1.model?._parent).toBe(innerRegion)
    const inner2 = createNodeAt(a.env, a.layout(), 'State', { left: 20, top: 140, width: 0, height: 0 }) as string
    const innerView2 = a.repository.get(inner2) as View
    const outside = a.node('State', 400, 0)
    const t1 = a.edge('Transition', innerView1, innerView2)
    const t2 = a.edge('Transition', innerView1, outside)
    const t3 = a.edge('Transition', outside, outside)
    expect(t1.model?._parent).toBe(innerRegion)
    expect(innerRegion['transitions']).toEqual([t1.model])
    expect(t2.model?._parent).toBe(a.region)
    expect(t3.model?._parent).toBe(a.region)
    expect(t1.model).toMatchObject({ source: innerView1.model, target: innerView2.model })
  })

  it('connects only vertices', () => {
    const a = stateDiagram()
    const s = a.node('State', 0, 0)
    const note = a.node('Note', 200, 0)
    expect(() => a.edge('Transition', s, note)).toThrow()
  })

  it('refuses transitions leaving a final state or terminate, or entering an initial pseudostate', () => {
    const a = stateDiagram()
    const s = a.node('State', 0, 0)
    const initial = a.node('InitialState', 200, 0)
    const final = a.node('FinalState', 300, 0)
    const terminate = a.node('Terminate', 400, 0)
    expect(() => a.edge('Transition', final, s)).toThrow()
    expect(() => a.edge('Transition', terminate, s)).toThrow()
    expect(() => a.edge('Transition', s, initial)).toThrow()
    expect(a.edge('Transition', initial, s).model?._type).toBe('UMLTransition')
    expect(a.edge('Transition', s, final).model?._type).toBe('UMLTransition')
    expect(a.edge('Transition', s, terminate).model?._type).toBe('UMLTransition')
  })

  it('Add Diagram and Model > Add entries exist', () => {
    const t = testDiagram()
    const model = t.diagram._parent as Elem
    expect(ADD_DIAGRAM_ITEMS.find((i) => i.kind === 'StatechartDiagram')?.accepts(model)).toBe(true)
    const machineItem = ADD_ITEMS.find((i) => i.id === 'state-machine')
    const machine = addModelElement(t.engine, model, machineItem as NonNullable<typeof machineItem>)
    expect(machine['regions']).toHaveLength(1)
    const diagram = addDiagram(t.engine, machine, 'StatechartDiagram')
    expect(diagram._parent).toBe(machine)
  })
})

describe('state layout', () => {
  it('is a rounded rectangle (r = 10), at least 60 × 40, with the name compartment on top', () => {
    const a = stateDiagram()
    const view = a.node('State', 10, 20, 10, 10)
    const l = nodeOf<StateData>(a.layout(), view)
    expect(l.minWidth).toBe(Math.max(60, Math.ceil(6 * BOLD_CHAR) + 10))
    expect(l.minHeight).toBe(40)
    expect(l.box).toEqual({ left: 10, top: 20, width: l.minWidth, height: 40 })
    expect(l.data.cornerRadius).toBe(10)
    expect(l.data.nameLines[0]?.text).toBe('State1')
    expect(l.data.separators).toEqual([])
    expect(l.regions[0]?.target).toEqual({ kind: 'name', elementId: view.model?._id })
  })

  it('shows internal activities as entry/do/exit rows under a separator', () => {
    const a = stateDiagram()
    const view = a.node('State', 0, 0, 200, 120)
    const state = view.model as Elem
    const exit = addModelElement(a.engine, state, ADD_ITEMS.find((i) => i.id === 'exit-activity') as never)
    const entry = addModelElement(a.engine, state, ADD_ITEMS.find((i) => i.id === 'entry-activity') as never)
    expect(entry['name']).toBe('EntryActivity1')
    expect(exit['name']).toBe('ExitActivity1')
    expect(internalActivityRows(state).map((r) => r.text)).toEqual(['entry/EntryActivity1', 'exit/ExitActivity1'])
    const l = nodeOf<StateData>(a.layout(), view)
    expect(l.data.separators).toEqual([25])
    expect(l.data.activityLines.map((x) => x.text)).toEqual(['entry/EntryActivity1', 'exit/ExitActivity1'])
    // Rows: 5 padding, 13 per row, 2 between rows.
    expect(l.data.activityLines[0]?.box.top).toBe(25 + 5)
    expect(l.data.activityLines[1]?.box.top).toBe(25 + 5 + 13 + 2)
    expect(l.minHeight).toBe(Math.max(40, 25 + 5 + 13 + 2 + 13 + 5))
  })

  it('shows internal transitions below the activities and edits them with the transition syntax', () => {
    const a = stateDiagram()
    const comp = a.node('CompositeState', 0, 0, 300, 200)
    const state = comp.model as Elem
    const item = ADD_ITEMS.find((i) => i.id === 'internal-transition') as never
    const t = addModelElement(a.engine, state, item)
    expect(t).toMatchObject({ kind: 'internal', source: state, target: state })
    expect(internalTransitions(state)).toEqual([t])
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: t._id, syntax: 'transition' }, 'tick [ready] / run')).toBe(true)
    const l = nodeOf<StateData>(a.layout(), comp)
    expect(l.data.transitionLines.map((x) => x.text)).toEqual(['tick [ready] / run'])
    expect(l.regions.some((r) => 'elementId' in r.target && r.target.elementId === t._id)).toBe(true)
    // Internal transitions are never drawn as edges.
    expect(a.layout().edges.size).toBe(0)
  })

  it('decomposes into regions: min 50 tall each, last takes the rest, dashed line above all but the first', () => {
    const a = stateDiagram()
    const orth = a.node('OrthogonalState', 0, 0, 220, 300)
    const l = nodeOf<StateData>(a.layout(), orth)
    expect(l.minHeight).toBe(25 + 138 + 50)
    expect(l.data.separators).toEqual([25])
    expect(l.data.regions).toHaveLength(2)
    const [r1, r2] = l.data.regions
    expect(r1?.rect.top).toBe(25)
    expect(r1?.dashedTop).toBe(false)
    expect(r2?.dashedTop).toBe(true)
    expect((r1?.rect.height ?? 0) + (r2?.rect.height ?? 0)).toBe(300 - 25)
    expect(r2?.rect.top).toBe(25 + (r1?.rect.height ?? 0))
    expect(l.subContainers?.map((s) => s.viewId)).toEqual(regionViews(orth).map((v) => v._id))
    expect(l.dividers).toHaveLength(1)
    expect(l.dividers?.[0]?.minY).toBe(25 + 50)
  })

  it('draws the submachine mark and grows the minimum height by 16; name reads name: Submachine', () => {
    const a = stateDiagram()
    const view = a.node('SubmachineState', 0, 0, 200, 100)
    const l = nodeOf<StateData>(a.layout(), view)
    expect(stateNameText(view.model, true)).toBe('State1: StateMachine2')
    expect(l.data.nameLines[0]?.text).toBe('State1: StateMachine2')
    expect(l.minHeight).toBe(40 + 16)
    expect(l.data.submachineMark).toMatchObject({
      left: { cx: 200 - 23, cy: 100 - 13 },
      right: { cx: 200 - 11, cy: 100 - 13 },
      lineFrom: { x: 180, y: 87 },
      lineTo: { x: 186, y: 87 }
    })
  })
})

describe('pseudostates', () => {
  it('have the specified minimum sizes and shapes', () => {
    const a = stateDiagram()
    const cases: Array<[NodeKind, string, number, number]> = [
      ['InitialState', 'initial', 20, 20],
      ['DeepHistory', 'history', 26, 26],
      ['ShallowHistory', 'history', 26, 26],
      ['Junction', 'junction', 15, 15],
      ['Choice', 'choice', 23, 19],
      ['EntryPoint', 'entryPoint', 15, 15],
      ['ExitPoint', 'exitPoint', 15, 15],
      ['Terminate', 'terminate', 26, 26]
    ]
    for (const [kind, shape, w, h] of cases) {
      const view = a.node(kind, 0, 0, 5, 5)
      const l = nodeOf<PseudostateData>(a.layout(), view)
      expect(l.data.shape, kind).toBe(shape)
      expect([l.box.width, l.box.height], kind).toEqual([w, h])
    }
  })

  it('draws history text and the exit X arms of round(√2·width/4)', () => {
    const a = stateDiagram()
    const deepView = a.node('DeepHistory', 0, 0)
    const shallowView = a.node('ShallowHistory', 50, 0)
    const exitView = a.node('ExitPoint', 100, 0, 20, 20)
    const layout = a.layout()
    expect(nodeOf<PseudostateData>(layout, deepView).data.text?.text).toBe('H*')
    expect(nodeOf<PseudostateData>(layout, shallowView).data.text?.text).toBe('H')
    const exit = nodeOf<PseudostateData>(layout, exitView)
    expect(exit.data.arm).toBe(Math.round((Math.SQRT2 * 20) / 4))
  })

  it('draws fork and join as 70 × 6 bars, vertical when taller than wide', () => {
    const a = stateDiagram()
    const forkView = a.node('Fork', 0, 0)
    const joinView = a.node('Join', 0, 50, 10, 90)
    const layout = a.layout()
    const h = nodeOf<PseudostateData>(layout, forkView)
    expect([h.box.width, h.box.height, h.data.horizontal]).toEqual([70, 6, true])
    const v = nodeOf<PseudostateData>(layout, joinView)
    expect([v.box.width, v.box.height, v.data.horizontal]).toEqual([6, 90, false])
  })

  it('draws the final state as a 26 × 26 ring with an inner disc inset by 5', () => {
    const a = stateDiagram()
    const finalView = a.node('FinalState', 0, 0)
    const l = nodeOf<FinalStateData>(a.layout(), finalView)
    expect([l.box.width, l.box.height, l.data.innerRadius]).toEqual([26, 26, 8])
  })

  it('glues connection point references to the border of their state', () => {
    const a = stateDiagram()
    const state = a.node('State', 100, 100, 200, 100)
    const layout = a.layout()
    const id = createNodeAt(a.env, layout, 'ConnectionPointReference', { left: 150, top: 104, width: 0, height: 0 }) as string
    const cpr = a.repository.get(id) as View
    expect(cpr.model?._parent).toBe(state.model)
    expect(state.model?.['connections']).toEqual([cpr.model])
    const l = nodeOf<ConnectionPointData>(a.layout(), cpr)
    expect([l.box.width, l.box.height]).toEqual([14, 14])
    expect(l.box.top + 7).toBe(100)
    expect(createNodeAt(a.env, a.layout(), 'ConnectionPointReference', { left: 600, top: 600, width: 0, height: 0 })).toBeNull()
  })
})

describe('transition string', () => {
  const tr = (props: Record<string, unknown>): Elem =>
    ({ _type: 'UMLTransition', _id: 't', _parent: null, name: '', guard: '', triggers: [], effects: [], ...props }) as Elem
  const named = (name: string): Elem => ({ _type: 'UMLEvent', _id: name, _parent: null, name }) as Elem

  it('joins triggers, guard and effects', () => {
    expect(transitionText(tr({}))).toBe('')
    expect(transitionText(tr({ triggers: [named('a'), named('b')] }))).toBe('a, b')
    expect(transitionText(tr({ guard: 'x > 0' }))).toBe('[x > 0]')
    expect(transitionText(tr({ triggers: [named('go')], guard: 'ok', effects: [named('run'), named('log')] }))).toBe('go [ok] / run, log')
    expect(transitionText(tr({ effects: [named('run')] }))).toBe('/ run')
  })

  it('prefixes the name only when there is a string', () => {
    expect(transitionLabel(tr({ name: 'T1' }))).toBe('T1')
    expect(transitionLabel(tr({ name: 'T1', triggers: [named('go')] }))).toBe('T1 : go')
    expect(transitionLabel(tr({ triggers: [named('go')] }))).toBe('go')
  })

  it('parses trigger, guard and effect clauses', () => {
    expect(parseTransition('a, b [g h] / do it')).toEqual({ triggers: ['a', 'b'], guard: 'g h', effect: 'do it' })
    expect(parseTransition('go')).toEqual({ triggers: ['go'], guard: '', effect: null })
    expect(parseTransition('[ok]')).toEqual({ triggers: [], guard: 'ok', effect: null })
    expect(parseTransition('/ run')).toEqual({ triggers: [], guard: '', effect: 'run' })
    expect(parseTransition('')).toEqual({ triggers: [], guard: '', effect: null })
    expect(parseTransition('a [b')).toBeNull()
    expect(parseTransition('a ] b')).toBeNull()
    expect(parseTransition('a [b] c')).toBeNull()
    expect(parseTransition('a / b / c')).toBeNull()
  })

  it('updates triggers by position, clears a missing guard and manages the single effect', () => {
    const a = stateDiagram()
    const s1 = a.node('State', 0, 0)
    const s2 = a.node('State', 300, 0)
    const edge = a.edge('Transition', s1, s2)
    const t = edge.model as Elem
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: t._id, syntax: 'transition' }, 'one, two [g] / eff')).toBe(true)
    const [e1, e2] = t['triggers'] as Elem[]
    expect([e1?.['name'], e2?.['name']]).toEqual(['one', 'two'])
    expect(t['guard']).toBe('g')
    expect((t['effects'] as Elem[]).map((e) => [e._type, e['name']])).toEqual([['UMLOpaqueBehavior', 'eff']])
    const effectId = (t['effects'] as Elem[])[0]?._id
    // Rename in place, drop the surplus trigger, clear the guard, keep the effect element.
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: t._id, syntax: 'transition' }, 'uno / eff2')).toBe(true)
    expect((t['triggers'] as Elem[]).map((e) => e['name'])).toEqual(['uno'])
    expect((t['triggers'] as Elem[])[0]?._id).toBe(e1?._id)
    expect(t['guard']).toBe('')
    expect((t['effects'] as Elem[])[0]?._id).toBe(effectId)
    expect((t['effects'] as Elem[])[0]?.['name']).toBe('eff2')
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: t._id, syntax: 'transition' }, '')).toBe(true)
    expect(t['triggers']).toEqual([])
    expect(t['effects']).toEqual([])
    expect(applyQuickEdit(a.engine, { kind: 'custom', elementId: t._id, syntax: 'transition' }, 'bad [')).toBe(false)
  })
})

describe('transition edges', () => {
  it('draws a solid line with a stick arrow head and the string 15 above the midpoint', () => {
    const a = stateDiagram()
    const s1 = a.node('State', 0, 0, 100, 50)
    const s2 = a.node('State', 300, 0, 100, 50)
    const edge = a.edge('Transition', s1, s2)
    applyQuickEdit(a.engine, { kind: 'custom', elementId: edge.model?._id as string, syntax: 'transition' }, 'go [ok] / run')
    const l = edgeOf(a.layout(), edge)
    expect(l.dash).toBe('solid')
    expect(l.tailEnd.style).toBe('flat')
    expect(l.headEnd.style).toBe('stickArrow')
    expect(l.labels).toHaveLength(1)
    const label = l.labels[0]
    expect(label?.text).toBe('go [ok] / run')
    expect(label?.edit).toEqual({ kind: 'custom', elementId: edge.model?._id, syntax: 'transition' })
    // Above the line (y = 25) at about the midpoint x = 200.
    expect((label?.box.top ?? 0) + (label?.box.height ?? 0)).toBeLessThan(25)
    expect((label?.box.left ?? 0) + (label?.box.width ?? 0) / 2).toBeGreaterThan(190)
    expect((label?.box.left ?? 0) + (label?.box.width ?? 0) / 2).toBeLessThan(250)
  })

  it('hides an empty label but offers the string editor on double-click', () => {
    const a = stateDiagram()
    const s1 = a.node('State', 0, 0)
    const s2 = a.node('State', 300, 0)
    const edge = a.edge('Transition', s1, s2)
    const l = edgeOf(a.layout(), edge)
    expect(l.labels).toHaveLength(0)
    expect(l.fallbackEdit?.target).toEqual({ kind: 'custom', elementId: edge.model?._id, syntax: 'transition' })
  })

  it('draws a self transition as a loop to the right of the state', () => {
    const a = stateDiagram()
    const s = a.node('State', 0, 0, 100, 50)
    const layout = a.layout()
    const id = createEdgeBetween(a.env, layout, { kind: 'Transition', selfConnection: true }, s._id, s._id, { x: 50, y: 25 }) as string
    const l = edgeOf(a.layout(), a.repository.get(id) as View)
    const maxX = Math.max(...l.points.map((p) => p.x))
    expect(maxX).toBe(130)
    expect(l.points.length).toBeGreaterThanOrEqual(4)
  })
})

describe('region containment', () => {
  it('moves the model between regions as one undoable operation and back to regions[0] on the canvas', () => {
    const a = stateDiagram()
    const comp = a.node('CompositeState', 0, 0, 300, 200)
    const loose = a.node('State', 400, 0, 100, 50)
    const region = regionViews(comp)[0] as NodeView
    const innerRegion = (comp.model?.['regions'] as Elem[])[0] as Elem
    // Drop into the region.
    const drop = { container: region }
    const before = a.engine.canUndo
    moveSelection(a.env, [loose._id], -330, 60, drop)
    expect(before).toBe(a.engine.canUndo)
    expect(loose.containerView).toBe(region)
    expect(region.containedViews).toContain(loose)
    expect(loose.model?._parent).toBe(innerRegion)
    expect(innerRegion['vertices']).toContain(loose.model)
    expect(a.region['vertices']).not.toContain(loose.model)
    // One undo reverts both the containment and the model move.
    a.engine.undo()
    expect(loose.containerView ?? null).toBeNull()
    expect(loose.model?._parent).toBe(a.region)
    a.engine.redo()
    expect(loose.model?._parent).toBe(innerRegion)
    // Drop onto the canvas.
    moveSelection(a.env, [loose._id], 400, 0, { container: null })
    expect(loose.containerView ?? null).toBeNull()
    expect(loose.model?._parent).toBe(a.region)
    expect(innerRegion['vertices']).not.toContain(loose.model)
  })

  it('moves contained vertex views with their composite state', () => {
    const a = stateDiagram()
    const comp = a.node('CompositeState', 0, 0, 300, 200)
    const id = createNodeAt(a.env, a.layout(), 'State', { left: 30, top: 60, width: 0, height: 0 }) as string
    const inner = a.repository.get(id) as NodeView
    expect(inner.containerView).toBe(regionViews(comp)[0])
    const l0 = nodeOf<StateData>(a.layout(), inner).box
    moveSelection(a.env, [comp._id], 50, 20)
    const l1 = nodeOf<StateData>(a.layout(), inner).box
    expect([l1.left - l0.left, l1.top - l0.top]).toEqual([50, 20])
    // Selecting both moves the child once.
    moveSelection(a.env, [comp._id, inner._id], 10, 10)
    const l2 = nodeOf<StateData>(a.layout(), inner).box
    expect([l2.left - l1.left, l2.top - l1.top]).toEqual([10, 10])
  })

  it('draws a dropped child after its container', () => {
    const a = stateDiagram()
    const loose = a.node('State', 400, 0, 100, 50)
    const comp = a.node('CompositeState', 0, 0, 300, 200)
    moveSelection(a.env, [loose._id], -330, 60, { container: regionViews(comp)[0] as View })
    const order = a.diagram.ownedViews
    expect(order.indexOf(loose)).toBeGreaterThan(order.indexOf(comp))
  })

  it('refuses to drop a state into its own descendant region and keeps notes out of regions', () => {
    const a = stateDiagram()
    const outer = a.node('CompositeState', 0, 0, 300, 200)
    const innerId = createNodeAt(a.env, a.layout(), 'CompositeState', { left: 20, top: 40, width: 120, height: 100 }) as string
    const inner = a.repository.get(innerId) as View
    expect(inner.containerView).toBe(regionViews(outer)[0])
    // The outer state cannot be dropped into the region of the state it contains.
    const innerRegion = regionViews(inner)[0] as View
    expect(findDropContainer(a.env, a.layout(), { x: 60, y: 100 }, [outer])).toBeNull()
    expect(innerRegion).toBeDefined()
    // Notes are never contained by a region.
    const note = a.repository.get(createNodeAt(a.env, a.layout(), 'Note', { left: 30, top: 60, width: 0, height: 0 }) as string) as View
    expect(note.containerView ?? null).toBeNull()
  })

  it('draws every notation to SVG without errors', () => {
    const a = stateDiagram()
    const kinds: NodeKind[] = ['State', 'CompositeState', 'OrthogonalState', 'SubmachineState', 'InitialState', 'Choice', 'Join', 'Fork', 'Junction', 'ShallowHistory', 'DeepHistory', 'EntryPoint', 'ExitPoint', 'Terminate', 'FinalState']
    const views = kinds.map((k, i) => a.node(k, (i % 5) * 320, Math.floor(i / 5) * 280))
    a.edge('Transition', views[4] as View, views[0] as View)
    const { svg } = renderDiagramSvg(a.diagram, a.repository, a.measurer)
    expect(svg).toContain('<svg')
    expect(svg).toContain('H*')
    expect(svg).toContain('State1')
  })
})

describe('.mdj round trip', () => {
  it('preserves composite and orthogonal states, transitions and internal behaviors', () => {
    const a = stateDiagram()
    const init = a.node('InitialState', 10, 10)
    const comp = a.node('CompositeState', 100, 10, 300, 200)
    a.node('OrthogonalState', 100, 300, 300, 300)
    a.node('SubmachineState', 500, 10)
    const inner = a.repository.get(createNodeAt(a.env, a.layout(), 'State', { left: 130, top: 60, width: 0, height: 0 }) as string) as View
    const choice = a.node('Choice', 500, 300)
    const t1 = a.edge('Transition', init, comp)
    a.edge('Transition', inner, inner)
    const t3 = a.edge('Transition', comp, choice)
    setFields(a.engine, t1.model as Elem, { guard: 'x' })
    applyQuickEdit(a.engine, { kind: 'custom', elementId: t3.model?._id as string, syntax: 'transition' }, 'e1, e2 [g] / f')
    addModelElement(a.engine, comp.model as Elem, ADD_ITEMS.find((i) => i.id === 'do-activity') as never)
    expect(validateModel(a.repository.project as Project)).toEqual([])
    const text = writeMdj(a.repository.project as Project)
    const reread = readMdj(text)
    expect(reread.warnings).toEqual([])
    expect(writeMdj(reread.project)).toBe(text)
    const diagrams = [...(reread.project.ownedElements as Elem[])].length
    expect(diagrams).toBeGreaterThan(0)
    expect(text).toContain('"UMLStateView"')
    expect(text).toContain('"UMLRegionView"')
    expect(text).toContain('"UMLTransitionView"')
    expect(text).toContain('"UMLPseudostate"')
    expect(isKindOf(inner.model, 'UMLState')).toBe(true)
  })
})
