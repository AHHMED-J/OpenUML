/**
 * Performance benchmarks of the layout and editing hot paths on large generated models.
 * Run with `npx vitest run -c bench/vitest.config.ts` (not part of `npm test`); each case prints
 * its median time. See docs/audit/performance.md.
 */
import { afterAll, describe, it } from 'vitest'
import { addAttribute, addOperation, createDiagram, createEdge, createNode, ModelEngine } from '../src/renderer/src/commands'
import { FixedWidthTextMeasurer } from '../src/renderer/src/diagram/core'
import { moveSelection, previewLayout, type DiagramEnv } from '../src/renderer/src/diagram/editor/actions'
import { computeDiagramLayout } from '../src/renderer/src/diagram/layout/layoutDiagram'
import { ensureNotations } from '../src/renderer/src/diagram/notations'
import { RadBuilder } from '../src/renderer/src/diagram/rad/fixtures'
import { readMdj, writeMdj } from '../src/renderer/src/format'
import { createDefaultProject, Repository, type Diagram, type Elem, type View } from '../src/renderer/src/model'
import { flattenTree } from '../src/renderer/src/ui/explorer/tree'

ensureNotations()

const results: Array<{ case: string; 'median ms': number }> = []
let suite = ''

/** Records the median time of `fn` over `runs` runs (after a warm-up). */
function bench(name: string, fn: () => void, runs = 15): void {
  const label = `${suite}: ${name}`
  it(name, () => {
    for (let i = 0; i < 3; i++) fn()
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      fn()
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    results.push({ case: label, 'median ms': Number((times[Math.floor(runs / 2)] as number).toFixed(2)) })
  })
}

afterAll(() => {
  const width = Math.max(...results.map((r) => r.case.length))
  process.stdout.write(`\n${results.map((r) => `${r.case.padEnd(width)}  ${r['median ms'].toFixed(2).padStart(8)} ms`).join('\n')}\n\n`)
})

interface ClassDiagram extends DiagramEnv {
  readonly repository: Repository
  readonly classes: readonly View[]
}

/** `n` classes (3 attributes, 2 operations each) on a grid, joined by n - 1 associations/generalizations. */
function classDiagram(n: number, repository = new Repository(createDefaultProject()), engine = new ModelEngine(repository)): ClassDiagram {
  const model = (repository.project?.ownedElements as Elem[])[0] as Elem
  const diagram = createDiagram(engine, 'ClassDiagram', model).diagram as Diagram
  const classes: View[] = []
  const cols = Math.ceil(Math.sqrt(n))
  engine.transact('build', () => {
    for (let i = 0; i < n; i++) {
      const v = createNode(engine, { kind: 'Class', diagram, left: 40 + (i % cols) * 260, top: 40 + Math.floor(i / cols) * 220, name: `Class${i}` }).view as View
      for (let a = 0; a < 3; a++) addAttribute(engine, v.model as Elem, { name: `attr${a}_${i}` })
      for (let o = 0; o < 2; o++) addOperation(engine, v.model as Elem, { name: `op${o}_${i}` })
      classes.push(v)
    }
    for (let i = 1; i < n; i++) {
      const j = i % cols === 0 ? i - cols : i - 1
      createEdge(engine, { kind: i % 3 === 0 ? 'Generalization' : 'Association', diagram, tail: classes[i] as View, head: classes[Math.max(0, j)] as View })
    }
  })
  engine.clearHistory()
  return { engine, diagram, measurer: new FixedWidthTextMeasurer(), repository, classes }
}

for (const n of [200, 1000]) {
  describe(`class diagram, ${n} classes`, () => {
    suite = `class diagram, ${n} classes`
    const t = classDiagram(n)
    const id = (t.classes[Math.floor(n / 2)] as View)._id
    let layout = computeDiagramLayout(t.diagram, t.repository, t.measurer)
    let dx = 10

    bench('full layout', () => {
      computeDiagramLayout(t.diagram, t.repository, t.measurer)
    })

    bench('move one class and re-layout (one edit)', () => {
      moveSelection(t, [id], dx, 0, undefined, layout)
      dx = -dx
      layout = computeDiagramLayout(t.diagram, t.repository, t.measurer, { previous: layout })
    })

    bench('live drag preview frame', () => {
      dx = (dx + 7) % 40
      previewLayout(t, () => moveSelection(t, [id], dx, 0, undefined, layout), layout)
    })
  })
}

describe('role activity diagram, 20 roles x 20 activities', () => {
  suite = 'RAD 20x20'
  const r = new RadBuilder()
  for (let i = 0; i < 20; i++) {
    r.role(`r${i}`, { left: 40 + (i % 5) * 900, top: 40 + Math.floor(i / 5) * 1600, width: 860, height: 1540, agent: `Agent${i}`, name: `Role${i}` })
    for (let j = 0; j < 20; j++) r.el(`r${i}a${j}`, `r${i}`, 'RADActivity', j % 4, Math.floor(j / 4) * 2 + 1, `Act ${i}.${j}`)
    for (let j = 1; j < 20; j++) r.line(`r${i}a${j - 1}`, `r${i}a${j}`)
  }
  r.done()

  bench('full layout', () => {
    computeDiagramLayout(r.diagram, r.repository, r.measurer)
  })
})

describe('project with 20 class diagrams of 40 classes', () => {
  suite = 'project 20x40'
  const repository = new Repository(createDefaultProject())
  const engine = new ModelEngine(repository)
  for (let d = 0; d < 20; d++) classDiagram(40, repository, engine)
  const project = repository.project as Elem
  const expanded: Record<string, true> = {}
  for (const el of repository.elements()) expanded[el._id] = true
  const text = writeMdj(project)

  bench('explorer tree, everything expanded', () => {
    flattenTree(project, { expanded, collapsedFolders: {} })
  })

  bench('.mdj write', () => {
    writeMdj(project)
  })

  bench('.mdj read', () => {
    readMdj(text)
  })
})
