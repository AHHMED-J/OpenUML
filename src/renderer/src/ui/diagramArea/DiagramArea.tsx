/** Center area: diagram tabs plus the diagram editor of the active diagram. */
import { Component } from 'react'
import type React from 'react'
import { DiagramEditor } from '../../diagram'
import { projectStore } from '../../store'
import { PanelBoundary } from '../components/PanelBoundary'
import { TypeIcon, UiIcon } from '../icons'
import { uiStore, useUiStore } from '../uiStore'
import { diagramLabel, useOpenDiagrams } from './WorkingDiagrams'

class EditorBoundary extends Component<{ children: React.ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="canvas-message" role="alert">
          <strong>The diagram could not be displayed.</strong>
          <span>{this.state.error.message}</span>
          <button className="button" onClick={() => this.setState({ error: null })}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function DiagramTabs(): React.JSX.Element | null {
  const { diagrams, activeId } = useOpenDiagrams()
  if (diagrams.length === 0) return null
  return (
    <div className="tabs" role="tablist" aria-label="Open diagrams">
      {diagrams.map((d) => {
        const active = d._id === activeId
        return (
          <div
            key={d._id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`tab${active ? ' active' : ''}`}
            title={diagramLabel(d)}
            onClick={() => projectStore.getState().setActiveDiagram(d._id)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                projectStore.getState().closeDiagram(d._id)
              }
            }}
            onKeyDown={(e) => {
              const i = diagrams.indexOf(d)
              const next = e.key === 'ArrowRight' ? diagrams[i + 1] : e.key === 'ArrowLeft' ? diagrams[i - 1] : undefined
              if (next) {
                e.preventDefault()
                projectStore.getState().setActiveDiagram(next._id)
                requestAnimationFrame(() => (document.querySelector('.tab.active') as HTMLElement | null)?.focus())
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              uiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, menu: 'working-diagrams', targetId: d._id })
            }}
          >
            <TypeIcon type={d._type} />
            <span className="tab-label">{diagramLabel(d)}</span>
            <button
              className="icon-button tab-close"
              aria-label={`Close ${diagramLabel(d)}`}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                projectStore.getState().closeDiagram(d._id)
              }}
            >
              <UiIcon name="close" size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function DiagramArea(): React.JSX.Element {
  const { activeId } = useOpenDiagrams()
  const tool = useUiStore((s) => s.tool)
  const zoom = useUiStore((s) => (activeId ? (s.zoomByDiagram[activeId] ?? 1) : 1))
  const showGrid = useUiStore((s) => s.prefs.showGrid)
  const snapToGrid = useUiStore((s) => s.prefs.snapToGrid)
  const gridSize = useUiStore((s) => s.prefs.gridSize)
  const defaultFontSize = useUiStore((s) => s.prefs.defaultFontSize)

  return (
    <main className="diagram-area" aria-label="Diagram">
      <PanelBoundary name="Diagram tabs">
        <DiagramTabs />
      </PanelBoundary>
      <div
        className="canvas-host"
        onContextMenu={(e) => {
          // The diagram editor may show its own menu (it then prevents the default).
          if (e.defaultPrevented || !activeId) return
          e.preventDefault()
          uiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, menu: 'canvas' })
        }}
      >
        {activeId ? (
          <EditorBoundary resetKey={activeId}>
            <DiagramEditor
              key={activeId}
              diagramId={activeId}
              tool={tool}
              onToolUsed={() => uiStore.getState().toolUsed()}
              zoom={zoom}
              onZoomChange={(z) => uiStore.getState().setZoom(activeId, z)}
              showGrid={showGrid}
              snapToGrid={snapToGrid}
              gridSize={gridSize}
              defaultFontSize={defaultFontSize}
              onNotify={(message) => uiStore.getState().toast(message)}
            />
          </EditorBoundary>
        ) : (
          <div className="canvas-message">
            <span>No diagram is open.</span>
            <span className="muted">Double-click a diagram in the Model Explorer, or use Model › Add Diagram.</span>
          </div>
        )}
      </div>
    </main>
  )
}
