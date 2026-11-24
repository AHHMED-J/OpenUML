/** Shell side of the role activity diagram commands. */
import { compactRadDiagram, getTextMeasurer } from '../../diagram'
import type { CommandRegistry } from '../../commands'
import { isKindOf, type Diagram } from '../../model'
import { activeDiagram, projectStore } from '../../store'
import { uiStore } from '../uiStore'

export const RadCommandIds = {
  compactLayout: 'rad.compact-layout'
} as const

/** The role activity diagram open in the editor, or null. */
export function activeRadDiagram(): Diagram | null {
  const d = activeDiagram(projectStore.getState())
  return d && isKindOf(d, 'RADDiagram') ? d : null
}

/** Compacts the open RAD diagram (one undoable step) and says when it could not. */
export function compactActiveRadDiagram(): void {
  const diagram = activeRadDiagram()
  if (!diagram) return
  const outcome = compactRadDiagram({ engine: projectStore.getState().engine, diagram, measurer: getTextMeasurer() })
  if (!outcome.ok) uiStore.getState().toast(outcome.reason)
  else if (!outcome.changed) uiStore.getState().toast('The diagram is already compact.')
}

export function registerRad(registry: CommandRegistry): void {
  if (registry.has(RadCommandIds.compactLayout)) return
  registry.register({
    id: RadCommandIds.compactLayout,
    label: 'Compact Layout',
    isEnabled: () => activeRadDiagram() !== null,
    run: compactActiveRadDiagram
  })
}
