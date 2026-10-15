/** Shell side of the IDEF0 commands: the box-count prompt, result lists and opening diagrams. */
import { registerIdef0Commands, validateDiagram, type Idef0CommandContext } from '../../diagram'
import type { CommandRegistry } from '../../commands'
import { activeDiagram, projectStore } from '../../store'
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

export function registerIdef0(registry: CommandRegistry): void {
  registerIdef0Commands(registry, idef0Context)
}

/** Number of IDEF0 warnings of the model shown by the active diagram (0 elsewhere). */
export function idef0WarningCount(): number {
  const diagram = activeDiagram(ps())
  if (!diagram || diagram._type !== 'IDEF0Diagram') return 0
  let model = diagram._parent
  while (model && model._type !== 'IDEF0Model') model = model._parent
  return model ? validateDiagram(model, diagram).length : 0
}
