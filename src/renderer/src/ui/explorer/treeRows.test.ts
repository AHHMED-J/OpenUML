import { describe, expect, it } from 'vitest'
import { buildOrderExample } from '../../model/idef0-example'
import { createDiagram, createNode, ModelEngine } from '../../commands'
import { createDefaultProject, Repository, type Diagram, type Elem } from '../../model'
import { flattenDiagramTree, folderKey, flattenTree, searchTree, treeLabel, type TreeRow } from './tree'

/** A row as text: its guides (│ pass, ├ tee, └ elbow, space none) and label. */
const draw = (row: TreeRow): string =>
  row.guides.map((g) => ({ none: ' ', pass: '│', tee: '├', elbow: '└' })[g.kind]).join('') + treeLabel(row.node)

describe('explorer rows', () => {
  it('draws guide lines for every level, ending the line at the last child', () => {
    const ex = buildOrderExample()
    const expanded = { [ex.project._id]: true, [ex.model._id]: true, [ex.top._id]: true, [ex.a1._id]: true } as const
    const rows = flattenTree(ex.project, { expanded, collapsedFolders: { [folderKey(ex.a1, 'control')]: true } })
    expect(rows.map(draw)).toEqual([
      'Order Handling',
      '└Order Management',
      ' ├A-0 Context diagram: Process Customer Order',
      ' └A0 Process Customer Order',
      '  ├A0 Diagram: Process Customer Order',
      '  ├Inputs (1)',
      '  │└Input 1: Customer Order',
      '  ├Controls (1)',
      '  │└Control 1: Sales Policy',
      '  ├Outputs (1)',
      '  │└Output 1: Shipped Order',
      '  ├Mechanisms (1)',
      '  │└Mechanism 1: Order Staff',
      '  ├A1 Receive Order',
      '  │├Inputs (1)',
      '  ││└Input 1: Customer Order',
      '  │├Controls (1)',
      '  │├Outputs (1)',
      '  ││└Output 1: Validated Order',
      '  │└Mechanisms (1)',
      '  │ └Mechanism 1: Order Staff',
      '  ├A2 Check Credit and Stock',
      '  └A3 Ship and Invoice'
    ])
    // Folder lines carry the role of the folder; other lines are neutral.
    const entry = rows.find((r) => treeLabel(r.node) === 'Output 1: Validated Order') as TreeRow
    expect(entry.guides.map((g) => g.role)).toEqual([null, null, null, null, 'output'])
    // Collapsed folder, expandable but closed; the parent key leads back up for keyboard navigation.
    const controls = rows.find((r) => r.node.key === folderKey(ex.a1, 'control')) as TreeRow
    expect(controls).toMatchObject({ expandable: true, expanded: false, parentKey: ex.a1._id, depth: 4 })
    expect(entry.parentKey).toBe(folderKey(ex.a1, 'output'))
  })

  it('lists arrows flat under the box when grouping is off', () => {
    const ex = buildOrderExample()
    const expanded = { [ex.project._id]: true, [ex.model._id]: true, [ex.top._id]: true, [ex.a2._id]: true } as const
    const rows = flattenTree(ex.project, { expanded, collapsedFolders: {} }, { groupArrows: false })
    const a2 = rows.findIndex((r) => r.el === ex.a2)
    expect(rows.slice(a2 + 1, a2 + 4).map(draw)).toEqual(['  │├Input 1: Validated Order', '  │├Control 1', '  │└Output 1: Approved Order'])
  })

  it('finds arrows by name once each in a search', () => {
    const ex = buildOrderExample()
    const rows = searchTree(ex.project, 'validated')
    expect(rows.map((r) => treeLabel(r.node))).toEqual(['Output 1: Validated Order'])
    expect(rows[0]?.guides).toEqual([])
  })

  it('Diagrams Only lists every diagram with the containers that lead to it, all open, and nothing else', () => {
    const ex = buildOrderExample()
    const rows = flattenDiagramTree(ex.project)
    expect(rows.map(draw)).toEqual(DIAGRAMS_ONLY_IDEF0)
    expect(rows.every((r) => !r.expandable)).toBe(true)

    const project = createDefaultProject()
    const engine = new ModelEngine(new Repository(project))
    const model = (project['ownedElements'] as Elem[])[0] as Elem
    const main = (model['ownedElements'] as Elem[])[0] as Diagram
    createNode(engine, { kind: 'Class', diagram: main, left: 0, top: 0, name: 'Order' })
    createDiagram(engine, 'SequenceDiagram', model, 'Checkout')
    createDiagram(engine, 'StatechartDiagram', project, 'Lifecycle')
    expect(flattenDiagramTree(project).map(draw)).toEqual(DIAGRAMS_ONLY_UML)
  })
})

const DIAGRAMS_ONLY_IDEF0 = [
  'Order Handling',
  '└Order Management',
  ' ├A-0 Context diagram: Process Customer Order',
  ' └A0 Process Customer Order',
  '  └A0 Diagram: Process Customer Order'
]
const DIAGRAMS_ONLY_UML = [
  'Untitled',
  '├Model',
  '│├Main',
  '│└Collaboration1',
  '│ └Interaction1',
  '│  └Checkout',
  '└StateMachine1',
  ' └Lifecycle'
]
