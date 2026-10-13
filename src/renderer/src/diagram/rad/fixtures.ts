/**
 * Worked RAD examples used by tests (written in our own wording): an insurance application with a
 * part refinement, writing a letter with case refinements and a loop-back, reviewing and sending
 * letters with an outside party and nested refinements, and a legend with every symbol.
 *
 * Elements are placed on a grid: `(col, row)` is the centre of a symbol inside its role with
 * a column pitch of 190, a row pitch of 70, 52 from the role's left edge and 42 from its top.
 */
import { createDiagram, createEdge, createNode, setFields, ModelEngine } from '../../commands'
import { createDefaultProject, radProcessOf, Repository, setRadAutoThread, radAutoThread, type Diagram, type Elem, type NodeView, type View } from '../../model'
import type { RadNodeKind } from '../../model'
import { FixedWidthTextMeasurer } from '../core'
import { ensureNotations } from '../notations'

const GRID = { col: 190, row: 70, left: 52, top: 42 } as const

export interface RadRoleSpec {
  readonly left: number
  readonly top: number
  readonly width?: number
  readonly height?: number
  readonly agent: string
  readonly name: string
}

export interface PlacedRole {
  readonly model: Elem
  readonly view: NodeView
  readonly left: number
  readonly top: number
}

export class RadBuilder {
  readonly repository: Repository
  readonly engine: ModelEngine
  readonly diagram: Diagram
  readonly process: Elem
  readonly measurer = new FixedWidthTextMeasurer()
  readonly roles = new Map<string, PlacedRole>()
  readonly views = new Map<string, View>()
  /** Edge views by `from>to` (state lines) and `from=to` (interaction links). */
  readonly edges = new Map<string, View>()
  private readonly previousAutoThread: boolean

  constructor() {
    ensureNotations()
    this.previousAutoThread = radAutoThread()
    setRadAutoThread(false)
    this.repository = new Repository(createDefaultProject())
    this.engine = new ModelEngine(this.repository)
    this.diagram = createDiagram(this.engine, 'RADDiagram', this.repository.project as Elem).diagram
    this.process = radProcessOf(this.diagram) as Elem
  }

  /** Restores the auto-thread option changed for building. */
  done(): this {
    setRadAutoThread(this.previousAutoThread)
    return this
  }

  role(key: string, spec: RadRoleSpec): PlacedRole {
    const view = createNode(this.engine, {
      kind: 'RADRole',
      diagram: this.diagram,
      left: spec.left,
      top: spec.top,
      width: spec.width ?? 220,
      height: spec.height ?? 360
    }).view as NodeView
    setFields(this.engine, view.model as Elem, { agent: spec.agent, name: spec.name })
    const placed = { model: view.model as Elem, view, left: spec.left, top: spec.top }
    this.roles.set(key, placed)
    this.views.set(key, view)
    return placed
  }

  /** Centre of grid cell `(col, row)` of a role. */
  at(role: PlacedRole, col: number, row: number): { x: number; y: number } {
    return { x: role.left + GRID.left + col * GRID.col, y: role.top + GRID.top + row * GRID.row }
  }

  /** Creates an element centred on a grid cell; `fields` are set on its model afterwards. */
  el(key: string, roleKey: string, kind: RadNodeKind, col: number, row: number, name?: string, fields: Record<string, unknown> = {}): View {
    const role = this.roles.get(roleKey) as PlacedRole
    const c = this.at(role, col, row)
    const size = { RADStateMarker: [30, 18], RADStartMarker: [30, 18], RADEndMarker: [30, 18], RADUndefinedProcess: [44, 26], RADPartBranch: [26, 24], RADRoleStart: [26, 26], RADExternalRoleStart: [26, 26] }[kind as string] ?? [24, 24]
    const view = createNode(this.engine, {
      kind,
      diagram: this.diagram,
      left: Math.round(c.x - (size[0] as number) / 2),
      top: Math.round(c.y - (size[1] as number) / 2),
      container: role.view,
      ...(name !== undefined ? { name } : {})
    }).view as NodeView
    if (Object.keys(fields).length > 0) setFields(this.engine, view.model as Elem, fields)
    this.views.set(key, view)
    return view
  }

  /**
   * A refinement with its branches: the two default branches are placed on the given columns of the
   * refinement's row and renamed, further branches are created next to them.
   */
  refinement(key: string, roleKey: string, kind: 'RADCaseRefinement' | 'RADPartRefinement', col: number, row: number, name: string, branches: ReadonlyArray<{ key: string; col: number; name: string }>): View {
    const role = this.roles.get(roleKey) as PlacedRole
    const view = this.el(key, roleKey, kind, col, row, name)
    const own = (this.diagram.ownedViews as View[]).filter((v) => v.model?.['refinement'] === view.model)
    branches.forEach((b, i) => {
      const w = kind === 'RADCaseRefinement' ? 24 : 26
      const c = this.at(role, b.col, row)
      const target = own[i]
      if (target) {
        setFields(this.engine, target, { left: Math.round(c.x - w / 2) })
        setFields(this.engine, target.model as Elem, { name: b.name })
        this.views.set(b.key, target)
      } else {
        this.el(b.key, roleKey, kind === 'RADCaseRefinement' ? 'RADCaseBranch' : 'RADPartBranch', b.col, row, b.name)
      }
    })
    return view
  }

  line(from: string, to: string): View {
    const view = createEdge(this.engine, { kind: 'RADStateLine', diagram: this.diagram, tail: this.views.get(from) as View, head: this.views.get(to) as View }).view as View
    this.edges.set(`${from}>${to}`, view)
    return view
  }

  link(from: string, to: string): View {
    const view = createEdge(this.engine, { kind: 'RADInteractionLink', diagram: this.diagram, tail: this.views.get(from) as View, head: this.views.get(to) as View }).view as View
    this.edges.set(`${from}=${to}`, view)
    return view
  }

  /** The state line view from `from` to `to`. */
  e(from: string, to: string): View {
    return this.edges.get(`${from}>${to}`) as View
  }

  /** The interaction link view between two elements. */
  k(from: string, to: string): View {
    return this.edges.get(`${from}=${to}`) as View
  }

  v(key: string): View {
    return this.views.get(key) as View
  }
}

/** Fixture A: insurance application (two roles, part refinement, undefined processes, fan-in). */
export function insuranceFixture(): RadBuilder {
  const b = new RadBuilder()
  b.role('customer', { left: 0, top: 0, width: 340, height: 360, agent: 'Customer', name: 'Applying for an insurance policy' })
  b.role('agent', { left: 440, top: 0, width: 700, height: 700, agent: 'Insurance agent', name: 'Processing an insurance application' })
  b.el('c1', 'customer', 'RADInteraction', 0, 0, 'Submit policy application')
  b.el('c2', 'customer', 'RADInteraction', 0, 3, 'Receive acceptance or rejection of the policy')
  b.line('c1', 'c2')
  b.el('a1', 'agent', 'RADInteraction', 0, 0, 'Receive the application')
  b.el('a2', 'agent', 'RADActivity', 0, 1, 'Create a customer record')
  b.refinement('a3', 'agent', 'RADPartRefinement', 0, 2, 'Medical and financial evaluation', [
    { key: 'p1', col: 1, name: '' },
    { key: 'p2', col: 2, name: '' }
  ])
  b.el('m1', 'agent', 'RADActivity', 1, 3, 'Request medical risk assessment')
  b.el('m2', 'agent', 'RADUndefinedProcess', 1, 4, 'Medical assessment')
  b.el('m3', 'agent', 'RADActivity', 1, 5, 'Receive the medical assessment')
  b.el('f1', 'agent', 'RADActivity', 2, 3, 'Request financial risk assessment')
  b.el('f2', 'agent', 'RADUndefinedProcess', 2, 4, 'Financial assessment')
  b.el('f3', 'agent', 'RADActivity', 2, 5, 'Receive the financial assessment')
  b.el('a4', 'agent', 'RADActivity', 0, 7, 'Make decision')
  b.el('a5', 'agent', 'RADInteraction', 0, 8, 'Inform the customer of the decision')
  for (const [from, to] of [['a1', 'a2'], ['a2', 'a3'], ['p1', 'm1'], ['m1', 'm2'], ['m2', 'm3'], ['p2', 'f1'], ['f1', 'f2'], ['f2', 'f3'], ['m3', 'a4'], ['f3', 'a4'], ['a4', 'a5']] as const) b.line(from, to)
  b.link('c1', 'a1')
  b.link('a5', 'c2')
  return b.done()
}

/** Fixture B: writing a letter (two roles, case refinements, loop-back, empty path). */
export function letterFixture(): RadBuilder {
  const b = new RadBuilder()
  b.role('boss', { left: 0, top: 0, width: 560, height: 760, agent: 'Boss', name: 'Dictating a letter' })
  b.role('secretary', { left: 700, top: 70, width: 560, height: 440, agent: 'Secretary', name: 'Writing a letter' })
  b.el('b1', 'boss', 'RADActivity', 0, 0, 'Dictate the letter on a recorder')
  b.el('b2', 'boss', 'RADInteraction', 0, 1, 'Hand over the cassette')
  b.el('b3', 'boss', 'RADInteraction', 0, 5, 'Receive the letter')
  b.el('b4', 'boss', 'RADActivity', 0, 6, 'Review the letter')
  b.refinement('b5', 'boss', 'RADCaseRefinement', 0, 7, 'Is the letter correct?', [
    { key: 'no', col: 1, name: 'No' },
    { key: 'yes', col: 2, name: 'Yes' }
  ])
  b.el('b6', 'boss', 'RADActivity', 1, 8, 'Dictate the corrections')
  b.el('b7', 'boss', 'RADActivity', 0, 9, 'Sign the letter')
  for (const [from, to] of [['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'b5'], ['no', 'b6'], ['b6', 'b2'], ['yes', 'b7']] as const) b.line(from, to)
  b.el('s1', 'secretary', 'RADInteraction', 0, 0, 'Receive the cassette')
  b.refinement('s2', 'secretary', 'RADCaseRefinement', 0, 2, 'Is there a sample letter?', [
    { key: 'sno', col: 1, name: 'No' },
    { key: 'syes', col: 2, name: 'Yes' }
  ])
  b.el('s3', 'secretary', 'RADActivity', 1, 3, 'Write a new letter')
  b.el('s4', 'secretary', 'RADActivity', 2, 3, 'Change the sample letter')
  b.el('s5', 'secretary', 'RADInteraction', 0, 4, 'Hand over the letter')
  for (const [from, to] of [['s1', 's2'], ['sno', 's3'], ['syes', 's4'], ['s3', 's5'], ['s4', 's5']] as const) b.line(from, to)
  b.link('b2', 's1')
  b.link('s5', 'b3')
  return b.done()
}

/** Fixture C: reviewing and sending letters (one role, outside party, nested refinements, markers). */
export function clerkFixture(): RadBuilder {
  const b = new RadBuilder()
  b.role('clerk', { left: 200, top: 0, width: 1060, height: 780, agent: 'Office clerk', name: 'Reviewing and sending letters' })
  b.el('start', 'clerk', 'RADStartMarker', 0, 0, 'Start')
  b.el('c2', 'clerk', 'RADInteraction', 0, 2, "Receive the author's letter", { externalParty: 'Interaction with the author', side: 'left' })
  b.el('c3', 'clerk', 'RADActivity', 0, 3, 'Match envelopes')
  b.refinement('c4', 'clerk', 'RADCaseRefinement', 0, 4, 'Is it time to start preparing letters for mailing (envelopes, stamps)?', [
    { key: 'no', col: 1, name: 'No' },
    { key: 'yes', col: 2, name: 'Yes' }
  ])
  b.refinement('split', 'clerk', 'RADPartRefinement', 2, 5, '', [
    { key: 't1', col: 3, name: '' },
    { key: 't2', col: 4, name: '' }
  ])
  b.el('d1', 'clerk', 'RADActivity', 3, 6, 'Stamp envelopes')
  b.el('d2', 'clerk', 'RADActivity', 4, 6, 'Put letters in envelopes')
  b.el('c5', 'clerk', 'RADActivity', 0, 8, 'Take the letters to the post office')
  b.el('end', 'clerk', 'RADEndMarker', 0, 9, 'End of process')
  for (const [from, to] of [['start', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['no', 'c2'], ['yes', 'split'], ['t1', 'd1'], ['t2', 'd2'], ['d1', 'c5'], ['d2', 'c5'], ['c5', 'end']] as const) b.line(from, to)
  return b.done()
}

/** Fixture D: a legend with every symbol (three roles). */
export function legendFixture(): RadBuilder {
  const b = new RadBuilder()
  b.role('a', { left: 0, top: 70, width: 240, height: 320, agent: 'Agent A', name: 'Performing the first role' })
  b.role('b', { left: 330, top: 0, width: 1000, height: 700, agent: 'Agent B', name: 'Performing the second role' })
  b.role('c', { left: 1420, top: 0, width: 330, height: 330, agent: 'Agent C', name: 'Waiting for input' })
  b.el('a1', 'a', 'RADActivity', 0, 0, 'Activity')
  b.el('a2', 'a', 'RADInteraction', 0, 1, 'Interaction')
  b.el('a3', 'a', 'RADStateMarker', 0, 2, 'State marker')
  b.line('a1', 'a2')
  b.line('a2', 'a3')
  b.el('b1', 'b', 'RADStateMarker', 0, 0, 'State marker')
  b.el('b2', 'b', 'RADActivity', 0, 1, 'Activity')
  b.el('b3', 'b', 'RADInteraction', 0, 2, 'Interaction')
  b.refinement('b4', 'b', 'RADCaseRefinement', 0, 3, 'Question', [
    { key: 'k1', col: 1, name: 'Condition 1' },
    { key: 'k2', col: 4, name: 'Condition 2' }
  ])
  b.el('b5', 'b', 'RADActivity', 1, 4, 'Activity')
  b.el('b6', 'b', 'RADActivity', 4, 4, 'Activity')
  b.el('b7', 'b', 'RADRoleStart', 4, 5, '', {})
  b.refinement('b8', 'b', 'RADPartRefinement', 1, 5, 'Parallel work', [
    { key: 'q1', col: 2, name: '' },
    { key: 'q2', col: 3, name: '' }
  ])
  b.el('b9', 'b', 'RADActivity', 2, 6, 'Activity')
  b.el('b10', 'b', 'RADActivity', 3, 6, 'Activity')
  b.el('b11', 'b', 'RADEndMarker', 0, 8, 'State marker')
  b.el('c1', 'c', 'RADWait', 0, 0, 'Awaited event')
  b.el('c2', 'c', 'RADUndefinedProcess', 0, 1, 'Undefined behavior')
  b.el('c3', 'c', 'RADExternalRoleStart', 0, 2, '', { externalRole: 'Role outside the model' })
  setFields(b.engine, b.v('b7').model as Elem, { role: b.roles.get('c')?.model })
  for (const [from, to] of [['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['k1', 'b5'], ['k2', 'b6'], ['b6', 'b7'], ['b5', 'b8'], ['q1', 'b9'], ['q2', 'b10'], ['b9', 'b11'], ['b10', 'b11'], ['c1', 'c2'], ['c2', 'c3']] as const) b.line(from, to)
  b.link('a2', 'b3')
  return b.done()
}
