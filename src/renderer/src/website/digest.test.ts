import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { TreeEntry, WebsiteDigest } from '../../../shared/website'
import { readMdj } from '../format'
import { FixedWidthTextMeasurer } from '../diagram/core'
import { ensureNotations } from '../diagram/notations'
import type { Repository } from '../model'
import { buildWebsiteDigest, diagramsInTreeOrder } from './digest'

const measurer = new FixedWidthTextMeasurer()

function load(path: string): Repository {
  ensureNotations()
  return readMdj(readFileSync(new URL(path, import.meta.url), 'utf8')).repository
}

const release = (): Repository => load('../../../../examples/software-release-idef0.mdj')

function digestOf(repository: Repository, diagramIds?: readonly string[]): WebsiteDigest {
  return buildWebsiteDigest(repository, { title: 'Model', generator: 'OpenUML test', measurer, ...(diagramIds ? { diagramIds } : {}) })
}

function flatten(entries: readonly TreeEntry[]): TreeEntry[] {
  return entries.flatMap((e) => [e, ...flatten(e.children)])
}

/** Every top-level view of every diagram is drawn with its data-view-id. */
function expectViewsDrawn(digest: WebsiteDigest): void {
  for (const d of Object.values(digest.diagrams)) {
    for (const viewId of Object.keys(d.views)) expect(d.svg).toContain(`data-view-id="${viewId}"`)
  }
}

describe('website digest', () => {
  it('links the IDEF0 levels of the Software Release example both ways', () => {
    const digest = digestOf(release())
    const diagrams = digest.diagramOrder.map((id) => digest.diagrams[id]!)
    expect(diagrams.map((d) => d.label)).toEqual([
      'A-0 Context diagram: Release a Software Change',
      'A0 Diagram: Release a Software Change',
      'A3 Diagram: Build and Test Change'
    ])
    const [context, a0, a3] = diagrams as [NonNullable<(typeof diagrams)[0]>, NonNullable<(typeof diagrams)[0]>, NonNullable<(typeof diagrams)[0]>]
    // A-0's box opens A0; A0's box 3 opens A3; no other box is decomposed.
    expect(Object.values(context.drill)).toEqual([a0.id])
    expect(Object.values(a0.drill)).toEqual([a3.id])
    expect(Object.values(a3.drill)).toEqual([])
    // Going up: A3 sits under A0, on the view of box 3; A0 under the A-0 box; A-0 is the top.
    expect(a3.parent?.diagram).toBe(a0.id)
    expect(Object.keys(a0.drill)).toEqual([a3.parent?.view])
    expect(a0.parent?.diagram).toBe(context.id)
    expect(context.parent).toBeNull()
    expectViewsDrawn(digest)
  })

  it('lists the model tree like the Model Explorer, with each element and where it is drawn', () => {
    const digest = digestOf(release())
    const rows = flatten(digest.tree)
    expect(digest.tree[0]?.label).toBe('Software Release')
    const box = rows.find((r) => r.label === 'A3 Build and Test Change')
    expect(box?.type).toBe('IDEF0Function')
    // Its arrows are in role folders, as in the explorer.
    expect(box?.children.some((c) => c.element === undefined && /^Inputs \(\d+\)$/.test(c.label))).toBe(true)
    const element = digest.elements[box?.element as string]
    expect(element?.typeLabel).toBe('Function')
    expect(element?.views.map((v) => digest.diagrams[v.diagram]?.label)).toEqual(['A0 Diagram: Release a Software Change'])
    // Every element of the tree has an entry.
    for (const row of rows) if (row.element) expect(digest.elements[row.element]).toBeDefined()
  })

  it('keeps only the chosen diagrams and the links between them', () => {
    const repository = release()
    const [context, a0, a3] = digestOf(repository).diagramOrder.map((id) => repository.get(id))
    const digest = digestOf(repository, [a3!._id, context!._id])
    expect(digest.diagramOrder).toEqual([context!._id, a3!._id])
    expect(digest.diagrams[a0!._id]).toBeUndefined()
    // A-0 no longer drills (A0 is not exported) and A3 has no exported parent.
    expect(digest.diagrams[context!._id]?.drill).toEqual({})
    expect(digest.diagrams[a3!._id]?.parent).toBeNull()
  })

  it('starts on the requested diagram when it is exported, else on the first one', () => {
    const repository = release()
    const [context, , a3] = digestOf(repository).diagramOrder.map((id) => repository.get(id))
    const make = (start: string | null): string => buildWebsiteDigest(repository, { title: 'T', generator: 'G', measurer, start }).start
    expect(make(a3!._id)).toBe(a3!._id)
    expect(make(null)).toBe(context!._id)
    expect(make('missing')).toBe(context!._id)
  })

  it('offers the diagrams in Model Explorer order', () => {
    const repository = release()
    expect(diagramsInTreeOrder(repository).map((d) => d._id)).toEqual(digestOf(repository).diagramOrder)
  })

  it('refuses an empty selection', () => {
    expect(() => digestOf(release(), [])).toThrow(/at least one diagram/)
  })

  it.each(['../format/fixtures/example.mdj', '../format/fixtures/idef0-order.mdj'])('builds the website of %s', (path) => {
    const repository = load(path)
    const digest = digestOf(repository)
    expect(digest.diagramOrder).toHaveLength(repository.diagrams().length)
    expectViewsDrawn(digest)
    // Round trip through the page's JSON keeps everything.
    expect(JSON.parse(JSON.stringify(digest))).toEqual(digest)
  })
})
