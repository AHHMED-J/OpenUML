/** Status bar: breadcrumb of the selected element, selection info, zoom (click for presets). */
import type React from 'react'
import { Idef0CommandIds } from '../diagram'
import { typeDisplayName, type Elem } from '../model'
import { useProjectStore } from '../store'
import { selectInExplorer } from './app/appCommands'
import { runCommand } from './app/commands'
import { idef0PendingCount, idef0WarningCount } from './app/idef0'
import { offerUpdate } from './app/updates'
import { explorerLabel, pathTo } from './explorer/tree'
import { TypeIcon } from './icons'
import { useSelectedModels } from './properties/useSelection'
import { uiStore, useUiStore } from './uiStore'

export function StatusBar(): React.JSX.Element {
  const { models } = useSelectedModels()
  const viewCount = useProjectStore((s) => s.selectedViewIds.length)
  const activeId = useProjectStore((s) => s.activeDiagramId)
  const dirty = useProjectStore((s) => s.dirty)
  const zoom = useUiStore((s) => (activeId ? (s.zoomByDiagram[activeId] ?? 1) : null))
  const tool = useUiStore((s) => s.tool)
  // IDEF0 consistency warnings of the active diagram (recomputed on every model change).
  const warnings = useProjectStore((s) => (s.version >= 0 ? idef0WarningCount() : 0))
  // Parent arrows no box of the active IDEF0 diagram uses yet (dashed stubs on the frame edge).
  const pending = useProjectStore((s) => (s.version >= 0 ? idef0PendingCount() : 0))
  const locked = useUiStore((s) => s.toolLocked)
  const update = useUiStore((s) => s.update)
  const single = models.length === 1 ? (models[0] as Elem) : null

  return (
    <footer className="statusbar" aria-label="Status bar">
      <nav className="breadcrumb" aria-label="Selected element">
        {single
          ? pathTo(single).map((el, i, all) => (
              <span key={el._id} className="crumb">
                {i > 0 ? <span className="crumb-sep">›</span> : null}
                <button className="crumb-button" onClick={() => selectInExplorer(el)} title={typeDisplayName(el._type)}>
                  <TypeIcon type={el._type} size={13} />
                  <span className={i === all.length - 1 ? 'crumb-current' : undefined}>{explorerLabel(el, false)}</span>
                </button>
                {i === all.length - 1 ? <span className="muted"> [{typeDisplayName(el._type)}]</span> : null}
              </span>
            ))
          : models.length > 1
            ? <span className="muted">{models.length} elements selected</span>
            : null}
      </nav>
      <span className="spacer" />
      {tool ? (
        <span className="status-item">
          Tool: {tool.kind}
          {locked ? ' (locked)' : ''}
        </span>
      ) : null}
      {update ? (
        <button
          className="status-item status-button status-update"
          title={`OpenUML ${update.version} is available: click to download it`}
          onClick={() => void offerUpdate()}
        >
          Update {update.version}
        </button>
      ) : null}
      {pending > 0 ? (
        <button
          className="status-item status-button status-pending"
          title="Parent arrows waiting on the frame edge: connect each to a box (click to list them)"
          onClick={() => runCommand(Idef0CommandIds.validate)}
        >
          {pending} parent arrow{pending === 1 ? '' : 's'} not connected
        </button>
      ) : null}
      {warnings > 0 ? (
        <button
          className="status-item status-button"
          title="IDEF0 warnings: click to list them"
          aria-label={`${warnings} IDEF0 warnings`}
          onClick={() => runCommand(Idef0CommandIds.validate)}
        >
          {warnings} warning{warnings === 1 ? '' : 's'}
        </button>
      ) : null}
      {viewCount > 0 ? <span className="status-item">{viewCount} view{viewCount === 1 ? '' : 's'}</span> : null}
      <span className="status-item">{dirty ? 'Modified' : 'Saved'}</span>
      {zoom !== null ? (
        <button
          className="status-item status-button"
          title="Zoom presets"
          aria-label={`Zoom ${Math.round(zoom * 100)}%`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            uiStore.getState().openContextMenu({ x: r.left, y: r.top - 8 - 6 * 26, menu: 'zoom' })
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
      ) : null}
    </footer>
  )
}
