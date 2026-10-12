/** Shell side of the IDEF0 commands: the box-count prompt, result lists and opening diagrams. */
import { registerIdef0Commands, validateIdef0, type Idef0CommandContext } from '../../diagram'
import type { CommandRegistry } from '../../commands'
import { activeDiagram, projectStore } from '../../store'
import { promptText, uiStore } from '../uiStore'
import { openDiagram, selectInExplorer } from './appCommands'

const ps = () => projectStore.getState()

export const idef0Context: Idef0CommandContext = {
  async promptBoxCount() {
    for (;;) {
      const text = await promptText('Number of child boxes (3 to 6)', '3')
      if (text === null) return null
      const n = Number(text.trim())
      if (Number.isInteger(n) && n >= 1 && n <= 6) return n
      uiStore.getState().toast('Enter a whole number from 1 to 6', 'error')
    }
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
  return model ? validateIdef0(model).filter((i) => i.diagramId === diagram._id).length : 0
}
