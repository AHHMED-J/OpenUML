/**
 * IDEF0 commands (spec 11 §4.3). The shell supplies the interactive parts (box-count prompt,
 * result lists, opening diagrams); the model changes are the functions of `decompose.ts`.
 */
import { setFieldsOfAll, type CommandRegistry } from '../../commands'
import { buildNodeIndex, isContextDiagram, isIdef0Function, isKindOf, modelOf, nodeNumber, roleOf, type Diagram, type Elem, type View } from '../../model'
import { activeDiagram, projectStore, selectedViews } from '../../store'
import { getTextMeasurer } from '../layout/measurer'
import { addChildBoxes, childBoxes, removeChildBoxes } from './boxCount'
import { addBoundaryArrow, decomposeFunction, renumberBoxes, syncPorts, toggleTunnel } from './decompose'
import { callTarget, childTarget, parentTarget, type DiagramTarget } from './navigation'
import { validateIdef0, type IdefIssue } from './validate'
import { STATUS_STAGES, statusLabel } from './strings'

export const Idef0CommandIds = {
  decompose: 'idef0.decompose',
  setBoxCount: 'idef0.set-box-count',
  goParent: 'idef0.go-parent',
  goChild: 'idef0.go-child',
  renumber: 'idef0.renumber',
  syncPorts: 'idef0.sync-ports',
  validate: 'idef0.validate',
  nodeIndex: 'idef0.node-index',
  tunnelEnd: 'idef0.tunnel-end',
  addBoundary: (role: string) => `idef0.add-boundary-${role}`,
  colorByRole: 'format.idef0.color-by-role',
  status: (stage: string) => `format.idef0.status.${stage}`
} as const

/** One row of a result list: click selects `elementId` or opens `diagramId`. */
export interface Idef0ListItem {
  readonly text: string
  readonly indent?: number
  readonly elementId?: string
  readonly diagramId?: string | null
}

/** One box offered for removal when the number of child boxes shrinks. */
export interface Idef0BoxChoice {
  /** The function's ID. */
  readonly id: string
  /** Node number and name, e.g. "A31  Check Stock". */
  readonly label: string
  /** What removing the box would lose. */
  readonly detail: string
}

/** The interactive services the shell provides to the IDEF0 commands. */
export interface Idef0CommandContext {
  /** Asks for the number of child boxes (1 to 6; fewer than 3 is warned by W01); null = cancelled. */
  promptBoxCount(initial?: number, title?: string): Promise<number | null>
  /** Lets the user tick exactly `remove` of `boxes` (function IDs returned); null = cancelled. */
  chooseBoxesToRemove(boxes: readonly Idef0BoxChoice[], remove: number): Promise<readonly string[] | null>
  /** Opens a diagram tab and selects views (ids) in it. */
  openDiagram(diagramId: string, selectViewIds?: readonly string[]): void
  /** Shows a read-only result list. */
  showList(title: string, items: readonly Idef0ListItem[]): void
  toast(text: string): void
}

const state = () => projectStore.getState()

function idefDiagram(): Diagram | null {
  const d = activeDiagram(state())
  return d && d._type === 'IDEF0Diagram' ? d : null
}

function selectedFunctionView(): View | null {
  const views = selectedViews(state())
  const only = views.length === 1 ? (views[0] as View) : null
  return only && only._type === 'IDEF0FunctionView' && isIdef0Function(only.model) ? only : null
}

/** The decomposition diagram whose box count the command changes: the selected box's child, else the active child diagram. */
function decompositionToResize(): Elem | null {
  const v = selectedFunctionView()
  const child = v ? childTarget(v.model) : null
  if (child) return child
  const d = idefDiagram()
  return d && !isContextDiagram(d) ? d : null
}

function lossText(arrows: number, decomposed: boolean): string {
  const parts = [`${arrows} arrow${arrows === 1 ? '' : 's'} attached`]
  if (decomposed) parts.push('has a child diagram that is removed too')
  return parts.join(', ')
}

function selectedArrowViews(): View[] {
  return selectedViews(state()).filter((v) => v._type === 'IDEF0ArrowView' && v.model)
}

function envOf(diagram: Diagram) {
  return { engine: state().engine, diagram, measurer: getTextMeasurer() }
}

/** Issues as list rows. */
export function issueItems(issues: readonly IdefIssue[]): Idef0ListItem[] {
  return issues.map((i) => ({ text: `${i.id}  ${i.message}`, elementId: i.elementId, diagramId: i.diagramId }))
}

/** Registers the IDEF0 commands (ids already registered are skipped). */
export function registerIdef0Commands(registry: CommandRegistry, ctx: Idef0CommandContext): void {
  const add = (def: Parameters<CommandRegistry['register']>[0]): void => {
    if (!registry.has(def.id)) registry.register(def)
  }
  const go = (target: DiagramTarget | null): void => {
    if (target) ctx.openDiagram(target.diagram._id, target.view ? [target.view._id] : [])
  }

  add({
    id: Idef0CommandIds.decompose,
    label: 'Decompose...',
    isEnabled: () => {
      const v = selectedFunctionView()
      return !!idefDiagram() && !!v && !childTarget(v.model)
    },
    run: async () => {
      const v = selectedFunctionView()
      if (!v || !v.model || childTarget(v.model)) return
      const count = await ctx.promptBoxCount()
      if (count === null) return
      const diagram = decomposeFunction(state().engine, v.model, count)
      ctx.openDiagram(diagram._id)
    }
  })
  add({
    id: Idef0CommandIds.setBoxCount,
    label: 'Set Number of Child Boxes...',
    isEnabled: () => decompositionToResize() !== null,
    run: async () => {
      const target = decompositionToResize()
      if (!target) return
      const current = childBoxes(target).length
      const count = await ctx.promptBoxCount(current, 'New number of child boxes')
      if (count === null) return
      if (count === current) {
        ctx.toast(`The diagram already has ${current} box${current === 1 ? '' : 'es'}`)
        return
      }
      const env = envOf(target as Diagram)
      if (count > current) {
        addChildBoxes(env, count - current)
        ctx.toast(`Added ${count - current} box${count - current === 1 ? '' : 'es'}`)
        return
      }
      const boxes = childBoxes(target)
      const choices = boxes.map((c) => ({ id: c.fn._id, label: `${nodeNumber(c.fn)}  ${(c.fn['name'] as string) || '(unnamed)'}`, detail: lossText(c.arrows, c.decomposed) }))
      const ids = await ctx.chooseBoxesToRemove(choices, current - count)
      if (ids === null) return
      const doomed = boxes.filter((c) => ids.includes(c.fn._id)).map((c) => c.fn)
      if (doomed.length !== current - count) return
      removeChildBoxes(env, doomed)
      ctx.toast(`Removed ${doomed.length} box${doomed.length === 1 ? '' : 'es'}`)
    }
  })
  add({
    id: Idef0CommandIds.goParent,
    label: 'Go to Parent Diagram',
    isEnabled: () => {
      const d = idefDiagram()
      return !!d && parentTarget(d) !== null
    },
    run: () => {
      const d = idefDiagram()
      if (d) go(parentTarget(d))
    }
  })
  add({
    id: Idef0CommandIds.goChild,
    label: 'Go to Child Diagram',
    isEnabled: () => {
      const fv = selectedFunctionView()
      if (fv) return childTarget(fv.model) !== null
      const arrows = selectedArrowViews()
      return arrows.length === 1 && callTarget(arrows[0]?.model as Elem) !== null
    },
    run: () => {
      const fv = selectedFunctionView()
      const child = fv ? childTarget(fv.model) : null
      if (child) {
        ctx.openDiagram(child._id)
        return
      }
      const arrow = selectedArrowViews()[0]?.model
      if (arrow) go(callTarget(arrow))
    }
  })
  add({
    id: Idef0CommandIds.renumber,
    label: 'Renumber Boxes',
    isEnabled: () => !!idefDiagram(),
    run: () => {
      const d = idefDiagram()
      if (!d) return
      const n = renumberBoxes(state().engine, d)
      ctx.toast(n === 0 ? 'Box numbers already follow the staircase order' : `Renumbered ${n} box${n === 1 ? '' : 'es'}`)
    }
  })
  add({
    id: Idef0CommandIds.syncPorts,
    label: 'Synchronize Boundary Arrows',
    isEnabled: () => {
      const d = idefDiagram()
      return !!d && !isContextDiagram(d)
    },
    run: () => {
      const d = idefDiagram()
      if (!d) return
      const n = syncPorts(state().engine, d)
      ctx.toast(n === 0 ? 'Boundary arrows are in sync with the parent box' : `Added ${n} boundary arrow${n === 1 ? '' : 's'}`)
    }
  })
  add({
    id: Idef0CommandIds.validate,
    label: 'Validate IDEF0 Model',
    isEnabled: () => !!idefDiagram(),
    run: () => {
      const model = modelOf(idefDiagram())
      if (!model) return
      const issues = validateIdef0(model)
      ctx.showList(issues.length === 0 ? 'IDEF0 validation: no warnings' : `IDEF0 validation: ${issues.length} warning${issues.length === 1 ? '' : 's'}`, issueItems(issues))
    }
  })
  add({
    id: Idef0CommandIds.nodeIndex,
    label: 'Show Node Index',
    isEnabled: () => !!idefDiagram(),
    run: () => {
      const model = modelOf(idefDiagram())
      if (!model) return
      ctx.showList(
        'Node Index',
        buildNodeIndex(model).map((e) => ({ text: `${e.nodeNumber}  ${e.name}`, indent: e.depth, diagramId: e.diagramId, ...(e.functionId ? { elementId: e.functionId } : {}) }))
      )
    }
  })
  add({
    id: Idef0CommandIds.tunnelEnd,
    label: 'Tunnel This End',
    isEnabled: () => !!idefDiagram() && selectedArrowViews().length > 0 && selectedArrowViews().every((v) => roleOf(v.model as Elem) !== 'call'),
    run: (arg) => {
      const requested = (arg as { end?: 'source' | 'target' } | undefined)?.end
      for (const v of selectedArrowViews()) {
        const arrow = v.model as Elem
        const end = requested ?? (isKindOf(arrow['target'] as Elem | null, 'IDEF0Arrow') || !arrow['target'] ? 'source' : 'target')
        toggleTunnel(state().engine, arrow, end)
      }
    }
  })
  for (const role of ['input', 'control', 'output', 'mechanism'] as const) {
    add({
      id: Idef0CommandIds.addBoundary(role),
      label: `Add Boundary Arrow: ${role[0]?.toUpperCase()}${role.slice(1)}`,
      isEnabled: () => !!idefDiagram() && !!selectedFunctionView(),
      run: () => {
        const d = idefDiagram()
        const fv = selectedFunctionView()
        if (d && fv) addBoundaryArrow(envOf(d), fv, role)
      }
    })
  }
  add({
    id: Idef0CommandIds.colorByRole,
    label: 'Color Arrows by Role',
    isEnabled: () => !!modelOf(idefDiagram()),
    isChecked: () => modelOf(idefDiagram())?.['colorArrowsByRole'] === true,
    run: () => {
      const model = modelOf(idefDiagram())
      if (model) setFieldsOfAll(state().engine, [model], { colorArrowsByRole: model['colorArrowsByRole'] !== true }, 'Color Arrows by Role')
    }
  })
  for (const stage of STATUS_STAGES) {
    add({
      id: Idef0CommandIds.status(stage),
      label: `Set Status: ${statusLabel(stage)[0]}${stage.slice(1)}`,
      isEnabled: () => !!idefDiagram(),
      isChecked: () => idefDiagram()?.['status'] === stage,
      run: () => {
        const d = idefDiagram()
        if (d) setFieldsOfAll(state().engine, [d], { status: stage }, 'Change Status')
      }
    })
  }
}
