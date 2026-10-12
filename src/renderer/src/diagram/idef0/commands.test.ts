import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../commands'
import { writeMdj } from '../../format'
import { buildOrderExample } from '../../model/idef0-example'
import type { Elem, View } from '../../model'
import { projectStore } from '../../store'
import { ensureNotations } from '../notations'
import { Idef0CommandIds, registerIdef0Commands, type Idef0CommandContext, type Idef0ListItem } from './commands'

const ps = () => projectStore.getState()

function setup() {
  ensureNotations()
  const example = buildOrderExample()
  ps().openProject(writeMdj(example.project), null)
  const repo = ps().repository
  const registry = new CommandRegistry()
  const opened: Array<{ id: string; views: readonly string[] }> = []
  const lists: Array<{ title: string; items: readonly Idef0ListItem[] }> = []
  const toasts: string[] = []
  const answers = { count: 3 as number | null }
  const ctx: Idef0CommandContext = {
    promptBoxCount: async () => answers.count,
    openDiagram: (id, views = []) => {
      opened.push({ id, views })
      ps().openDiagram(id)
      ps().select({ views })
    },
    showList: (title, items) => lists.push({ title, items }),
    toast: (t) => toasts.push(t)
  }
  registerIdef0Commands(registry, ctx)
  const diagram = (id: string): Elem => repo.get(id) as Elem
  const viewOf = (diagramId: string, model: string): View =>
    (diagram(diagramId)['ownedViews'] as View[]).find((v) => (v.model as Elem | null)?._id === model && v._type === 'IDEF0FunctionView') as View
  return { example, repo, registry, opened, lists, toasts, answers, diagram, viewOf }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('IDEF0 commands', () => {
  it('registers every command of the spec, skipping ids that already exist', () => {
    const { registry } = setup()
    const ids = registry.all().map((c) => c.id)
    for (const id of [
      'idef0.decompose',
      'idef0.go-parent',
      'idef0.go-child',
      'idef0.renumber',
      'idef0.sync-ports',
      'idef0.validate',
      'idef0.node-index',
      'idef0.tunnel-end',
      'idef0.add-boundary-input',
      'idef0.add-boundary-control',
      'idef0.add-boundary-output',
      'idef0.add-boundary-mechanism',
      'format.idef0.status.working',
      'format.idef0.status.draft',
      'format.idef0.status.recommended',
      'format.idef0.status.publication'
    ]) expect(ids).toContain(id)
    const again = new CommandRegistry()
    again.register({ id: 'idef0.renumber', label: 'x', run: () => undefined })
    registerIdef0Commands(again, { promptBoxCount: async () => null, openDiagram: () => undefined, showList: () => undefined, toast: () => undefined })
    expect(again.get('idef0.renumber')?.label).toBe('x')
  })

  it('is disabled outside IDEF0 diagrams', () => {
    const { registry, example } = setup()
    ps().closeDiagram(example.childDiagram._id)
    ps().closeDiagram(example.contextDiagram._id)
    expect(registry.isEnabled(Idef0CommandIds.validate)).toBe(false)
    expect(registry.isEnabled(Idef0CommandIds.renumber)).toBe(false)
  })

  it('enables Go to Parent on a child diagram only, and navigates with the box selected', () => {
    const { registry, example, opened } = setup()
    ps().openDiagram(example.contextDiagram._id)
    expect(registry.isEnabled(Idef0CommandIds.goParent)).toBe(false)
    ps().openDiagram(example.childDiagram._id)
    expect(registry.isEnabled(Idef0CommandIds.goParent)).toBe(true)
    registry.execute(Idef0CommandIds.goParent)
    expect(opened.at(-1)?.id).toBe(example.contextDiagram._id)
    expect(opened.at(-1)?.views).toHaveLength(1)
    expect(ps().activeDiagramId).toBe(example.contextDiagram._id)
  })

  it('goes to the child of the selected box', () => {
    const { registry, example, opened, viewOf } = setup()
    ps().openDiagram(example.contextDiagram._id)
    expect(registry.isEnabled(Idef0CommandIds.goChild)).toBe(false)
    ps().select({ views: [viewOf(example.contextDiagram._id, example.top._id)._id] })
    expect(registry.isEnabled(Idef0CommandIds.goChild)).toBe(true)
    registry.execute(Idef0CommandIds.goChild)
    expect(opened.at(-1)?.id).toBe(example.childDiagram._id)
  })

  it('decomposes the selected box that has no child, after asking for the box count', async () => {
    const { registry, example, opened, viewOf, answers, repo } = setup()
    ps().openDiagram(example.childDiagram._id)
    ps().select({ views: [viewOf(example.childDiagram._id, example.a2._id)._id] })
    expect(registry.isEnabled(Idef0CommandIds.decompose)).toBe(true)
    answers.count = null
    await registry.execute(Idef0CommandIds.decompose)
    expect((repo.get(example.a2._id) as Elem)['childDiagram']).toBeNull()
    answers.count = 4
    await registry.execute(Idef0CommandIds.decompose)
    const a2 = repo.get(example.a2._id) as Elem
    expect((a2['functions'] as Elem[]).length).toBe(4)
    expect(opened.at(-1)?.id).toBe((a2['childDiagram'] as Elem)._id)
    // The decomposed box can no longer be decomposed.
    ps().openDiagram(example.childDiagram._id)
    ps().select({ views: [viewOf(example.childDiagram._id, example.a2._id)._id] })
    expect(registry.isEnabled(Idef0CommandIds.decompose)).toBe(false)
  })

  it('shows validation warnings and the node index as lists', () => {
    const { registry, example, lists, repo } = setup()
    ps().openDiagram(example.childDiagram._id)
    registry.execute(Idef0CommandIds.validate)
    expect(lists.at(-1)?.title).toBe('IDEF0 validation: no warnings')
    ;(repo.get(example.a1._id) as Elem)['name'] = ''
    registry.execute(Idef0CommandIds.validate)
    expect(lists.at(-1)?.title).toBe('IDEF0 validation: 1 warning')
    expect(lists.at(-1)?.items[0]).toMatchObject({ elementId: example.a1._id, diagramId: example.childDiagram._id })
    registry.execute(Idef0CommandIds.nodeIndex)
    expect(lists.at(-1)?.items.map((i) => i.text.split('  ')[0])).toEqual(['A-0', 'A0', 'A1', 'A2', 'A3'])
  })

  it('renumbers, synchronizes ports and sets the status as undoable operations', () => {
    const { registry, example, repo, toasts } = setup()
    ps().openDiagram(example.childDiagram._id)
    registry.execute(Idef0CommandIds.renumber)
    expect(toasts.at(-1)).toMatch(/already follow/)
    registry.execute(Idef0CommandIds.syncPorts)
    expect(toasts.at(-1)).toMatch(/in sync/)
    expect(registry.isChecked(Idef0CommandIds.status('working'))).toBe(true)
    registry.execute(Idef0CommandIds.status('draft'))
    const child = repo.get(example.childDiagram._id) as Elem
    expect(child['status']).toBe('draft')
    expect(registry.isChecked(Idef0CommandIds.status('draft'))).toBe(true)
    expect(registry.isChecked(Idef0CommandIds.status('working'))).toBe(false)
    expect(ps().undoName).toBe('Change Status')
    ps().undo()
    expect(child['status']).toBe('working')
  })

  it('adds boundary arrows to the selected box and tunnels the selected arrow end', () => {
    const { registry, example, repo, viewOf } = setup()
    ps().openDiagram(example.childDiagram._id)
    ps().select({ views: [viewOf(example.childDiagram._id, example.a2._id)._id] })
    expect(registry.isEnabled(Idef0CommandIds.addBoundary('mechanism'))).toBe(true)
    registry.execute(Idef0CommandIds.addBoundary('mechanism'))
    const top = repo.get(example.top._id) as Elem
    expect((top['ports'] as Elem[]).map((p) => p['role'])).toContain('mechanism')
    expect((top['ports'] as Elem[]).length).toBe(5)
    const arrowView = (repo.get(example.childDiagram._id) as Elem)['ownedViews'] as View[]
    const validated = arrowView.find((v) => (v.model as Elem | null)?.['name'] === 'Validated Order') as View
    ps().select({ views: [validated._id] })
    registry.execute(Idef0CommandIds.tunnelEnd, { end: 'target' })
    expect((validated.model as Elem)['tunnelTarget']).toBe(true)
    registry.execute(Idef0CommandIds.tunnelEnd, { end: 'target' })
    expect((validated.model as Elem)['tunnelTarget']).toBe(false)
  })
})
