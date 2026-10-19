import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry, setFieldsOfAll } from '../../commands'
import { writeMdj } from '../../format'
import { buildOrderExample } from '../../model/idef0-example'
import type { Elem, View } from '../../model'
import { projectStore } from '../../store'
import { ensureNotations } from '../notations'
import { assignPopoverState, closeAssignPopover } from './assignPopover'
import { Idef0CommandIds, registerIdef0Commands, type Idef0BoxChoice, type Idef0CommandContext, type Idef0ListItem } from './commands'

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
  const prompts: Array<number | undefined> = []
  const choices: Array<{ boxes: readonly Idef0BoxChoice[]; remove: number }> = []
  const answers = { count: 3 as number | null, remove: (() => null) as (boxes: readonly Idef0BoxChoice[], remove: number) => readonly string[] | null }
  const ctx: Idef0CommandContext = {
    promptBoxCount: async (initial) => {
      prompts.push(initial)
      return answers.count
    },
    chooseBoxesToRemove: async (boxes, remove) => {
      choices.push({ boxes, remove })
      return answers.remove(boxes, remove)
    },
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
  return { example, repo, registry, opened, lists, toasts, prompts, choices, answers, diagram, viewOf }
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
      'idef0.set-box-count',
      'idef0.go-parent',
      'idef0.go-child',
      'idef0.renumber',
      'idef0.sync-ports',
      'idef0.validate',
      'idef0.node-index',
      'idef0.tunnel-end',
      'idef0.reset-route',
      'idef0.apply-title-block',
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
    registerIdef0Commands(again, { promptBoxCount: async () => null, chooseBoxesToRemove: async () => null, openDiagram: () => undefined, showList: () => undefined, toast: () => undefined })
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

  describe('Set Number of Child Boxes', () => {
    const boxCount = (repo: { get: (id: string) => unknown }, id: string): number => ((repo.get(id) as Elem)['functions'] as Elem[]).length

    it('is available for a selected decomposed box and on a child diagram, not on A-0 or an undecomposed box', () => {
      const { registry, example, viewOf } = setup()
      const cmd = Idef0CommandIds.setBoxCount
      ps().openDiagram(example.contextDiagram._id)
      ps().select({ views: [] })
      expect(registry.isEnabled(cmd)).toBe(false)
      ps().select({ views: [viewOf(example.contextDiagram._id, example.top._id)._id] })
      expect(registry.isEnabled(cmd)).toBe(true)
      ps().openDiagram(example.childDiagram._id)
      ps().select({ views: [] })
      expect(registry.isEnabled(cmd)).toBe(true)
      ps().closeDiagram(example.childDiagram._id)
      ps().closeDiagram(example.contextDiagram._id)
      expect(registry.isEnabled(cmd)).toBe(false)
    })

    it('adds boxes after a prompt that defaults to the current count; same count and cancel change nothing', async () => {
      const { registry, example, repo, answers, prompts, toasts } = setup()
      ps().openDiagram(example.childDiagram._id)
      const depth = ps().engine.undoDepth
      answers.count = null
      await registry.execute(Idef0CommandIds.setBoxCount)
      answers.count = 3
      await registry.execute(Idef0CommandIds.setBoxCount)
      expect(prompts).toEqual([3, 3])
      expect(toasts.at(-1)).toMatch(/already has 3 boxes/)
      expect(ps().engine.undoDepth).toBe(depth)
      answers.count = 6
      await registry.execute(Idef0CommandIds.setBoxCount)
      expect(boxCount(repo, example.top._id)).toBe(6)
      expect(ps().engine.undoDepth).toBe(depth + 1)
      ps().undo()
      expect(boxCount(repo, example.top._id)).toBe(3)
    })

    it('lets the user choose the boxes to remove and removes exactly those in one undo step', async () => {
      const { registry, example, repo, answers, choices, viewOf } = setup()
      ps().openDiagram(example.contextDiagram._id)
      ps().select({ views: [viewOf(example.contextDiagram._id, example.top._id)._id] })
      answers.count = 1
      answers.remove = (boxes, remove) => boxes.slice(0, remove).map((b) => b.id)
      const depth = ps().engine.undoDepth
      await registry.execute(Idef0CommandIds.setBoxCount)
      expect(choices).toHaveLength(1)
      expect(choices[0]?.remove).toBe(2)
      expect(choices[0]?.boxes.map((b) => b.label)).toEqual(['A1  Receive Order', 'A2  Check Credit and Stock', 'A3  Ship and Invoice'])
      expect(choices[0]?.boxes[1]?.detail).toBe('3 arrows attached')
      expect(boxCount(repo, example.top._id)).toBe(1)
      expect((repo.get(example.a3._id) as Elem | undefined)?.['boxNumber']).toBe(1)
      expect(ps().engine.undoDepth).toBe(depth + 1)
      ps().undo()
      expect(boxCount(repo, example.top._id)).toBe(3)
    })

    it('does nothing when the choice is cancelled or has the wrong size', async () => {
      const { registry, example, repo, answers } = setup()
      ps().openDiagram(example.childDiagram._id)
      answers.count = 2
      await registry.execute(Idef0CommandIds.setBoxCount)
      answers.remove = (boxes) => boxes.slice(0, 2).map((b) => b.id)
      await registry.execute(Idef0CommandIds.setBoxCount)
      expect(boxCount(repo, example.top._id)).toBe(3)
    })
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

  it('carries the A-0 status down and applies its title block to the child diagrams', () => {
    const { registry, example, repo, toasts } = setup()
    const context = repo.get(example.contextDiagram._id) as Elem
    const child = repo.get(example.childDiagram._id) as Elem
    // A file written before inheritance: the A-0 has an author, its child none.
    expect([context['author'], child['author']]).toEqual(['A. Analyst', ''])
    ps().openDiagram(example.childDiagram._id)
    expect(registry.isEnabled(Idef0CommandIds.applyTitleBlock)).toBe(false)
    ps().openDiagram(example.contextDiagram._id)
    registry.execute(Idef0CommandIds.status('recommended'))
    expect([context['status'], child['status']]).toEqual(['recommended', 'recommended'])
    expect(ps().engine.undoDepth).toBe(1)
    setFieldsOfAll(ps().engine, [child], { status: 'draft' })
    expect(registry.isEnabled(Idef0CommandIds.applyTitleBlock)).toBe(true)
    registry.execute(Idef0CommandIds.applyTitleBlock)
    expect([child['author'], child['date'], child['status'], child['number']]).toEqual(['A. Analyst', '', 'recommended', ''])
    expect(toasts.at(-1)).toBe('Applied the title block to 1 child diagram')
    expect(ps().undoName).toBe('Apply Title Block to Child Diagrams')
    registry.execute(Idef0CommandIds.applyTitleBlock)
    expect(toasts.at(-1)).toMatch(/already have/)
    ps().undo()
    expect([child['author'], child['status']]).toEqual(['', 'draft'])
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

  it('resets the route of the selected arrows (enabled only when one has a route hint)', () => {
    const { example, registry, repo } = setup()
    const diagramId = example.childDiagram._id
    ps().openDiagram(diagramId)
    const arrow = ((repo.get(diagramId) as Elem)['ownedViews'] as View[]).find((v) => v._type === 'IDEF0ArrowView') as View
    ps().select({ views: [arrow._id] })
    expect(registry.isEnabled(Idef0CommandIds.resetRoute)).toBe(false)
    ps().engine.transact('Hint', (b) => b.set(arrow, 'routeY', 400))
    expect(registry.isEnabled(Idef0CommandIds.resetRoute)).toBe(true)
    registry.execute(Idef0CommandIds.resetRoute)
    expect(arrow['routeY']).toBe(-1)
    expect(ps().engine.undoName).toBe('Reset Arrow Route')
    expect(registry.isEnabled(Idef0CommandIds.resetRoute)).toBe(false)
  })
  it('opens the box table of the selected boundary arrow (Connect to...), not of an arrow between boxes', () => {
    const { example, registry, repo } = setup()
    const diagramId = example.childDiagram._id
    ps().openDiagram(diagramId)
    const views = (repo.get(diagramId) as Elem)['ownedViews'] as View[]
    const named = (name: string): View => views.find((v) => v._type === 'IDEF0ArrowView' && (v.model as Elem)['name'] === name) as View
    ps().select({ views: [named('Validated Order')._id] })
    expect(registry.isEnabled(Idef0CommandIds.connectTo)).toBe(false)
    ps().select({ views: [named('Customer Order')._id] })
    expect(registry.isEnabled(Idef0CommandIds.connectTo)).toBe(true)
    registry.execute(Idef0CommandIds.connectTo)
    const port = (named('Customer Order').model as Elem)['source'] as Elem
    expect(assignPopoverState()).toMatchObject({ diagramId, portId: port._id, checked: [example.a1._id] })
    closeAssignPopover()
  })
})
