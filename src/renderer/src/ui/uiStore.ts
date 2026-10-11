/**
 * UI-only state (Zustand): active tool, per-diagram zoom, panel layout, preferences, explorer
 * options, recent files, dialogs and toasts. Nothing here is saved in the project file; layout,
 * preferences and recent files persist per viewer through `persist.ts`.
 */
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { loadJson, saveJson } from './persist'
import { addRecentFile, removeRecentFile, sanitizeRecentFiles } from './recentFiles'

/** A toolbox tool: `kind` is a key of `NODE_KINDS` / `EDGE_KINDS`; extra fields refine it. */
export interface PaletteTool {
  readonly kind: string
  /** Messages: the `UMLMessageSort` literal. */
  readonly messageSort?: string
  /** Self message: tail = head. */
  readonly selfConnection?: boolean
}

export type ThemePreference = 'system' | 'dark' | 'light'
export type SortMode = 'added' | 'name'

export interface PanelState {
  readonly visible: boolean
  readonly size: number
}

export type PanelId = 'sidebar' | 'navigator' | 'toolbar' | 'statusbar' | 'toolbox' | 'editors' | 'workingDiagrams'
export type EditorSection = 'styles' | 'properties' | 'documentation'

export interface Preferences {
  readonly theme: ThemePreference
  readonly showGrid: boolean
  readonly snapToGrid: boolean
  readonly gridSize: number
  /** Default font size for new views. */
  readonly defaultFontSize: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  showGrid: true,
  snapToGrid: true,
  gridSize: 8,
  defaultFontSize: 13
}

export const DEFAULT_PANELS: Readonly<Record<PanelId, PanelState>> = {
  sidebar: { visible: true, size: 260 },
  navigator: { visible: true, size: 300 },
  toolbar: { visible: true, size: 34 },
  statusbar: { visible: true, size: 24 },
  toolbox: { visible: true, size: 260 },
  editors: { visible: true, size: 380 },
  workingDiagrams: { visible: true, size: 150 }
}

export interface Toast {
  readonly id: number
  readonly text: string
  readonly kind: 'info' | 'error'
}

/** Modal dialogs; promise-based ones carry their resolver. */
export type ModalState =
  | { readonly kind: 'palette' }
  | { readonly kind: 'preferences' }
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

export interface UiState {
  readonly tool: PaletteTool | null
  readonly toolLocked: boolean
  readonly zoomByDiagram: Readonly<Record<string, number>>
  readonly panels: Readonly<Record<PanelId, PanelState>>
  readonly sections: Readonly<Record<EditorSection, boolean>>
  readonly showAdvancedProperties: boolean
  readonly prefs: Preferences
  readonly sortBy: SortMode
  readonly showStereotype: boolean
  /** Expanded explorer nodes (ids). */
  readonly expanded: Readonly<Record<string, true>>
  /** Explorer node whose inline rename should start. */
  readonly renamingId: string | null
  /** Bumped to ask the explorer to scroll the selection into view and focus it. */
  readonly revealTick: number
  readonly recentFiles: readonly string[]
  readonly paletteMru: readonly string[]
  readonly modal: ModalState | null
  readonly contextMenu: ContextMenuState | null
  readonly toasts: readonly Toast[]

  /** Toolbox click semantics: select → lock → back to Select. */
  clickTool(tool: PaletteTool): void
  /** Double-click: select and lock. */
  lockTool(tool: PaletteTool): void
  setTool(tool: PaletteTool | null): void
  /** Called by the diagram editor after a creation: reverts to Select unless locked. */
  toolUsed(): void
  zoomOf(diagramId: string | null): number
  setZoom(diagramId: string, zoom: number): void
  togglePanel(id: PanelId): void
  setPanelSize(id: PanelId, size: number): void
  toggleSection(id: EditorSection): void
  setShowAdvancedProperties(show: boolean): void
  setPrefs(changes: Partial<Preferences>): void
  resetPrefs(): void
  setSortBy(mode: SortMode): void
  setShowStereotype(show: boolean): void
  setExpanded(id: string, expanded: boolean): void
  expandMany(ids: readonly string[]): void
  collapseAll(): void
  startRename(id: string | null): void
  reveal(): void
  addRecent(path: string): void
  removeRecent(path: string): void
  clearRecent(): void
  notePaletteUse(command: string): void
  openModal(modal: ModalState | null): void
  openContextMenu(menu: ContextMenuState | null): void
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: number): void
}

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.1

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 100) / 100
}

interface PersistedLayout {
  panels?: Partial<Record<PanelId, PanelState>>
  sections?: Partial<Record<EditorSection, boolean>>
  sortBy?: SortMode
  showStereotype?: boolean
  showAdvancedProperties?: boolean
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
    gridSize:
      typeof v.gridSize === 'number' && v.gridSize >= 2 && v.gridSize <= 50 ? Math.round(v.gridSize) : DEFAULT_PREFERENCES.gridSize,
    defaultFontSize:
      typeof v.defaultFontSize === 'number' && v.defaultFontSize >= 6 && v.defaultFontSize <= 72
        ? Math.round(v.defaultFontSize)
        : DEFAULT_PREFERENCES.defaultFontSize
  }
}

let toastCounter = 0

export function createUiStore() {
  const layout = loadJson<PersistedLayout>('layout', {})
  return createStore<UiState>()((set, get) => {
    const persistLayout = (): void => {
      const s = get()
      saveJson('layout', {
        panels: s.panels,
        sections: s.sections,
        sortBy: s.sortBy,
        showStereotype: s.showStereotype,
        showAdvancedProperties: s.showAdvancedProperties
      } satisfies PersistedLayout)
    }
    const setRecent = (recentFiles: string[]): void => {
      set({ recentFiles })
      saveJson('recentFiles', recentFiles)
    }
    return {
      tool: null,
      toolLocked: false,
      zoomByDiagram: {},
      panels: sanitizePanels(layout.panels),
      sections: { styles: true, properties: true, documentation: true, ...layout.sections },
      showAdvancedProperties: layout.showAdvancedProperties === true,
      prefs: sanitizePrefs(loadJson<Partial<Preferences>>('preferences', {})),
      sortBy: layout.sortBy === 'name' ? 'name' : 'added',
      showStereotype: layout.showStereotype !== false,
      expanded: {},
      renamingId: null,
      revealTick: 0,
      recentFiles: sanitizeRecentFiles(loadJson<unknown>('recentFiles', [])),
      paletteMru: sanitizeRecentFiles(loadJson<unknown>('paletteMru', []), 20),
      modal: null,
      contextMenu: null,
      toasts: [],

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
      togglePanel(id) {
        const p = get().panels[id]
        set({ panels: { ...get().panels, [id]: { ...p, visible: !p.visible } } })
        persistLayout()
      },
      setPanelSize(id, size) {
        const p = get().panels[id]
        set({ panels: { ...get().panels, [id]: { ...p, size: Math.max(0, Math.round(size)) } } })
        persistLayout()
      },
      toggleSection(id) {
        set({ sections: { ...get().sections, [id]: !get().sections[id] } })
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
        set({ toasts: [...get().toasts, { id, text, kind }].slice(-4) })
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500)
      },
      dismissToast(id) {
        set({ toasts: get().toasts.filter((t) => t.id !== id) })
      }
    }
  })
}

export function sameTool(a: PaletteTool, b: PaletteTool): boolean {
  return a.kind === b.kind && a.messageSort === b.messageSort && (a.selfConnection ?? false) === (b.selfConnection ?? false)
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
