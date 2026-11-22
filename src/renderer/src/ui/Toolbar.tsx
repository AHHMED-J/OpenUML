/**
 * Main toolbar: file, undo/redo, zoom, grid and panel toggles. Normal mode shows them in a row at the
 * top; Compact mode (Preferences) replaces the row with a thin column beside the canvas.
 */
import type React from 'react'
import { useProjectStore } from '../store'
import { isWeb, platform, showInFolderLabel } from './app/bridge'
import { keystrokeFor, registry, runCommand } from './app/commands'
import { UiIcon, type UiIconName } from './icons'
import { displayKeystroke } from './keymap'
import { Cmd } from './menus/commandIds'
import { ToolbarOverflow } from './ToolbarOverflow'
import { uiStore, useUiStore, type ToolbarMode } from './uiStore'

function useCommandStateTick(): void {
  // Re-render on any state that command predicates read.
  useProjectStore((s) => s.version)
  useProjectStore((s) => s.filePath)
  useProjectStore((s) => s.activeDiagramId)
  useProjectStore((s) => s.selectedViewIds)
  useProjectStore((s) => s.selectedElementIds)
  useProjectStore((s) => s.canUndo)
  useProjectStore((s) => s.canRedo)
  useUiStore((s) => s.prefs)
  useUiStore((s) => s.panels)
}

function ToolButton({ command, icon, label, tipSide }: { command: string; icon: UiIconName; label: string; tipSide?: 'left' }): React.JSX.Element {
  const enabled = registry.isEnabled(command)
  const checked = registry.isChecked(command)
  const key = keystrokeFor(command)
  const title = key ? `${label} (${displayKeystroke(key, platform)})` : label
  return (
    <button
      className={`icon-button toolbar-button${checked ? ' pressed' : ''}`}
      data-tip={title}
      data-tip-side={tipSide}
      aria-label={label}
      aria-pressed={checked}
      disabled={!enabled}
      onClick={() => runCommand(command)}
    >
      <UiIcon name={icon} />
    </button>
  )
}

/** Export: a menu with the formats instead of one button per format. */
function ExportButton(): React.JSX.Element {
  return (
    <button
      className="icon-button toolbar-button"
      data-tip="Export Diagram"
      aria-label="Export Diagram"
      aria-haspopup="menu"
      disabled={!registry.isEnabled(Cmd.fileExportPng)}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        uiStore.getState().openContextMenu({ x: r.left, y: r.bottom + 2, menu: 'export' })
      }}
    >
      <UiIcon name="export" />
    </button>
  )
}

/** Buttons that the compact column keeps out of sight, in the drop-down (the row shows them all). */
function MoreTools(): React.JSX.Element {
  return (
    <>
      <ToolButton command={Cmd.fileNew} icon="new" label="New" />
      <ToolButton command={Cmd.fileOpen} icon="open" label="Open" />
      {isWeb ? null : <ToolButton command={Cmd.fileShowInFolder} icon="reveal" label={showInFolderLabel} />}
      <span className="toolbar-sep" />
      <ToolButton command={Cmd.viewZoomOut} icon="zoom-out" label="Zoom Out" />
      <ToolButton command={Cmd.viewZoomIn} icon="zoom-in" label="Zoom In" />
      <ToolButton command={Cmd.viewFitToWindow} icon="fit" label="Fit to Window" />
      <span className="toolbar-sep" />
      <ToolButton command={Cmd.viewShowGrid} icon="grid" label="Show Grid" />
      <ToolButton command={Cmd.viewSnapToGrid} icon="snap" label="Snap to Grid" />
      <ExportButton />
      <span className="toolbar-sep" />
      <AppTools />
    </>
  )
}

function AppTools(): React.JSX.Element {
  return (
    <>
      <ToolButton command={Cmd.viewSidebar} icon="sidebar" label="Toggle Sidebar" />
      <ToolButton command={Cmd.viewNavigator} icon="navigator" label="Toggle Navigator" />
      <ToolButton command={Cmd.viewCommandPalette} icon="palette" label="Command Palette" />
      <ToolButton command={Cmd.appPreferences} icon="gear" label="Preferences" />
    </>
  )
}

function HistoryTools({ tipSide }: { tipSide?: 'left' }): React.JSX.Element {
  const undoName = useProjectStore((s) => s.undoName)
  const redoName = useProjectStore((s) => s.redoName)
  return (
    <>
      <ToolButton command={Cmd.editUndo} icon="undo" label={undoName ? `Undo ${undoName}` : 'Undo'} tipSide={tipSide} />
      <ToolButton command={Cmd.editRedo} icon="redo" label={redoName ? `Redo ${redoName}` : 'Redo'} tipSide={tipSide} />
    </>
  )
}

/** The toolbar row (Normal mode). */
export function Toolbar(): React.JSX.Element {
  useCommandStateTick()
  const activeId = useProjectStore((s) => s.activeDiagramId)
  const zoom = useUiStore((s) => (activeId ? (s.zoomByDiagram[activeId] ?? 1) : null))
  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <ToolButton command={Cmd.fileNew} icon="new" label="New" />
      <ToolButton command={Cmd.fileOpen} icon="open" label="Open" />
      <ToolButton command={Cmd.fileSave} icon="save" label="Save" />
      {isWeb ? null : <ToolButton command={Cmd.fileShowInFolder} icon="reveal" label={showInFolderLabel} />}
      <span className="toolbar-sep" />
      <HistoryTools />
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
      <ExportButton />
      <span className="spacer" />
      <AppTools />
    </div>
  )
}

/**
 * The compact toolbar (Compact mode): a thin column at the right of the canvas with Save, Undo,
 * Redo and a button that opens the other buttons towards the canvas. The zoom is in the status bar.
 */
export function ToolRail(): React.JSX.Element {
  useCommandStateTick()
  return (
    <div className="tool-rail" role="toolbar" aria-label="Main toolbar" aria-orientation="vertical">
      <ToolButton command={Cmd.fileSave} icon="save" label="Save" tipSide="left" />
      <span className="toolbar-sep" />
      <HistoryTools tipSide="left" />
      <span className="toolbar-sep" />
      <ToolbarOverflow>
        <MoreTools />
      </ToolbarOverflow>
    </div>
  )
}

/** Where the toolbar goes: a row above everything (Normal) or a column beside the canvas (Compact). */
export function toolbarPlacement(mode: ToolbarMode, visible: boolean): { row: boolean; rail: boolean } {
  return { row: visible && mode === 'normal', rail: visible && mode === 'compact' }
}
