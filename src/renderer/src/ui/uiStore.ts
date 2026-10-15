/**
 * UI-only state (Zustand): active tool, per-diagram zoom, panel layout, preferences, explorer
 * options, recent files, dialogs and toasts. Nothing here is saved in the project file; layout,
 * preferences and recent files persist per viewer through `persist.ts`.
 */
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { GRID, sanitizeGridSize, ZOOM } from '../diagram'
import {
  areaOf,
  describePosition,
  movePanel,
  movePanelBy,
  movePanelToArea,
  resetLayout as defaultDockLayout,
  sanitizeDockLayout,
  setPanelCollapsed,
  setPanelSizes,
  setPanelVisible,
  type DockAreaId,
  type DockLayout,
  type DockPanelId
} from './dock/dockModel'
import { platform } from './app/bridge'
import { sanitizeOverrides, type KeybindingOverrides } from './keybindings'
import { loadJson, saveJson } from './persist'
import { addRecentFile, removeRecentFile, sanitizeRecentFiles } from './recentFiles'

/** A toolbox tool: `kind` is a key of `NODE_KINDS` / `EDGE_KINDS`; extra fields refine it. */
export interface PaletteTool {
  readonly kind: string
  /** Messages: the `UMLMessageSort` literal. */
  readonly messageSort?: string
  /** Self message: tail = head. */
  readonly selfConnection?: boolean
  /** Found/lost message: the end (`tail` = found, `head` = lost) that is drawn on empty canvas and gets a new endpoint. */
  readonly freeEnd?: 'tail' | 'head'
}

export type ThemePreference = 'system' | 'dark' | 'light'
export type SortMode = 'added' | 'name'

export interface PanelState {
  readonly visible: boolean
  readonly size: number
}

/** Fixed chrome. `sidebar` / `navigator` are the left / right dock areas (visibility and width). */
export type PanelId = 'sidebar' | 'navigator' | 'toolbar' | 'statusbar'
/** Anything the View menu can show/hide: chrome, a dockable panel, or all three editors. */
export type ToggleablePanel = PanelId | DockPanelId | 'editors'
const EDITOR_PANELS: readonly DockPanelId[] = ['styles', 'properties', 'documentation']
/** The `panels` entry holding a dock area's visibility and width. */
const AREA_PANEL: Readonly<Record<DockAreaId, PanelId>> = { left: 'sidebar', right: 'navigator' }

export interface Preferences {
  readonly theme: ThemePreference
  readonly showGrid: boolean
  readonly snapToGrid: boolean
  /** Grid step of the diagram editor in diagram units (drawing, snapping, Shift+arrow nudge). */
  readonly gridSize: number
  /** Font size of views created in the diagram editor (where they would take the default font). */
  readonly defaultFontSize: number
  /** RAD: a new element placed below an open-ended element gets a state line from it. */
  readonly radAutoThread: boolean
  /** Seconds between automatic saves of a project that has a file (0 = off). */
  readonly autoSaveSeconds: number
  /** Ask GitHub for a newer release at startup (and once a day while running). */
  readonly checkForUpdates: boolean
}

/** Auto-save intervals offered in Preferences (seconds; 0 = off). */
export const AUTO_SAVE_INTERVALS: readonly number[] = [0, 30, 60, 120, 300, 600]

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  showGrid: true,
  snapToGrid: true,
  gridSize: GRID.size,
  defaultFontSize: 13,
  radAutoThread: true,
  autoSaveSeconds: 60,
  checkForUpdates: true
}

const DEFAULT_PANELS: Readonly<Record<PanelId, PanelState>> = {
  sidebar: { visible: true, size: 260 },
  navigator: { visible: true, size: 300 },
  toolbar: { visible: true, size: 34 },
  statusbar: { visible: true, size: 24 }
}

interface Toast {
  readonly id: number
  readonly text: string
  readonly kind: 'info' | 'error'
}

/** One row of a read-only result list: clicking it closes the dialog and runs `onSelect`. */
export interface ListRow {
  readonly text: string
  readonly indent?: number
  readonly onSelect?: () => void
}

/** One row of a checklist dialog: `detail` says what ticking it would cost. */
export interface ChecklistRow {
  readonly id: string
  readonly label: string
  readonly detail: string
}

/** Modal dialogs; promise-based ones carry their resolver. */
export type ModalState =
  | { readonly kind: 'palette' }
  | { readonly kind: 'list'; readonly title: string; readonly items: readonly ListRow[] }
  | { readonly kind: 'preferences' }
  | { readonly kind: 'shortcuts' }
  | {
      readonly kind: 'checklist'
      readonly title: string
      readonly message: string
      readonly rows: readonly ChecklistRow[]
      /** Exactly this many rows must be ticked to confirm. */
      readonly required: number
      readonly resolve: (ids: readonly string[] | null) => void
    }
  | { readonly kind: 'prompt'; readonly title: string; readonly initial: string; readonly resolve: (v: string | null) => void }
  | {
      readonly kind: 'picker'
      readonly title: string
      /** Element types allowed (any subtype). */
      readonly types: readonly string[]
      readonly resolve: (id: string | null) => void
    }
  | {
      readonly kind: 'refList'
      readonly title: string
      readonly types: readonly string[]
      readonly initial: readonly string[]
      readonly resolve: (ids: readonly string[] | null) => void
    }

export interface ContextMenuState {
  readonly x: number
  readonly y: number
  /** Which menu to show (resolved by the context-menu host). */
  readonly menu: 'explorer' | 'explorer-settings' | 'working-diagrams' | 'canvas' | 'zoom'
  /** Element the menu was opened on (e.g. a diagram in the working-diagrams list). */
  readonly targetId?: string
}

/** A newer release found by the update check. */
export interface AvailableUpdate {
  readonly version: string
  /** Release page to download it from. */
  readonly url: string
}

export interface UiState {
  readonly tool: PaletteTool | null
  readonly toolLocked: boolean
  readonly zoomByDiagram: Readonly<Record<string, number>>
  readonly panels: Readonly<Record<PanelId, PanelState>>
  /** Which dock area holds which panels, their height weights and collapsed/visible flags. */
  readonly dock: DockLayout
  /** Latest docking announcement for screen readers (`tick` changes on every move). */
  readonly dockAnnouncement: { readonly text: string; readonly tick: number }
  readonly showAdvancedProperties: boolean
  readonly prefs: Preferences
  readonly sortBy: SortMode
  readonly showStereotype: boolean
  /** Expanded explorer nodes (ids). */
  readonly expanded: Readonly<Record<string, true>>
  /** IDEF0 arrows of a box shown in role folders (true) or as a flat list. */
  readonly groupArrows: boolean
  /** Collapsed IDEF0 role folders (folder keys); folders are open by default. Persisted per viewer. */
  readonly collapsedFolders: Readonly<Record<string, true>>
  /** Explorer node whose inline rename should start. */
  readonly renamingId: string | null
  /** Bumped to ask the explorer to scroll the selection into view and focus it. */
  readonly revealTick: number
  readonly recentFiles: readonly string[]
  readonly paletteMru: readonly string[]
  readonly modal: ModalState | null
  readonly contextMenu: ContextMenuState | null
  readonly toasts: readonly Toast[]
  /** Version of the running application (null until the main process told it). */
  readonly appVersion: string | null
  /** A newer release, when the update check found one. */
  readonly update: AvailableUpdate | null
  /** Keyboard shortcuts the user customized (per command; see `keybindings.ts`). */
  readonly keybindings: KeybindingOverrides

  /** Toolbox click semantics: select → lock → back to Select. */
  clickTool(tool: PaletteTool): void
  /** Double-click: select and lock. */
  lockTool(tool: PaletteTool): void
  setTool(tool: PaletteTool | null): void
  /** Called by the diagram editor after a creation: reverts to Select unless locked. */
  toolUsed(): void
  zoomOf(diagramId: string | null): number
  setZoom(diagramId: string, zoom: number): void
  isPanelVisible(id: ToggleablePanel): boolean
  togglePanel(id: ToggleablePanel): void
  setPanelSize(id: PanelId, size: number): void
  /** Docks `id` into `area` before `beforeId` (null = end); `size` optionally sets its height weight. */
  moveDockPanel(id: DockPanelId, area: DockAreaId, beforeId: DockPanelId | null, size?: number): void
  moveDockPanelBy(id: DockPanelId, step: -1 | 1): void
  moveDockPanelToArea(id: DockPanelId, area: DockAreaId): void
  /** Height weights; `persist: false` for live splitter drags (persist on release). */
  setDockPanelSizes(sizes: Partial<Record<DockPanelId, number>>, persist?: boolean): void
  toggleDockCollapsed(id: DockPanelId): void
  setDockPanelVisible(id: DockPanelId, visible: boolean): void
  /** Makes a panel visible, expanded and its dock area shown. */
  showDockPanel(id: DockPanelId): void
  /** Restores the default docking (panel positions, sizes, area widths and visibility). */
  resetLayout(): void
  setShowAdvancedProperties(show: boolean): void
  setPrefs(changes: Partial<Preferences>): void
  resetPrefs(): void
  setSortBy(mode: SortMode): void
  setShowStereotype(show: boolean): void
  setExpanded(id: string, expanded: boolean): void
  expandMany(ids: readonly string[]): void
  collapseAll(): void
  setGroupArrows(group: boolean): void
  /** Collapses or opens IDEF0 role folders (keys from `folderKey`). */
  setFoldersCollapsed(keys: readonly string[], collapsed: boolean): void
  startRename(id: string | null): void
  reveal(): void
  addRecent(path: string): void
  removeRecent(path: string): void
  clearRecent(): void
  notePaletteUse(command: string): void
  openModal(modal: ModalState | null): void
  openContextMenu(menu: ContextMenuState | null): void
  /** Shows a brief, non-blocking message; an identical one already shown is replaced. */
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
  setAppVersion(version: string): void
  setUpdate(update: AvailableUpdate | null): void
  setKeybindings(keybindings: KeybindingOverrides): void
}

/** Clamps a stored zoom to the diagram module's range, rounded to whole percents. */
function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM.default
  return Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, zoom)) * 100) / 100
}

interface PersistedLayout {
  panels?: Partial<Record<PanelId, PanelState>>
  dock?: unknown
  /** Legacy (before docking): open state of the editor sections. */
  sections?: Partial<Record<'styles' | 'properties' | 'documentation', boolean>>
  sortBy?: SortMode
  showStereotype?: boolean
  showAdvancedProperties?: boolean
  groupArrows?: boolean
}

/** Most collapsed role folders remembered (oldest forgotten first). */
const MAX_COLLAPSED_FOLDERS = 2000

function loadCollapsedFolders(): Record<string, true> {
  const value = loadJson<unknown>('explorerCollapsedFolders', [])
  const result: Record<string, true> = {}
  if (Array.isArray(value)) for (const key of value.slice(-MAX_COLLAPSED_FOLDERS)) if (typeof key === 'string') result[key] = true
  return result
}

function sanitizePanels(value: Partial<Record<PanelId, PanelState>> | undefined): Record<PanelId, PanelState> {
  const result = { ...DEFAULT_PANELS }
  for (const id of Object.keys(DEFAULT_PANELS) as PanelId[]) {
    const p = value?.[id]
    if (p && typeof p.visible === 'boolean' && typeof p.size === 'number' && Number.isFinite(p.size)) {
      result[id] = { visible: p.visible, size: Math.max(0, Math.round(p.size)) }
    }
  }
  return result
}

function sanitizePrefs(value: Partial<Preferences> | undefined): Preferences {
  const v = value ?? {}
  return {
    theme: v.theme === 'dark' || v.theme === 'light' || v.theme === 'system' ? v.theme : DEFAULT_PREFERENCES.theme,
    showGrid: typeof v.showGrid === 'boolean' ? v.showGrid : DEFAULT_PREFERENCES.showGrid,
    snapToGrid: typeof v.snapToGrid === 'boolean' ? v.snapToGrid : DEFAULT_PREFERENCES.snapToGrid,
    gridSize: sanitizeGridSize(v.gridSize),
    defaultFontSize:
      typeof v.defaultFontSize === 'number' && v.defaultFontSize >= 6 && v.defaultFontSize <= 72
        ? Math.round(v.defaultFontSize)
        : DEFAULT_PREFERENCES.defaultFontSize,
    radAutoThread: typeof v.radAutoThread === 'boolean' ? v.radAutoThread : DEFAULT_PREFERENCES.radAutoThread,
    autoSaveSeconds:
      typeof v.autoSaveSeconds === 'number' && AUTO_SAVE_INTERVALS.includes(v.autoSaveSeconds) ? v.autoSaveSeconds : DEFAULT_PREFERENCES.autoSaveSeconds,
    checkForUpdates: typeof v.checkForUpdates === 'boolean' ? v.checkForUpdates : DEFAULT_PREFERENCES.checkForUpdates
  }
}

/** The persisted dock layout, or one migrated from the pre-docking layout keys. */
function loadDock(layout: PersistedLayout): DockLayout {
  if (layout.dock !== undefined) return sanitizeDockLayout(layout.dock)
  let dock = defaultDockLayout()
  const legacy = (layout.panels ?? {}) as Record<string, Partial<PanelState> | undefined>
  const flag = (v: unknown): v is boolean => typeof v === 'boolean'
  if (flag(legacy['toolbox']?.visible)) dock = setPanelVisible(dock, 'toolbox', legacy['toolbox'].visible)
  if (flag(legacy['editors']?.visible)) for (const id of EDITOR_PANELS) dock = setPanelVisible(dock, id, legacy['editors'].visible)
  for (const id of ['toolbox', 'workingDiagrams'] as const) {
    const size = legacy[id]?.size
    if (typeof size === 'number') dock = setPanelSizes(dock, { [id]: size })
  }
  for (const id of ['styles', 'properties', 'documentation'] as const) {
    if (layout.sections?.[id] === false) dock = setPanelCollapsed(dock, id, true)
  }
  return dock
}

let toastCounter = 0
let announceCounter = 0

export function createUiStore() {
  const layout = loadJson<PersistedLayout>('layout', {})
  return createStore<UiState>()((set, get) => {
    const persistLayout = (): void => {
      const s = get()
      saveJson('layout', {
        panels: s.panels,
        dock: s.dock,
        sortBy: s.sortBy,
        showStereotype: s.showStereotype,
        showAdvancedProperties: s.showAdvancedProperties,
        groupArrows: s.groupArrows
      } satisfies PersistedLayout)
    }
    const setRecent = (recentFiles: string[]): void => {
      set({ recentFiles })
      saveJson('recentFiles', recentFiles)
    }
    /** Commits a dock layout; `revealId`'s area is shown, and its new position announced when `announce`. */
    const setDock = (dock: DockLayout, revealId?: DockPanelId, announce = revealId !== undefined): void => {
      const s = get()
      if (dock === s.dock) return
      let panels = s.panels
      // Docking into a hidden area shows it.
      if (revealId) {
        const key = AREA_PANEL[areaOf(dock, revealId)]
        if (!panels[key].visible) panels = { ...panels, [key]: { ...panels[key], visible: true } }
      }
      set({
        dock,
        panels,
        ...(revealId && announce ? { dockAnnouncement: { text: describePosition(dock, revealId), tick: ++announceCounter } } : {})
      })
      persistLayout()
    }
    return {
      tool: null,
      toolLocked: false,
      zoomByDiagram: {},
      panels: sanitizePanels(layout.panels),
      dock: loadDock(layout),
      dockAnnouncement: { text: '', tick: 0 },
      showAdvancedProperties: layout.showAdvancedProperties === true,
      prefs: sanitizePrefs(loadJson<Partial<Preferences>>('preferences', {})),
      sortBy: layout.sortBy === 'name' ? 'name' : 'added',
      showStereotype: layout.showStereotype !== false,
      expanded: {},
      groupArrows: layout.groupArrows !== false,
      collapsedFolders: loadCollapsedFolders(),
      renamingId: null,
      revealTick: 0,
      recentFiles: sanitizeRecentFiles(loadJson<unknown>('recentFiles', [])),
      paletteMru: sanitizeRecentFiles(loadJson<unknown>('paletteMru', []), 20),
      modal: null,
      contextMenu: null,
      toasts: [],
      appVersion: null,
      update: null,
      keybindings: sanitizeOverrides(loadJson<unknown>('keybindings', {}), platform),

      clickTool(tool) {
        const s = get()
        const same = s.tool !== null && sameTool(s.tool, tool)
        if (!same) set({ tool, toolLocked: false })
        else if (!s.toolLocked) set({ toolLocked: true })
        else set({ tool: null, toolLocked: false })
      },
      lockTool(tool) {
        set({ tool, toolLocked: true })
      },
      setTool(tool) {
        set({ tool, toolLocked: false })
      },
      toolUsed() {
        if (!get().toolLocked) set({ tool: null })
      },
      zoomOf(diagramId) {
        return (diagramId && get().zoomByDiagram[diagramId]) || 1
      },
      setZoom(diagramId, zoom) {
        set({ zoomByDiagram: { ...get().zoomByDiagram, [diagramId]: clampZoom(zoom) } })
      },
      isPanelVisible(id) {
        const s = get()
        if (id === 'editors') return EDITOR_PANELS.some((p) => s.dock.panels[p].visible)
        if (id in s.panels) return s.panels[id as PanelId].visible
        return s.dock.panels[id as DockPanelId].visible
      },
      togglePanel(id) {
        const s = get()
        if (id === 'editors') {
          const show = !s.isPanelVisible('editors')
          let dock = s.dock
          for (const p of EDITOR_PANELS) dock = setPanelVisible(dock, p, show)
          setDock(dock)
          return
        }
        if (id in s.panels) {
          const p = s.panels[id as PanelId]
          set({ panels: { ...s.panels, [id]: { ...p, visible: !p.visible } } })
          persistLayout()
          return
        }
        const dockId = id as DockPanelId
        const show = !s.dock.panels[dockId].visible
        setDock(setPanelVisible(s.dock, dockId, show), show ? dockId : undefined, false)
      },
      setPanelSize(id, size) {
        const p = get().panels[id]
        set({ panels: { ...get().panels, [id]: { ...p, size: Math.max(0, Math.round(size)) } } })
        persistLayout()
      },
      moveDockPanel(id, area, beforeId, size) {
        let dock = movePanel(get().dock, id, area, beforeId)
        if (size !== undefined && dock !== get().dock) dock = setPanelSizes(dock, { [id]: size })
        setDock(dock, id)
      },
      moveDockPanelBy(id, step) {
        setDock(movePanelBy(get().dock, id, step), id)
      },
      moveDockPanelToArea(id, area) {
        setDock(movePanelToArea(get().dock, id, area), id)
      },
      setDockPanelSizes(sizes, persist = true) {
        const dock = setPanelSizes(get().dock, sizes)
        if (dock !== get().dock) set({ dock })
        if (persist) persistLayout()
      },
      toggleDockCollapsed(id) {
        setDock(setPanelCollapsed(get().dock, id, !get().dock.panels[id].collapsed))
      },
      setDockPanelVisible(id, visible) {
        setDock(setPanelVisible(get().dock, id, visible), visible ? id : undefined, false)
      },
      showDockPanel(id) {
        const s = get()
        let dock = s.dock
        if (!dock.panels[id].visible) dock = setPanelVisible(dock, id, true)
        if (dock.panels[id].collapsed) dock = setPanelCollapsed(dock, id, false)
        const key = AREA_PANEL[areaOf(dock, id)]
        if (dock === s.dock && s.panels[key].visible) return
        set({ dock, panels: s.panels[key].visible ? s.panels : { ...s.panels, [key]: { ...s.panels[key], visible: true } } })
        persistLayout()
      },
      resetLayout() {
        set({
          dock: defaultDockLayout(),
          panels: { ...get().panels, sidebar: DEFAULT_PANELS.sidebar, navigator: DEFAULT_PANELS.navigator },
          dockAnnouncement: { text: 'Layout reset to default', tick: ++announceCounter }
        })
        persistLayout()
      },
      setShowAdvancedProperties(show) {
        set({ showAdvancedProperties: show })
        persistLayout()
      },
      setPrefs(changes) {
        const prefs = sanitizePrefs({ ...get().prefs, ...changes })
        set({ prefs })
        saveJson('preferences', prefs)
      },
      resetPrefs() {
        set({ prefs: DEFAULT_PREFERENCES })
        saveJson('preferences', DEFAULT_PREFERENCES)
      },
      setSortBy(sortBy) {
        set({ sortBy })
        persistLayout()
      },
      setShowStereotype(showStereotype) {
        set({ showStereotype })
        persistLayout()
      },
      setExpanded(id, expanded) {
        const next = { ...get().expanded }
        if (expanded) next[id] = true
        else delete next[id]
        set({ expanded: next })
      },
      expandMany(ids) {
        const next = { ...get().expanded }
        for (const id of ids) next[id] = true
        set({ expanded: next })
      },
      collapseAll() {
        set({ expanded: {} })
      },
      setGroupArrows(groupArrows) {
        set({ groupArrows })
        persistLayout()
      },
      setFoldersCollapsed(keys, collapsed) {
        const next = { ...get().collapsedFolders }
        let changed = false
        for (const key of keys) {
          if (collapsed && !next[key]) {
            next[key] = true
            changed = true
          } else if (!collapsed && next[key]) {
            delete next[key]
            changed = true
          }
        }
        if (!changed) return
        set({ collapsedFolders: next })
        saveJson('explorerCollapsedFolders', Object.keys(next).slice(-MAX_COLLAPSED_FOLDERS))
      },
      startRename(renamingId) {
        set({ renamingId })
      },
      reveal() {
        set({ revealTick: get().revealTick + 1 })
      },
      addRecent(path) {
        setRecent(addRecentFile(get().recentFiles, path))
      },
      removeRecent(path) {
        setRecent(removeRecentFile(get().recentFiles, path))
      },
      clearRecent() {
        setRecent([])
      },
      notePaletteUse(command) {
        const paletteMru = addRecentFile(get().paletteMru, command, 20)
        set({ paletteMru })
        saveJson('paletteMru', paletteMru)
      },
      openModal(modal) {
        set({ modal, contextMenu: null })
      },
      openContextMenu(contextMenu) {
        set({ contextMenu })
      },
      toast(text, kind = 'info') {
        const id = ++toastCounter
        // The same message again (a repeated refused gesture) replaces the one shown, so it stays
        // up for the full time instead of stacking.
        const others = get().toasts.filter((t) => t.text !== text || t.kind !== kind)
        set({ toasts: [...others, { id, text, kind }].slice(-4) })
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500)
      },
      dismissToast(id) {
        set({ toasts: get().toasts.filter((t) => t.id !== id) })
      },
      setAppVersion(appVersion) {
        set({ appVersion })
      },
      setUpdate(update) {
        set({ update })
      },
      setKeybindings(keybindings) {
        set({ keybindings })
        saveJson('keybindings', keybindings)
      }
    }
  })
}

export function sameTool(a: PaletteTool, b: PaletteTool): boolean {
  return a.kind === b.kind && a.messageSort === b.messageSort && (a.selfConnection ?? false) === (b.selfConnection ?? false) && a.freeEnd === b.freeEnd
}

export const uiStore = createUiStore()

export function useUiStore<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}

// ---------------------------------------------------------------------------------------------
// Promise-based dialogs

export function promptText(title: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => uiStore.getState().openModal({ kind: 'prompt', title, initial, resolve }))
}

/** Asks the user to tick exactly `required` of `rows`; resolves with their IDs, or null when cancelled. */
export function chooseRows(title: string, message: string, rows: readonly ChecklistRow[], required: number): Promise<readonly string[] | null> {
  return new Promise((resolve) => uiStore.getState().openModal({ kind: 'checklist', title, message, rows, required, resolve }))
}

export function pickElement(title: string, types: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => uiStore.getState().openModal({ kind: 'picker', title, types, resolve }))
}

export function editReferenceList(
  title: string,
  types: readonly string[],
  initial: readonly string[]
): Promise<readonly string[] | null> {
  return new Promise((resolve) => uiStore.getState().openModal({ kind: 'refList', title, types, initial, resolve }))
}
