/** Shell side of the IDEF0 commands: the box-count prompt, result lists and opening diagrams. */
import { Idef0CommandIds, hasParentArrows, pendingPorts, registerIdef0Commands, validateDiagram, type Idef0CommandContext } from '../../diagram'
import type { CommandRegistry } from '../../commands'
import type { Elem } from '../../model'
import { activeDiagram, projectStore, selectedModels } from '../../store'
import { chooseRows, uiStore } from '../uiStore'
import { promptBoxCount } from './boxCount'
import { openDiagram, selectInExplorer } from './appCommands'

const ps = () => projectStore.getState()

export const idef0Context: Idef0CommandContext = {
  promptBoxCount,
  chooseBoxesToRemove(boxes, remove) {
    return chooseRows(
      'Remove boxes',
      `Tick the ${remove} box${remove === 1 ? '' : 'es'} to remove. Removed boxes take their child diagrams and arrows that only served them with them; the remaining boxes are renumbered. This can be undone.`,
      boxes,
      remove
    )
  },
  openDiagram(diagramId, selectViewIds = []) {
    const diagram = ps().repository.get(diagramId)
    if (!diagram) return
    openDiagram(diagram)
    ps().select({ views: selectViewIds })
  },
  showList(title, items) {
    uiStore.getState().openModal({
      kind: 'list',
      title,
      items: items.map((item) => ({
        text: item.text,
        ...(item.indent ? { indent: item.indent } : {}),
        onSelect: () => {
          const repo = ps().repository
          const diagram = item.diagramId ? repo.get(item.diagramId) : null
          const element = item.elementId ? repo.get(item.elementId) : null
          if (diagram) openDiagram(diagram)
          if (element) {
            const view = diagram ? repo.viewsOf(element).find((v) => repo.diagramOf(v) === diagram) : null
            if (view) ps().select({ views: [view._id] })
            else selectInExplorer(element)
          }
        }
      }))
    })
  },
  toast(text) {
    uiStore.getState().toast(text)
  }
}

/** The single decomposition diagram selected in the Model Explorer, or null. */
function explorerParentArrowsDiagram(): Elem | null {
  const models = ps().selectedElementIds.length === 1 ? selectedModels(ps()) : []
  const only = models.length === 1 ? models[0] : null
  return hasParentArrows(only) ? only : null
}

/** The diagram Advanced Arrows opens for: the one selected in the Model Explorer, else the active one. */
function advancedArrowsTarget(): Elem | null {
  const active = activeDiagram(ps())
  return explorerParentArrowsDiagram() ?? (hasParentArrows(active) ? active : null)
}

export function registerIdef0(registry: CommandRegistry): void {
  registerIdef0Commands(registry, idef0Context)
  registry.register({
    id: Idef0CommandIds.advancedArrows,
    label: 'Advanced Arrows',
    isEnabled: () => !!advancedArrowsTarget(),
    run: () => {
      const target = advancedArrowsTarget()
      if (!target) return
      if (target._id !== ps().activeDiagramId) openDiagram(target)
      uiStore.getState().showDockPanel('advancedArrows')
    }
  })
}

/** Number of parent arrows waiting unconnected on the active IDEF0 diagram (0 elsewhere). */
export function idef0PendingCount(): number {
  const diagram = activeDiagram(ps())
  return diagram && diagram._type === 'IDEF0Diagram' ? pendingPorts(diagram).length : 0
}

/** Number of IDEF0 warnings of the model shown by the active diagram (0 elsewhere). */
export function idef0WarningCount(): number {
  const diagram = activeDiagram(ps())
  if (!diagram || diagram._type !== 'IDEF0Diagram') return 0
  let model = diagram._parent
  while (model && model._type !== 'IDEF0Model') model = model._parent
  return model ? validateDiagram(model, diagram).length : 0
}
