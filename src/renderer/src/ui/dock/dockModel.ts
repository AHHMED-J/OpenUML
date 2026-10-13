/**
 * Panel docking model (pure). Two dock areas, `left` and `right`, each hold an ordered stack of
 * panels. Every dockable panel is in exactly one area; per panel we keep a height weight (flex
 * share, roughly pixels at the default window size), a collapsed flag and a visibility flag.
 *
 * All functions are pure and return new layouts; the UI store owns the current value and
 * persists it (`version` guards the persisted schema).
 */

export const DOCK_PANEL_IDS = ['explorer', 'workingDiagrams', 'toolbox', 'styles', 'properties', 'documentation'] as const
export type DockPanelId = (typeof DOCK_PANEL_IDS)[number]

export const DOCK_AREA_IDS = ['left', 'right'] as const
export type DockAreaId = (typeof DOCK_AREA_IDS)[number]

export interface DockPanelState {
  /** Height weight (flex-grow share) while expanded. */
  readonly size: number
  readonly collapsed: boolean
  readonly visible: boolean
}

export interface DockLayout {
  readonly version: typeof DOCK_LAYOUT_VERSION
  readonly areas: Readonly<Record<DockAreaId, readonly DockPanelId[]>>
  readonly panels: Readonly<Record<DockPanelId, DockPanelState>>
}

const DOCK_LAYOUT_VERSION = 1

export const DOCK_PANEL_TITLES: Readonly<Record<DockPanelId, string>> = {
  explorer: 'Model Explorer',
  workingDiagrams: 'Working Diagrams',
  toolbox: 'Toolbox',
  styles: 'Styles',
  properties: 'Properties',
  documentation: 'Documentation'
}

export const DOCK_AREA_TITLES: Readonly<Record<DockAreaId, string>> = {
  left: 'left sidebar',
  right: 'right sidebar'
}

const MIN_PANEL_SIZE = 40
const MAX_PANEL_SIZE = 5000

/** The default (factory) layout: explorer over working diagrams; toolbox over the editors. */
export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  version: DOCK_LAYOUT_VERSION,
  areas: {
    left: ['explorer', 'workingDiagrams'],
    right: ['toolbox', 'styles', 'properties', 'documentation']
  },
  panels: {
    explorer: { size: 520, collapsed: false, visible: true },
    workingDiagrams: { size: 150, collapsed: false, visible: true },
    toolbox: { size: 260, collapsed: false, visible: true },
    styles: { size: 150, collapsed: false, visible: true },
    properties: { size: 300, collapsed: false, visible: true },
    documentation: { size: 120, collapsed: false, visible: true }
  }
}

export function isDockPanelId(value: unknown): value is DockPanelId {
  return typeof value === 'string' && (DOCK_PANEL_IDS as readonly string[]).includes(value)
}

export function isDockAreaId(value: unknown): value is DockAreaId {
  return typeof value === 'string' && (DOCK_AREA_IDS as readonly string[]).includes(value)
}

function clampPanelSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_PANEL_SIZE
  return Math.round(Math.max(MIN_PANEL_SIZE, Math.min(MAX_PANEL_SIZE, size)))
}

/** The area holding `id` (every panel is in exactly one area in a sanitized layout). */
export function areaOf(layout: DockLayout, id: DockPanelId): DockAreaId {
  for (const area of DOCK_AREA_IDS) if (layout.areas[area].includes(id)) return area
  return defaultAreaOf(id)
}

function defaultAreaOf(id: DockPanelId): DockAreaId {
  return DEFAULT_DOCK_LAYOUT.areas.left.includes(id) ? 'left' : 'right'
}

/** Panels of `area` that are shown (in stack order). */
export function visiblePanels(layout: DockLayout, area: DockAreaId): DockPanelId[] {
  return layout.areas[area].filter((id) => layout.panels[id].visible)
}

/** True when the area has nothing to show (it is collapsed out of the window). */
export function isAreaEmpty(layout: DockLayout, area: DockAreaId): boolean {
  return visiblePanels(layout, area).length === 0
}

/**
 * Moves `id` into `area`, before `beforeId` (or to the end when `beforeId` is null, missing,
 * or the panel itself). A moved panel is made visible. Returns the same layout when nothing
 * changes.
 */
export function movePanel(layout: DockLayout, id: DockPanelId, area: DockAreaId, beforeId: DockPanelId | null): DockLayout {
  const from = areaOf(layout, id)
  const target = layout.areas[area].filter((p) => p !== id)
  let index = beforeId !== null && beforeId !== id ? target.indexOf(beforeId) : -1
  if (index < 0) index = target.length
  target.splice(index, 0, id)
  const panel = layout.panels[id]
  const unchangedOrder = from === area && sameList(target, layout.areas[area])
  if (unchangedOrder && panel.visible) return layout
  const areas = { ...layout.areas, [area]: target }
  if (from !== area) areas[from] = layout.areas[from].filter((p) => p !== id)
  return {
    ...layout,
    areas,
    panels: panel.visible ? layout.panels : { ...layout.panels, [id]: { ...panel, visible: true } }
  }
}

/** Moves `id` up (`-1`) or down (`+1`) among the visible panels of its area. */
export function movePanelBy(layout: DockLayout, id: DockPanelId, step: -1 | 1): DockLayout {
  const area = areaOf(layout, id)
  const shown = visiblePanels(layout, area)
  const index = shown.indexOf(id)
  if (index < 0) return layout
  const next = index + step
  if (next < 0 || next >= shown.length) return layout
  // Before the visible panel that will follow `id` once moved.
  const beforeId = step < 0 ? (shown[next] ?? null) : (shown[next + 1] ?? null)
  return movePanel(layout, id, area, beforeId)
}

/** Moves `id` to the end of `area`. */
export function movePanelToArea(layout: DockLayout, id: DockPanelId, area: DockAreaId): DockLayout {
  if (areaOf(layout, id) === area) return layout
  return movePanel(layout, id, area, null)
}

export function setPanelVisible(layout: DockLayout, id: DockPanelId, visible: boolean): DockLayout {
  const panel = layout.panels[id]
  if (panel.visible === visible) return layout
  return { ...layout, panels: { ...layout.panels, [id]: { ...panel, visible } } }
}

export function setPanelCollapsed(layout: DockLayout, id: DockPanelId, collapsed: boolean): DockLayout {
  const panel = layout.panels[id]
  if (panel.collapsed === collapsed) return layout
  return { ...layout, panels: { ...layout.panels, [id]: { ...panel, collapsed } } }
}

/** Sets height weights (clamped). */
export function setPanelSizes(layout: DockLayout, sizes: Partial<Record<DockPanelId, number>>): DockLayout {
  const panels = { ...layout.panels }
  let changed = false
  for (const [id, size] of Object.entries(sizes) as [DockPanelId, number][]) {
    if (!isDockPanelId(id) || typeof size !== 'number') continue
    const next = clampPanelSize(size)
    if (panels[id].size !== next) {
      panels[id] = { ...panels[id], size: next }
      changed = true
    }
  }
  return changed ? { ...layout, panels } : layout
}

/** The factory layout (a fresh copy). */
export function resetLayout(): DockLayout {
  return sanitizeDockLayout(DEFAULT_DOCK_LAYOUT)
}

/**
 * Validates a persisted layout. Unknown panel ids and duplicates are dropped; panels missing
 * from every area return to their default area (at their default position relative to the
 * panels already there); bad per-panel values fall back to defaults. Never loses a panel.
 */
export function sanitizeDockLayout(value: unknown): DockLayout {
  const v = isRecord(value) && value['version'] === DOCK_LAYOUT_VERSION ? value : null
  const rawAreas = v && isRecord(v['areas']) ? v['areas'] : null
  const rawPanels = v && isRecord(v['panels']) ? v['panels'] : null
  const seen = new Set<DockPanelId>()
  const areas: Record<DockAreaId, DockPanelId[]> = { left: [], right: [] }
  if (rawAreas) {
    for (const area of DOCK_AREA_IDS) {
      const list = rawAreas[area]
      if (!Array.isArray(list)) continue
      for (const id of list) {
        if (isDockPanelId(id) && !seen.has(id)) {
          seen.add(id)
          areas[area].push(id)
        }
      }
    }
  }
  // Re-home missing panels in their default area, after their default predecessors.
  for (const area of DOCK_AREA_IDS) {
    const defaults = DEFAULT_DOCK_LAYOUT.areas[area]
    defaults.forEach((id, i) => {
      if (seen.has(id)) return
      seen.add(id)
      const list = areas[area]
      // Insert right after the closest preceding default panel that sits in this area.
      let index = 0
      for (let j = i - 1; j >= 0; j--) {
        const at = list.indexOf(defaults[j] as DockPanelId)
        if (at >= 0) {
          index = at + 1
          break
        }
      }
      list.splice(index, 0, id)
    })
  }
  const panels = {} as Record<DockPanelId, DockPanelState>
  for (const id of DOCK_PANEL_IDS) {
    const def = DEFAULT_DOCK_LAYOUT.panels[id]
    const raw = rawPanels && isRecord(rawPanels[id]) ? rawPanels[id] : null
    const size = raw && typeof raw['size'] === 'number' && Number.isFinite(raw['size']) ? clampPanelSize(raw['size']) : def.size
    panels[id] = {
      size,
      collapsed: raw && typeof raw['collapsed'] === 'boolean' ? raw['collapsed'] : def.collapsed,
      visible: raw && typeof raw['visible'] === 'boolean' ? raw['visible'] : def.visible
    }
  }
  return { version: DOCK_LAYOUT_VERSION, areas, panels }
}

/** Human-readable position for announcements, e.g. "Toolbox moved to the left sidebar, position 1 of 3". */
export function describePosition(layout: DockLayout, id: DockPanelId): string {
  const area = areaOf(layout, id)
  const shown = visiblePanels(layout, area)
  return `${DOCK_PANEL_TITLES[id]} moved to the ${DOCK_AREA_TITLES[area]}, position ${shown.indexOf(id) + 1} of ${shown.length}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
