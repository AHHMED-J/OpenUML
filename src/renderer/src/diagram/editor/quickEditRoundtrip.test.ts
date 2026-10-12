import { describe, expect, it } from 'vitest'
import { createDiagram, ModelEngine } from '../../commands'
import { writeMdj } from '../../format'
import { createDefaultProject, DIAGRAM_TYPES, Repository, walk, type DiagramKind, type Elem, type View } from '../../model'
import { palettesFor } from '../../ui/toolbox/palettes'
import { FixedWidthTextMeasurer } from '../core'
import { nameEditText } from '../layout/helpers'
import type { EditTarget } from '../layout/types'
import { ensureNotations } from '../notations'
import { createEdgeBetween, createNodeAt, isNodeKind, layoutOf, type DiagramEnv, type ToolSpec } from './actions'
import { applyQuickEdit } from './quickEditApply'

/** Every diagram kind populated with each palette node, then one edge per palette edge tool. */
function populated(kind: DiagramKind): DiagramEnv {
  const repo = new Repository(createDefaultProject())
  const engine = new ModelEngine(repo)
  const diagram = createDiagram(engine, kind, repo.project?.ownedElements[0] as Elem).diagram
  const env: DiagramEnv = { engine, diagram, measurer: new FixedWidthTextMeasurer() }
  const items = palettesFor(diagram._type).flatMap((g) => g.items)
  items
    .filter((item) => isNodeKind(item.kind))
    .forEach((item, i) => createNodeAt(env, layoutOf(env), item.kind as never, { left: 40 + 200 * i, top: 300, width: 120, height: 80 }))
  const nodes = [...layoutOf(env).nodes.keys()].filter((id) => repo.get(id)?._parent === diagram)
  for (const item of items.filter((it) => !isNodeKind(it.kind))) {
    for (let i = 0; i + 1 < nodes.length; i++) {
      if (createEdgeBetween(env, layoutOf(env), item as ToolSpec, nodes[i] as string, nodes[i + 1] as string, { x: 0, y: 0 })) break
    }
  }
  return env
}

describe('quick edit', () => {
  ensureNotations()
  const silenced = console.error
  it.each(Object.keys(DIAGRAM_TYPES) as DiagramKind[])('committing the initial text unchanged keeps the model as is (%s)', (kind) => {
    console.error = () => undefined
    let env: DiagramEnv
    try {
      env = populated(kind)
    } finally {
      console.error = silenced
    }
    const { engine } = env
    const repo = engine.repository
    const project = repo.project as Elem
    engine.transact('Decorate', (b) => {
      for (const el of walk(project)) {
        if (el._type.endsWith('View')) continue
        if (typeof el['stereotype'] !== 'undefined') b.set(el, 'stereotype', 'st')
        if (typeof el['visibility'] === 'string') b.set(el, 'visibility', 'private')
      }
    })
    const layout = layoutOf(env)
    const edits: Array<{ target: EditTarget; text: string }> = []
    for (const node of layout.nodes.values()) for (const r of node.regions) edits.push({ target: r.target, text: r.text })
    for (const [id, edge] of layout.edges) {
      for (const l of edge.labels) if (l.edit) edits.push({ target: l.edit, text: l.editText ?? l.text })
      // The editor's fallback for edges without an editable label (see `openQuickEdit`).
      const model = (repo.get(id) as View | undefined)?.model
      if (!edge.labels.some((l) => l.edit) && !edge.fallbackEdit && model) edits.push({ target: { kind: 'name', elementId: model._id }, text: nameEditText(model) })
    }
    const changed: string[] = []
    for (const { target, text } of edits) {
      const before = writeMdj(project)
      applyQuickEdit(engine, target, text)
      if (writeMdj(project) !== before) {
        changed.push(`${'elementId' in target ? repo.get(target.elementId)?._type : target.viewId} ← ${JSON.stringify(text)}`)
        engine.undo()
      }
    }
    expect(changed).toEqual([])
  })
})
