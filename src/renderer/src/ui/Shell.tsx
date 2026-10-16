/**
 * Application shell layout: toolbar; left and right dock areas around the center diagram area;
 * status bar. Each part of the window has its own error boundary (`components/PanelBoundary`),
 * so a render error in one panel shows a "Reload panel" notice there instead of a blank window.
 * Each dock area is a vertical stack of dockable panels (Model Explorer, Working
 * Diagrams, Toolbox, Styles, Properties, Documentation — by default explorer + working diagrams
 * on the left, toolbox + editors on the right). Panels are rearranged by long-pressing their
 * header and dragging (`dock/`); areas and panels are resizable (splitters) and collapsible;
 * the layout persists per viewer.
 */
import { useEffect } from 'react'
import type React from 'react'
import { initCommands } from './app/commands'
import { startShell } from './app/lifecycle'
import { PanelBoundary, PanelErrorMessage } from './components/PanelBoundary'
import { Splitter } from './components/Splitter'
import { DiagramArea } from './diagramArea/DiagramArea'
import { DockAnnouncer, DockEdgeZone, DockStack } from './dock/DockArea'
import { isAreaEmpty } from './dock/dockModel'
import { ContextMenuHost } from './menus/ContextMenu'
import { ModalHost, Toasts } from './Overlays'
import { TooltipLayer } from './components/Tooltip'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { uiStore, useUiStore, type ThemePreference } from './uiStore'

function effectiveTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref !== 'system') return pref
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Applies the theme preference to `<html data-theme>`, following the OS when set to "system". */
function useTheme(): void {
  const pref = useUiStore((s) => s.prefs.theme)
  useEffect(() => {
    const apply = (): void => {
      document.documentElement.dataset['theme'] = effectiveTheme(pref)
    }
    apply()
    if (pref !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [pref])
}

/** The application window. The outer boundary is a last resort for errors in the layout itself. */
export function Shell(): React.JSX.Element {
  return (
    <PanelBoundary name="Window" fallback={({ reload }) => <PanelErrorMessage name="Window" reload={reload} what="window" />}>
      <ShellLayout />
    </PanelBoundary>
  )
}

function ShellLayout(): React.JSX.Element {
  // Commands must exist before the first render so toolbar and menus show their real state.
  initCommands()
  useTheme()
  useEffect(() => startShell(), [])
  const panels = useUiStore((s) => s.panels)
  const dock = useUiStore((s) => s.dock)
  const resize = uiStore.getState().setPanelSize
  // An area collapses out of the window when hidden or when none of its panels is shown.
  const showLeft = panels.sidebar.visible && !isAreaEmpty(dock, 'left')
  const showRight = panels.navigator.visible && !isAreaEmpty(dock, 'right')

  return (
    <div className="app">
      {panels.toolbar.visible ? (
        <PanelBoundary name="Toolbar">
          <Toolbar />
        </PanelBoundary>
      ) : null}
      <div className="workspace">
        {showLeft ? (
          <>
            <aside className="sidebar dock-area dock-area-left" style={{ width: panels.sidebar.size }} aria-label="Left sidebar">
              <PanelBoundary name="Left sidebar">
                <DockStack area="left" />
              </PanelBoundary>
            </aside>
            <Splitter
              orientation="vertical"
              size={panels.sidebar.size}
              min={160}
              max={600}
              label="Resize left sidebar"
              onResize={(s) => resize('sidebar', s)}
            />
          </>
        ) : null}
        <DiagramArea />
        {showRight ? (
          <>
            <Splitter
              orientation="vertical"
              after
              size={panels.navigator.size}
              min={180}
              max={700}
              label="Resize right sidebar"
              onResize={(s) => resize('navigator', s)}
            />
            <aside className="navigator dock-area dock-area-right" style={{ width: panels.navigator.size }} aria-label="Right sidebar">
              <PanelBoundary name="Right sidebar">
                <DockStack area="right" />
              </PanelBoundary>
            </aside>
          </>
        ) : null}
        <DockEdgeZone area="left" shown={showLeft} />
        <DockEdgeZone area="right" shown={showRight} />
      </div>
      {panels.statusbar.visible ? (
        <PanelBoundary name="Status bar">
          <StatusBar />
        </PanelBoundary>
      ) : null}
      <PanelBoundary name="Docking announcer" fallback={() => null}>
        <DockAnnouncer />
      </PanelBoundary>
      <ContextMenuHost />
      <ModalHost />
      <TooltipLayer />
      <PanelBoundary name="Notifications" fallback={() => null}>
        <Toasts />
      </PanelBoundary>
    </div>
  )
}
