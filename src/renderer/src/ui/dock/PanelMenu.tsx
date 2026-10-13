/**
 * Panel options menu (the header's "…" button or its context menu): keyboard-accessible
 * alternatives to dragging — move up/down, move to the other sidebar — plus collapse, hide and
 * Reset Layout.
 */
import { useEffect } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { MenuList } from '../menus/ContextMenu'
import type { ResolvedMenuItem } from '../menus/menuModel'
import { uiStore, useUiStore } from '../uiStore'
import { DOCK_AREA_IDS, areaOf, visiblePanels, type DockAreaId, type DockPanelId } from './dockModel'

type Action = 'up' | 'down' | `area:${DockAreaId}` | 'collapse' | 'hide' | 'reset'

const MOVE_TO_LABEL: Readonly<Record<DockAreaId, string>> = { left: 'Move to Left Sidebar', right: 'Move to Right Sidebar' }

function panelMenuItems(id: DockPanelId): ResolvedMenuItem[] {
  const layout = uiStore.getState().dock
  const area = areaOf(layout, id)
  const shown = visiblePanels(layout, area)
  const index = shown.indexOf(id)
  const item = (command: Action, label: string, enabled = true): ResolvedMenuItem => ({ kind: 'item', command, label, enabled })
  return [
    item('up', 'Move Up', index > 0),
    item('down', 'Move Down', index >= 0 && index < shown.length - 1),
    ...DOCK_AREA_IDS.filter((a) => a !== area).map((a) => item(`area:${a}`, MOVE_TO_LABEL[a])),
    { kind: 'separator' },
    item('collapse', layout.panels[id].collapsed ? 'Expand' : 'Collapse'),
    item('hide', 'Hide Panel'),
    { kind: 'separator' },
    item('reset', 'Reset Layout')
  ]
}

function runPanelAction(id: DockPanelId, action: string): void {
  const ui = uiStore.getState()
  if (action === 'up') ui.moveDockPanelBy(id, -1)
  else if (action === 'down') ui.moveDockPanelBy(id, 1)
  else if (action === 'collapse') ui.toggleDockCollapsed(id)
  else if (action === 'hide') ui.setDockPanelVisible(id, false)
  else if (action === 'reset') ui.resetLayout()
  else if (action.startsWith('area:')) {
    const area = action.slice(5)
    if (area === 'left' || area === 'right') ui.moveDockPanelToArea(id, area)
  }
}

export interface PanelMenuState {
  readonly x: number
  readonly y: number
}

export function PanelMenu({
  id,
  at,
  onClose
}: {
  id: DockPanelId
  at: PanelMenuState
  onClose: (refocus: boolean) => void
}): React.JSX.Element {
  // Re-resolve when the layout changes while open.
  useUiStore((s) => s.dock)
  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest?.('.menu')) onClose(false)
    }
    const dismiss = (): void => onClose(false)
    window.addEventListener('mousedown', close, true)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [onClose])
  return createPortal(
    <MenuList
      items={panelMenuItems(id)}
      x={at.x}
      y={at.y}
      onClose={() => onClose(true)}
      onSelect={(item) => {
        if (item.command) runPanelAction(id, item.command)
      }}
    />,
    document.body
  )
}
