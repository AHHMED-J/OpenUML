/**
 * Application shell layout: toolbar; left sidebar (Model Explorer + Working Diagrams); center
 * diagram area with tabs; right navigator (Toolbox + Styles/Properties/Documentation); status bar.
 * Panels are resizable (splitters) and collapsible (View menu); sizes persist per viewer.
 */
import { useEffect } from 'react'
import type React from 'react'
import { initCommands } from './app/commands'
import { startShell } from './app/lifecycle'
import { Splitter } from './components/Splitter'
import { DiagramArea } from './diagramArea/DiagramArea'
import { WorkingDiagrams } from './diagramArea/WorkingDiagrams'
import { ModelExplorer } from './explorer/ModelExplorer'
import { ContextMenuHost } from './menus/ContextMenu'
import { ModalHost, Toasts } from './Overlays'
import { EditorsPanel } from './properties/EditorsPanel'
import { StatusBar } from './StatusBar'
import { Toolbar } from './Toolbar'
import { Toolbox } from './toolbox/Toolbox'
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

export function Shell(): React.JSX.Element {
  // Commands must exist before the first render so toolbar and menus show their real state.
  initCommands()
  useTheme()
  useEffect(() => startShell(), [])
  const panels = useUiStore((s) => s.panels)
  const resize = uiStore.getState().setPanelSize
  const showNavigator = panels.navigator.visible && (panels.toolbox.visible || panels.editors.visible)

  return (
    <div className="app">
      {panels.toolbar.visible ? <Toolbar /> : null}
      <div className="workspace">
        {panels.sidebar.visible ? (
          <>
            <aside className="sidebar" style={{ width: panels.sidebar.size }} aria-label="Sidebar">
              <div className="fill">
                <ModelExplorer />
              </div>
              <Splitter
                orientation="horizontal"
                after
                size={panels.workingDiagrams.size}
                min={60}
                max={Math.max(120, window.innerHeight - 220)}
                label="Resize working diagrams"
                onResize={(s) => resize('workingDiagrams', s)}
              />
              <div style={{ height: panels.workingDiagrams.size }} className="fixed">
                <WorkingDiagrams />
              </div>
            </aside>
            <Splitter
              orientation="vertical"
              size={panels.sidebar.size}
              min={160}
              max={600}
              label="Resize sidebar"
              onResize={(s) => resize('sidebar', s)}
            />
          </>
        ) : null}
        <DiagramArea />
        {showNavigator ? (
          <>
            <Splitter
              orientation="vertical"
              after
              size={panels.navigator.size}
              min={220}
              max={700}
              label="Resize navigator"
              onResize={(s) => resize('navigator', s)}
            />
            <aside className="navigator" style={{ width: panels.navigator.size }} aria-label="Navigator">
              {panels.toolbox.visible ? (
                <div className={panels.editors.visible ? 'fixed' : 'fill'} style={panels.editors.visible ? { height: panels.toolbox.size } : undefined}>
                  <Toolbox />
                </div>
              ) : null}
              {panels.toolbox.visible && panels.editors.visible ? (
                <Splitter
                  orientation="horizontal"
                  size={panels.toolbox.size}
                  min={60}
                  max={Math.max(120, window.innerHeight - 200)}
                  label="Resize toolbox"
                  onResize={(s) => resize('toolbox', s)}
                />
              ) : null}
              {panels.editors.visible ? (
                <div className="fill">
                  <EditorsPanel />
                </div>
              ) : null}
            </aside>
          </>
        ) : null}
      </div>
      {panels.statusbar.visible ? <StatusBar /> : null}
      <ContextMenuHost />
      <ModalHost />
      <Toasts />
    </div>
  )
}
