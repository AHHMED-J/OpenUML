/**
 * IDEF0 commands (spec 11 §4.3). The shell supplies the interactive parts (box-count prompt,
 * result lists, opening diagrams); the model changes are the functions of `decompose.ts`.
 */
import { setFieldsOfAll, type CommandRegistry } from '../../commands'
import { buildNodeIndex, isContextDiagram, isIdef0Function, isKindOf, modelOf, roleOf, type Diagram, type Elem, type View } from '../../model'
import { activeDiagram, projectStore, selectedViews } from '../../store'
import { getTextMeasurer } from '../layout/measurer'
import { addBoundaryArrow, decomposeFunction, renumberBoxes, syncPorts, toggleTunnel } from './decompose'
import { callTarget, childTarget, parentTarget, type DiagramTarget } from './navigation'
import { validateIdef0, type IdefIssue } from './validate'
import { STATUS_STAGES, statusLabel } from './strings'

export const Idef0CommandIds = {
  decompose: 'idef0.decompose',
  goParent: 'idef0.go-parent',
  goChild: 'idef0.go-child',
  renumber: 'idef0.renumber',
  syncPorts: 'idef0.sync-ports',
  validate: 'idef0.validate',
  nodeIndex: 'idef0.node-index',
  tunnelEnd: 'idef0.tunnel-end',
  addBoundary: (role: string) => `idef0.add-boundary-${role}`,
  status: (stage: string) => `format.idef0.status.${stage}`
} as const

/** One row of a result list: click selects `elementId` or opens `diagramId`. */
export interface Idef0ListItem {
  readonly text: string
  readonly indent?: number
  readonly elementId?: string
  readonly diagramId?: string | null
}

/** The interactive services the shell provides to the IDEF0 commands. */
export interface Idef0CommandContext {
  /** Asks for the number of child boxes (3 to 6); null = cancelled. */
  promptBoxCount(): Promise<number | null>
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
