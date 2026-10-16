/** Main toolbar: file, undo/redo, zoom, grid and panel toggles. */
import type React from 'react'
import { useProjectStore } from '../store'
import { platform } from './app/bridge'
import { keystrokeFor, registry, runCommand } from './app/commands'
import { UiIcon, type UiIconName } from './icons'
import { displayKeystroke } from './keymap'
import { Cmd } from './menus/commandIds'
import { useUiStore } from './uiStore'

function useCommandStateTick(): void {
  // Re-render on any state that command predicates read.
  useProjectStore((s) => s.version)
  useProjectStore((s) => s.activeDiagramId)
  useProjectStore((s) => s.selectedViewIds)
  useProjectStore((s) => s.selectedElementIds)
  useProjectStore((s) => s.canUndo)
  useProjectStore((s) => s.canRedo)
  useUiStore((s) => s.prefs)
  useUiStore((s) => s.panels)
}

function ToolButton({ command, icon, label }: { command: string; icon: UiIconName; label: string }): React.JSX.Element {
  const enabled = registry.isEnabled(command)
  const checked = registry.isChecked(command)
  const key = keystrokeFor(command)
  const title = key ? `${label} (${displayKeystroke(key, platform)})` : label
  return (
    <button
      className={`icon-button toolbar-button${checked ? ' pressed' : ''}`}
      data-tip={title}
      aria-label={label}
      aria-pressed={checked}
      disabled={!enabled}
      onClick={() => runCommand(command)}
    >
      <UiIcon name={icon} />
    </button>
  )
}

export function Toolbar(): React.JSX.Element {
  useCommandStateTick()
  const activeId = useProjectStore((s) => s.activeDiagramId)
  const zoom = useUiStore((s) => (activeId ? (s.zoomByDiagram[activeId] ?? 1) : null))
  const undoName = useProjectStore((s) => s.undoName)
  const redoName = useProjectStore((s) => s.redoName)
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <ToolButton command={Cmd.fileNew} icon="new" label="New" />
      <ToolButton command={Cmd.fileOpen} icon="open" label="Open" />
      <ToolButton command={Cmd.fileSave} icon="save" label="Save" />
      <span className="toolbar-sep" />
      <ToolButton command={Cmd.editUndo} icon="undo" label={undoName ? `Undo ${undoName}` : 'Undo'} />
      <ToolButton command={Cmd.editRedo} icon="redo" label={redoName ? `Redo ${redoName}` : 'Redo'} />
      <span className="toolbar-sep" />
      <ToolButton command={Cmd.viewZoomOut} icon="zoom-out" label="Zoom Out" />
      <span className="toolbar-zoom" aria-live="polite">
        {zoom !== null ? `${Math.round(zoom * 100)}%` : '—'}
      </span>
      <ToolButton command={Cmd.viewZoomIn} icon="zoom-in" label="Zoom In" />
      <ToolButton command={Cmd.viewFitToWindow} icon="fit" label="Fit to Window" />
      <span className="toolbar-sep" />
      <ToolButton command={Cmd.viewShowGrid} icon="grid" label="Show Grid" />
      <ToolButton command={Cmd.viewSnapToGrid} icon="snap" label="Snap to Grid" />
      <ToolButton command={Cmd.fileExportPng} icon="export" label="Export Diagram as PNG" />
      <span className="spacer" />
      <ToolButton command={Cmd.viewSidebar} icon="sidebar" label="Toggle Sidebar" />
      <ToolButton command={Cmd.viewNavigator} icon="navigator" label="Toggle Navigator" />
      <ToolButton command={Cmd.viewCommandPalette} icon="palette" label="Command Palette" />
      <ToolButton command={Cmd.appPreferences} icon="gear" label="Preferences" />
    </div>
  )
}
