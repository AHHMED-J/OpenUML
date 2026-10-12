/** Dockable panel registry: body component and optional header actions per panel id. */
import { memo } from 'react'
import type React from 'react'
import { WorkingDiagrams } from '../diagramArea/WorkingDiagrams'
import { ExplorerActions, ModelExplorer } from '../explorer/ModelExplorer'
import { DocumentationPanel, PropertiesPanel, StylesPanel } from '../properties/EditorsPanel'
import { Toolbox, ToolboxActions } from '../toolbox/Toolbox'
import type { DockPanelId } from './dockModel'

interface PanelSpec {
  readonly body: React.ComponentType
  readonly actions?: React.ComponentType
}

export const DOCK_PANELS: Readonly<Record<DockPanelId, PanelSpec>> = {
  explorer: { body: ModelExplorer, actions: ExplorerActions },
  workingDiagrams: { body: WorkingDiagrams },
  toolbox: { body: Toolbox, actions: ToolboxActions },
  styles: { body: StylesPanel },
  properties: { body: PropertiesPanel },
  documentation: { body: DocumentationPanel }
}

/** Panel content, memoized so dock re-renders (drag targets, resizing) skip the panel bodies. */
export const PanelBody = memo(function PanelBody({ id }: { id: DockPanelId }): React.JSX.Element {
  const Body = DOCK_PANELS[id].body
  return <Body />
})

export const PanelActions = memo(function PanelActions({ id }: { id: DockPanelId }): React.JSX.Element | null {
  const Actions = DOCK_PANELS[id].actions
  return Actions ? <Actions /> : null
})
