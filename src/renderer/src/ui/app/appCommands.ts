/**
 * Commands owned by the application shell: file lifecycle, view toggles, zoom fallbacks,
 * Model > Add, explorer options, format/alignment fallbacks, help. Each is registered only
 * if no other module (e.g. the diagram editor) registered the same id first.
 */
import {
  deleteFromModel,
  reorderElement,
  setFieldsOfAll,
  setViewBounds,
  type CommandDefinition,
  type CommandRegistry
} from '../../commands'
import { deleteIdef0Elements, getTextMeasurer } from '../../diagram'
import { fieldOf, isKindOf, type DiagramKind, type Elem, type NodeView, type View } from '../../model'
import { activeDiagram, projectStore, selectedModels, selectedViews } from '../../store'
import { arrowFolderKeys, expandableIds, revealPath } from '../explorer/tree'
import { Cmd } from '../menus/commandIds'
import { ADD_DIAGRAM_ITEMS, ADD_ITEMS, addDiagram, addModelElement } from '../modelActions'
import { promptText, ZOOM_STEP, uiStore, type ToggleablePanel } from '../uiStore'
import { bridge } from './bridge'
import {
  closeWindow,
  exportAllDiagrams,
  exportDiagram,
  newProject,
  openProjectDialog,
  openProjectPath,
  saveProject,
  saveProjectAs
} from './fileOps'

const ps = () => projectStore.getState()
const ui = () => uiStore.getState()

const PROJECT_URL = 'https://github.com/AHHMED-J/OpenUML'

/** The element new children are added to: the first selected model, else the Project. */
function selectedParent(): Elem {
  return selectedModels(ps())[0] ?? ps().project
}

/** Selects an element in the explorer and reveals it (expanding its ancestors). */
export function selectInExplorer(el: Elem): void {
  const path = revealPath(el, { groupArrows: ui().groupArrows })
  ui().expandMany(path.expand)
  if (path.folder) ui().setFoldersCollapsed([path.folder], false)
  ps().select({ elements: [el._id] })
  ui().reveal()
}

/** Opens a diagram and selects it in the explorer. */
export function openDiagram(diagram: Elem): void {
  ps().openDiagram(diagram._id)
  selectInExplorer(diagram)
}

function singleSelectedModel(): Elem | null {
  const models = selectedModels(ps())
  return models.length === 1 ? (models[0] as Elem) : null
}

// ---------------------------------------------------------------------------------------------
// View formatting helpers (fallbacks when the diagram module does not provide them)

function viewsWithField(field: string): View[] {
  return selectedViews(ps()).filter((v) => fieldOf(v, field) !== undefined)
}

function toggleViewFlag(id: string, label: string, field: string): CommandDefinition {
  return {
    id,
    label,
    isEnabled: () => viewsWithField(field).length > 0,
    isChecked: () => {
      const views = viewsWithField(field)
      return views.length > 0 && views.every((v) => v[field] === true)
    },
    run: () => {
      const views = viewsWithField(field)
      if (views.length === 0) return
      const next = !views.every((v) => v[field] === true)
      setFieldsOfAll(ps().engine, views, { [field]: next }, `Change ${label}`)
    }
  }
}

function edgeViews(): View[] {
  return selectedViews(ps()).filter((v) => isKindOf(v, 'EdgeView'))
}

function lineStyle(id: string, label: string, style: number): CommandDefinition {
  return {
    id,
    label: `Line Style: ${label}`,
    isEnabled: () => edgeViews().length > 0,
    isChecked: () => {
      const edges = edgeViews()
      return edges.length > 0 && edges.every((e) => e['lineStyle'] === style)
    },
    run: () => setFieldsOfAll(ps().engine, edgeViews(), { lineStyle: style }, 'Change Line Style')
  }
}

/** Selected top-level node views (directly in the diagram). */
function alignableNodes(): NodeView[] {
  return selectedViews(ps()).filter(
    (v): v is NodeView => isKindOf(v, 'NodeView') && isKindOf(v._parent, 'Diagram') && !isKindOf(v, 'EdgeParasiticView')
  )
}

type Box = { view: NodeView; left: number; top: number; right: number; bottom: number }

function align(id: string, label: string, min: number, compute: (boxes: Box[]) => Array<[NodeView, Partial<Record<'left' | 'top' | 'width' | 'height', number>>]>): CommandDefinition {
  return {
    id,
    label,
    isEnabled: () => alignableNodes().length >= min,
    run: () => {
      const boxes = alignableNodes().map((v) => ({
        view: v,
        left: v.left,
        top: v.top,
        right: v.left + v.width,
        bottom: v.top + v.height
      }))
      if (boxes.length < min) return
      const engine = ps().engine
      engine.transact(label, () => {
        for (const [view, bounds] of compute(boxes)) setViewBounds(engine, view, bounds)
      })
    }
  }
}

function spaceEqually(boxes: Box[], axis: 'x' | 'y'): Array<[NodeView, { left?: number; top?: number }]> {
  const start = axis === 'x' ? 'left' : 'top'
  const end = axis === 'x' ? 'right' : 'bottom'
  const sorted = [...boxes].sort((a, b) => a[start] - b[start])
  const first = sorted[0] as Box
  const last = sorted[sorted.length - 1] as Box
  const total = sorted.reduce((sum, b) => sum + (b[end] - b[start]), 0)
  const gap = (last[end] - first[start] - total) / (sorted.length - 1)
  let pos = first[start]
  return sorted.map((b) => {
    const at = Math.round(pos)
    pos += b[end] - b[start] + gap
    return [b.view, { [start]: at }]
  })
}

function zOrder(id: string, label: string, toFront: boolean): CommandDefinition {
  return {
    id,
    label,
    isEnabled: () => alignableNodes().length > 0,
    run: () => {
      const views = alignableNodes()
      const engine = ps().engine
      engine.transact(label, () => {
        for (const v of toFront ? views : [...views].reverse()) {
          const owned = (v._parent as Elem)['ownedViews'] as View[]
          reorderElement(engine, v, toFront ? owned.length - 1 : 0)
        }
      })
    }
  }
}

// ---------------------------------------------------------------------------------------------

function closeDiagrams(keep: (id: string) => boolean): void {
  for (const id of ps().openDiagramIds) if (!keep(id)) ps().closeDiagram(id)
}

function cycleDiagram(step: number): void {
  const { openDiagramIds, activeDiagramId } = ps()
  if (openDiagramIds.length === 0) return
  const index = activeDiagramId ? openDiagramIds.indexOf(activeDiagramId) : -1
  const next = openDiagramIds[(index + step + openDiagramIds.length) % openDiagramIds.length]
  if (next) ps().setActiveDiagram(next)
}

function zoomBy(delta: number | null): void {
  const id = ps().activeDiagramId
  if (!id) return
  ui().setZoom(id, delta === null ? 1 : ui().zoomOf(id) + delta)
}

function panelToggle(id: string, label: string, panel: ToggleablePanel): CommandDefinition {
  return {
    id,
    label: `Toggle ${label}`,
    isChecked: () => ui().isPanelVisible(panel),
    run: () => ui().togglePanel(panel)
  }
}

function moveSelected(step: number): void {
  const el = singleSelectedModel()
  const c = el ? ps().repository.containmentOf(el) : null
  if (!el || !c || c.index < 0) return
  const list = c.owner[c.field] as Elem[]
  const index = c.index + step
  if (index < 0 || index >= list.length) return
  reorderElement(ps().engine, el, index)
}

function canMove(step: number): boolean {
  const el = singleSelectedModel()
  const c = el ? ps().repository.containmentOf(el) : null
  if (!el || !c || c.index < 0) return false
  const index = c.index + step
  return index >= 0 && index < (c.owner[c.field] as Elem[]).length
}

function selectInDiagram(): void {
  const model = singleSelectedModel() ?? selectedModels(ps())[0]
  if (!model) return
  const repo = ps().repository
  const views = repo.viewsOf(model).filter((v) => v.visible !== false && repo.diagramOf(v))
  if (views.length === 0) {
    ui().toast('No diagrams to show')
    return
  }
  const active = ps().activeDiagramId
  const view = views.find((v) => repo.diagramOf(v)?._id === active) ?? (views[0] as View)
  const diagram = repo.diagramOf(view)
  if (!diagram) return
  ps().openDiagram(diagram._id)
  ps().select({ views: [view._id] })
}

export function confirmAndDeleteFromModel(elements: readonly Elem[]): Promise<void> {
  const deletable = elements.filter((e) => !isKindOf(e, 'Project'))
  if (deletable.length === 0) return Promise.resolve()
  const run = (): void => {
    const engine = ps().engine
    // IDEF0 arrows and ports follow the diagram's deletion rules (branches, linked boundary arrows).
    engine.transact('Delete', () => {
      const rest = deleteIdef0Elements(engine, deletable, getTextMeasurer())
      if (rest.length > 0) deleteFromModel(engine, rest)
    })
  }
  if (!bridge) {
    if (window.confirm(`Delete ${deletable.length} element(s) from the model?`)) run()
    return Promise.resolve()
  }
  const names = deletable
    .slice(0, 5)
    .map((e) => (typeof e['name'] === 'string' && e['name'] ? e['name'] : `(${e._type.replace(/^UML/, '')})`))
    .join(', ')
  return bridge
    .showMessageBox({
      type: 'warning',
      message: `Delete ${deletable.length === 1 ? names : `${deletable.length} elements`} from the model?`,
      detail: 'Their views are removed from every diagram. You can undo this.',
      buttons: ['Delete', 'Cancel']
    })
    .then((choice) => {
      if (choice === 0) run()
    })
}

function about(): void {
  const message = 'OpenUML'
  const detail =
    'An open-source UML modeling tool.\nIndependent project, not affiliated with any other UML tool vendor.\nLicensed under the MIT License.'
  if (bridge) void bridge.showMessageBox({ type: 'info', message, detail, buttons: ['OK'] })
  else window.alert(`${message}\n\n${detail}`)
}

/** Registers the shell commands into `registry`, skipping ids that are already registered. */
export function registerAppCommands(registry: CommandRegistry): void {
  const add = (def: CommandDefinition): void => {
    if (!registry.has(def.id)) registry.register(def)
  }
  const hasDiagram = (): boolean => ps().activeDiagramId !== null

  // File
  add({ id: Cmd.fileNew, label: 'New', run: () => newProject() })
  add({ id: Cmd.fileOpen, label: 'Open...', run: () => openProjectDialog(), isEnabled: () => bridge !== null })
  add({
    id: Cmd.fileOpenRecent,
    label: 'Open Recent',
    run: (path) => (typeof path === 'string' ? openProjectPath(path) : undefined),
    isEnabled: () => bridge !== null
  })
  add({ id: Cmd.fileClearRecent, label: 'Clear Recent', run: () => ui().clearRecent(), isEnabled: () => ui().recentFiles.length > 0 })
  add({ id: Cmd.fileSave, label: 'Save', run: () => saveProject(), isEnabled: () => bridge !== null })
  add({ id: Cmd.fileSaveAs, label: 'Save As...', run: () => saveProjectAs(), isEnabled: () => bridge !== null })
  add({ id: Cmd.fileClose, label: 'Close', run: () => closeWindow() })
  add({ id: Cmd.fileExportPng, label: 'Export Diagram as PNG...', run: () => exportDiagram('png'), isEnabled: () => hasDiagram() && bridge !== null })
  add({ id: Cmd.fileExportSvg, label: 'Export Diagram as SVG...', run: () => exportDiagram('svg'), isEnabled: () => hasDiagram() && bridge !== null })
  add({
    id: Cmd.fileExportAllPng,
    label: 'Export All Diagrams to PNGs...',
    run: () => exportAllDiagrams('png'),
    isEnabled: () => bridge !== null && ps().repository.diagrams().length > 0
  })
  add({
    id: Cmd.fileExportAllSvg,
    label: 'Export All Diagrams to SVGs...',
    run: () => exportAllDiagrams('svg'),
    isEnabled: () => bridge !== null && ps().repository.diagrams().length > 0
  })
  add({ id: Cmd.appPreferences, label: 'Preferences...', run: () => ui().openModal({ kind: 'preferences' }) })

  // Edit
  add({ id: Cmd.editMoveUp, label: 'Move Up', run: () => moveSelected(-1), isEnabled: () => canMove(-1) })
  add({ id: Cmd.editMoveDown, label: 'Move Down', run: () => moveSelected(1), isEnabled: () => canMove(1) })
  add({
    id: Cmd.editSelectAll,
    label: 'Select All',
    isEnabled: hasDiagram,
    run: () => {
      const d = activeDiagram(ps())
      if (d) ps().select({ views: d.ownedViews.filter((v) => v.visible !== false).map((v) => v._id) })
    }
  })
  add({
    id: Cmd.editSelectInExplorer,
    label: 'Select in Explorer',
    isEnabled: () => selectedModels(ps()).length > 0,
    run: () => {
      const model = selectedModels(ps())[0]
      if (model) selectInExplorer(model)
    }
  })
  add({ id: Cmd.editSelectInDiagram, label: 'Select in Diagram', isEnabled: () => selectedModels(ps()).length > 0, run: selectInDiagram })
  add({
    id: Cmd.editRename,
    label: 'Rename',
    isEnabled: () => singleSelectedModel() !== null && ps().selectedElementIds.length === 1,
    run: () => {
      const el = singleSelectedModel()
      if (el) {
        selectInExplorer(el)
        ui().startRename(el._id)
      }
    }
  })

  // Format (fallbacks; the diagram module may provide richer versions)
  add(lineStyle(Cmd.formatLineRectilinear, 'Rectilinear', 0))
  add(lineStyle(Cmd.formatLineOblique, 'Oblique', 1))
  add(lineStyle(Cmd.formatLineRoundRect, 'Rounded Rectilinear', 2))
  add(lineStyle(Cmd.formatLineCurve, 'Curve', 3))
  add(toggleViewFlag(Cmd.formatAutoResize, 'Auto Resize', 'autoResize'))
  add(toggleViewFlag(Cmd.formatShowShadow, 'Show Shadow', 'showShadow'))
  add(toggleViewFlag(Cmd.formatWordWrap, 'Word Wrap', 'wordWrap'))
  add(toggleViewFlag(Cmd.formatShowVisibility, 'Show Visibility', 'showVisibility'))
  add(toggleViewFlag(Cmd.formatShowType, 'Show Type', 'showType'))
  add(toggleViewFlag(Cmd.formatShowMultiplicity, 'Show Multiplicity', 'showMultiplicity'))
  add(toggleViewFlag(Cmd.formatShowOperationSignature, 'Show Operation Signature', 'showOperationSignature'))
  add(toggleViewFlag(Cmd.formatSuppressAttributes, 'Suppress Attributes', 'suppressAttributes'))
  add(toggleViewFlag(Cmd.formatSuppressOperations, 'Suppress Operations', 'suppressOperations'))
  add(toggleViewFlag(Cmd.formatSuppressLiterals, 'Suppress Literals', 'suppressLiterals'))

  // Alignment (fallbacks)
  add(align(Cmd.alignLeft, 'Align Left', 2, (bs) => bs.map((b) => [b.view, { left: Math.min(...bs.map((x) => x.left)) }])))
  add(align(Cmd.alignRight, 'Align Right', 2, (bs) => {
    const right = Math.max(...bs.map((x) => x.right))
    return bs.map((b) => [b.view, { left: right - b.view.width }])
  }))
  add(align(Cmd.alignCenter, 'Align Center', 2, (bs) => {
    const mid = (Math.min(...bs.map((x) => x.left)) + Math.max(...bs.map((x) => x.right))) / 2
    return bs.map((b) => [b.view, { left: Math.round(mid - b.view.width / 2) }])
  }))
  add(align(Cmd.alignTop, 'Align Top', 2, (bs) => bs.map((b) => [b.view, { top: Math.min(...bs.map((x) => x.top)) }])))
  add(align(Cmd.alignBottom, 'Align Bottom', 2, (bs) => {
    const bottom = Math.max(...bs.map((x) => x.bottom))
    return bs.map((b) => [b.view, { top: bottom - b.view.height }])
  }))
  add(align(Cmd.alignMiddle, 'Align Middle', 2, (bs) => {
    const mid = (Math.min(...bs.map((x) => x.top)) + Math.max(...bs.map((x) => x.bottom))) / 2
    return bs.map((b) => [b.view, { top: Math.round(mid - b.view.height / 2) }])
  }))
  add(align(Cmd.alignSpaceHorizontally, 'Space Equally Horizontally', 3, (bs) => spaceEqually(bs, 'x')))
  add(align(Cmd.alignSpaceVertically, 'Space Equally Vertically', 3, (bs) => spaceEqually(bs, 'y')))
  add(align(Cmd.alignSameWidth, 'Set Width Equally', 2, (bs) => {
    const width = Math.max(...bs.map((x) => x.view.width))
    return bs.map((b) => [b.view, { width }])
  }))
  add(align(Cmd.alignSameHeight, 'Set Height Equally', 2, (bs) => {
    const height = Math.max(...bs.map((x) => x.view.height))
    return bs.map((b) => [b.view, { height }])
  }))
  add(align(Cmd.alignSameSize, 'Set Size Equally', 2, (bs) => {
    const width = Math.max(...bs.map((x) => x.view.width))
    const height = Math.max(...bs.map((x) => x.view.height))
    return bs.map((b) => [b.view, { width, height }])
  }))
  add(zOrder(Cmd.alignSendToBack, 'Send to Back', false))
  add(zOrder(Cmd.alignBringToFront, 'Bring to Front', true))

  // Model
  add({
    id: Cmd.modelAddDiagram,
    label: 'Add Diagram',
    run: (arg) => {
      const kind = (arg as { kind?: DiagramKind } | undefined)?.kind ?? 'ClassDiagram'
      if (!ADD_DIAGRAM_ITEMS.some((i) => i.kind === kind)) return
      const diagram = addDiagram(ps().engine, selectedParent(), kind)
      openDiagram(diagram)
    }
  })
  add({
    id: Cmd.modelAdd,
    label: 'Add Element',
    run: (arg) => {
      const item = ADD_ITEMS.find((i) => i.id === (arg as { id?: string } | undefined)?.id)
      if (!item) return
      const parent = selectedParent()
      if (!item.accepts(parent)) throw new Error(`${item.label} cannot be placed here.`)
      const el = addModelElement(ps().engine, parent, item)
      selectInExplorer(el)
    }
  })

  // View
  add({ id: Cmd.viewCommandPalette, label: 'Command Palette...', run: () => ui().openModal({ kind: 'palette' }) })
  add({
    id: Cmd.viewCloseDiagram,
    label: 'Close Diagram',
    isEnabled: hasDiagram,
    run: (arg) => {
      const id = (arg as { id?: string } | undefined)?.id ?? ps().activeDiagramId
      if (id) ps().closeDiagram(id)
    }
  })
  add({
    id: Cmd.viewCloseOtherDiagrams,
    label: 'Close Other Diagrams',
    isEnabled: () => ps().openDiagramIds.length > 1,
    run: (arg) => {
      const keep = (arg as { id?: string } | undefined)?.id ?? ps().activeDiagramId
      closeDiagrams((id) => id === keep)
      if (keep) ps().setActiveDiagram(keep)
    }
  })
  add({ id: Cmd.viewCloseAllDiagrams, label: 'Close All Diagrams', isEnabled: () => ps().openDiagramIds.length > 0, run: () => closeDiagrams(() => false) })
  add({ id: Cmd.viewNextDiagram, label: 'Next Diagram', isEnabled: () => ps().openDiagramIds.length > 1, run: () => cycleDiagram(1) })
  add({ id: Cmd.viewPreviousDiagram, label: 'Previous Diagram', isEnabled: () => ps().openDiagramIds.length > 1, run: () => cycleDiagram(-1) })
  add({
    id: Cmd.viewRenameDiagram,
    label: 'Rename Diagram...',
    isEnabled: hasDiagram,
    run: async (arg) => {
      const id = (arg as { id?: string } | undefined)?.id ?? ps().activeDiagramId
      const d = ps().repository.get(id)
      if (!isKindOf(d, 'Diagram')) return
      const name = await promptText('Rename Diagram', d.name)
      if (name !== null && name !== d.name) setFieldsOfAll(ps().engine, [d], { name }, 'Rename')
    }
  })
  add({ id: Cmd.viewZoomIn, label: 'Zoom In', isEnabled: hasDiagram, run: () => zoomBy(ZOOM_STEP) })
  add({ id: Cmd.viewZoomOut, label: 'Zoom Out', isEnabled: hasDiagram, run: () => zoomBy(-ZOOM_STEP) })
  add({ id: Cmd.viewActualSize, label: 'Actual Size', isEnabled: hasDiagram, run: () => zoomBy(null) })
  add({
    id: Cmd.viewShowGrid,
    label: 'Show Grid',
    isChecked: () => ui().prefs.showGrid,
    run: () => ui().setPrefs({ showGrid: !ui().prefs.showGrid })
  })
  add({
    id: Cmd.viewSnapToGrid,
    label: 'Snap to Grid',
    isChecked: () => ui().prefs.snapToGrid,
    run: () => ui().setPrefs({ snapToGrid: !ui().prefs.snapToGrid })
  })
  add(panelToggle(Cmd.viewSidebar, 'Sidebar', 'sidebar'))
  add(panelToggle(Cmd.viewNavigator, 'Navigator', 'navigator'))
  add(panelToggle(Cmd.viewToolbar, 'Toolbar', 'toolbar'))
  add(panelToggle(Cmd.viewStatusbar, 'Status Bar', 'statusbar'))
  add(panelToggle(Cmd.viewToolbox, 'Toolbox', 'toolbox'))
  add(panelToggle(Cmd.viewEditors, 'Editors', 'editors'))
  add(panelToggle(Cmd.viewModelExplorer, 'Model Explorer', 'explorer'))
  add(panelToggle(Cmd.viewWorkingDiagrams, 'Working Diagrams', 'workingDiagrams'))
  add(panelToggle(Cmd.viewStyles, 'Styles', 'styles'))
  add(panelToggle(Cmd.viewProperties, 'Properties', 'properties'))
  add(panelToggle(Cmd.viewDocumentation, 'Documentation', 'documentation'))
  add({ id: Cmd.viewResetLayout, label: 'Reset Layout', run: () => ui().resetLayout() })

  // Explorer
  add({ id: Cmd.explorerSortByAdded, label: 'Sort by Added', isChecked: () => ui().sortBy === 'added', run: () => ui().setSortBy('added') })
  add({ id: Cmd.explorerSortByName, label: 'Sort by Name', isChecked: () => ui().sortBy === 'name', run: () => ui().setSortBy('name') })
  add({
    id: Cmd.explorerShowStereotype,
    label: 'Show Stereotype Text',
    isChecked: () => ui().showStereotype,
    run: () => ui().setShowStereotype(!ui().showStereotype)
  })
  add({
    id: Cmd.explorerExpandAll,
    label: 'Expand All',
    run: () => {
      ui().expandMany(expandableIds(ps().project))
      ui().setFoldersCollapsed(arrowFolderKeys(ps().project), false)
    }
  })
  add({ id: Cmd.explorerCollapseAll, label: 'Collapse All', run: () => ui().collapseAll() })
  add({
    id: Cmd.explorerGroupArrows,
    label: 'Group Arrows by Role',
    isChecked: () => ui().groupArrows,
    run: () => ui().setGroupArrows(!ui().groupArrows)
  })
  add({
    id: Cmd.explorerExpandArrowFolders,
    label: 'Expand All Arrow Folders',
    isEnabled: () => ui().groupArrows,
    run: () => ui().setFoldersCollapsed(arrowFolderKeys(ps().project), false)
  })
  add({
    id: Cmd.explorerCollapseArrowFolders,
    label: 'Collapse All Arrow Folders',
    isEnabled: () => ui().groupArrows,
    run: () => ui().setFoldersCollapsed(arrowFolderKeys(ps().project), true)
  })

  // Toolbox
  add({
    id: Cmd.toolSelect,
    label: 'Select Tool',
    run: () => {
      if (ui().contextMenu) ui().openContextMenu(null)
      ui().setTool(null)
    }
  })

  // Help
  add({ id: Cmd.helpAbout, label: 'About OpenUML', run: about })
  add({
    id: Cmd.helpDocumentation,
    label: 'Documentation...',
    run: () => bridge?.openExternal(`${PROJECT_URL}#readme`),
    isEnabled: () => bridge !== null
  })
  add({
    id: Cmd.helpReportIssue,
    label: 'Report an Issue...',
    run: () => bridge?.openExternal(`${PROJECT_URL}/issues`),
    isEnabled: () => bridge !== null
  })
}
