/**
 * The application menu (MVP items of the shell spec) and the in-app context menus, as data.
 * Visibility of Add items follows the selected element; enablement and check marks come from
 * the command registry when the tree is resolved.
 */
import { projectStore, selectedModels } from '../../store'
import type { Platform } from '../keymap'
import { addDiagramItemsFor, addItemsFor } from '../modelActions'
import { baseName } from '../recentFiles'
import { EXAMPLES } from '../examples'
import { uiStore } from '../uiStore'
import { Cmd } from './commandIds'
import { endMultiplicityMenu } from '../app/associationEnds'
import { idef0FormatMenu, idef0Menu } from './idef0Menu'
import type { MenuNode } from './menuModel'

const SEP: MenuNode = { separator: true }
const ps = () => projectStore.getState()

function parent() {
  return selectedModels(ps())[0] ?? ps().project
}

function addDiagramMenu(): MenuNode {
  return {
    id: 'model.add-diagram',
    label: 'Add Diagram',
    placeholder: '(nothing to add here)',
    submenu: () =>
      addDiagramItemsFor(parent()).map((item) => ({
        id: `uml.${item.kind}`,
        label: item.label,
        command: Cmd.modelAddDiagram,
        args: { kind: item.kind }
      }))
  }
}

function addElementMenu(): MenuNode {
  return {
    id: 'model.add',
    label: 'Add',
    placeholder: '(nothing to add here)',
    submenu: () =>
      addItemsFor(parent()).map((item) => ({
        id: `uml.${item.id}`,
        label: item.label,
        command: Cmd.modelAdd,
        args: { id: item.id }
      }))
  }
}

function undoLabel(): string {
  const name = ps().undoName
  return name ? `Undo ${name}` : 'Undo'
}

function redoLabel(): string {
  const name = ps().redoName
  return name ? `Redo ${name}` : 'Redo'
}

function recentMenu(): MenuNode {
  return {
    id: 'file.open-recent',
    label: 'Open Recent',
    submenu: () => {
      const recent = uiStore.getState().recentFiles
      const items: MenuNode[] = recent.map((path, i) => ({
        id: `file.open-recent.${i}`,
        label: `${baseName(path)}  —  ${path}`,
        command: Cmd.fileOpenRecent,
        args: path
      }))
      if (items.length === 0) items.push({ label: '(no recent files)', enabled: () => false })
      return [...items, SEP, { id: 'file.clear-recent', label: 'Clear Recent', command: Cmd.fileClearRecent }]
    }
  }
}

function examplesMenu(): MenuNode {
  return {
    id: 'file.open-example',
    label: 'Open Example',
    submenu: EXAMPLES.map((e) => ({ id: `file.open-example.${e.id}`, label: e.label, command: Cmd.fileOpenExample, args: e.id }))
  }
}

function lineStyleMenu(): MenuNode {
  return {
    id: 'format.linestyle',
    label: 'Line Style',
    submenu: [
      { label: 'Rectilinear', command: Cmd.formatLineRectilinear, checkbox: true },
      { label: 'Oblique', command: Cmd.formatLineOblique, checkbox: true },
      { label: 'Rounded Rectilinear', command: Cmd.formatLineRoundRect, checkbox: true },
      { label: 'Curve', command: Cmd.formatLineCurve, checkbox: true }
    ]
  }
}

function alignmentMenu(): MenuNode {
  return {
    id: 'format.alignment',
    label: 'Alignment',
    submenu: [
      { label: 'Align Left', command: Cmd.alignLeft },
      { label: 'Align Center', command: Cmd.alignCenter },
      { label: 'Align Right', command: Cmd.alignRight },
      SEP,
      { label: 'Align Top', command: Cmd.alignTop },
      { label: 'Align Middle', command: Cmd.alignMiddle },
      { label: 'Align Bottom', command: Cmd.alignBottom },
      SEP,
      { label: 'Space Equally Horizontally', command: Cmd.alignSpaceHorizontally },
      { label: 'Space Equally Vertically', command: Cmd.alignSpaceVertically },
      SEP,
      { label: 'Set Width Equally', command: Cmd.alignSameWidth },
      { label: 'Set Height Equally', command: Cmd.alignSameHeight },
      { label: 'Set Size Equally', command: Cmd.alignSameSize },
      { label: 'Make Same Size', command: Cmd.alignMakeSameSize },
      SEP,
      { label: 'Bring to Front', command: Cmd.alignBringToFront },
      { label: 'Send to Back', command: Cmd.alignSendToBack }
    ]
  }
}

function formatItems(): MenuNode[] {
  return [
    lineStyleMenu(),
    { label: 'Auto Resize', command: Cmd.formatAutoResize, checkbox: true },
    { label: 'Show Shadow', command: Cmd.formatShowShadow, checkbox: true },
    { label: 'Word Wrap', command: Cmd.formatWordWrap, checkbox: true },
    { label: 'Lock Position and Size', command: Cmd.formatLock, checkbox: true },
    SEP,
    { label: 'Show Visibility', command: Cmd.formatShowVisibility, checkbox: true },
    { label: 'Show Type', command: Cmd.formatShowType, checkbox: true },
    { label: 'Show Multiplicity', command: Cmd.formatShowMultiplicity, checkbox: true },
    { label: 'Show Operation Signature', command: Cmd.formatShowOperationSignature, checkbox: true },
    SEP,
    { label: 'Suppress Attributes', command: Cmd.formatSuppressAttributes, checkbox: true },
    { label: 'Suppress Operations', command: Cmd.formatSuppressOperations, checkbox: true },
    { label: 'Suppress Literals', command: Cmd.formatSuppressLiterals, checkbox: true },
    SEP,
    idef0FormatMenu(),
    alignmentMenu()
  ]
}

/** The full application menu for `platform`. */
export function buildAppMenu(platform: Platform): MenuNode[] {
  const mac = platform === 'darwin'
  const appMenu: MenuNode = {
    id: 'app',
    label: 'OpenUML',
    submenu: [
      { id: 'app.about', label: 'About OpenUML', command: Cmd.helpAbout },
      { id: 'app.check-for-updates', label: 'Check for Updates...', command: Cmd.helpCheckForUpdates },
      SEP,
      { id: 'app.preferences', label: 'Preferences...', command: Cmd.appPreferences },
      { id: 'app.keyboard-shortcuts', label: 'Keyboard Shortcuts...', command: Cmd.appKeyboardShortcuts },
      SEP,
      { label: 'Services', role: 'services' },
      SEP,
      { label: 'Hide OpenUML', role: 'hide' },
      { label: 'Hide Others', role: 'hideOthers' },
      { label: 'Show All', role: 'unhide' },
      SEP,
      { label: 'Quit OpenUML', role: 'quit' }
    ]
  }
  const file: MenuNode = {
    id: 'file',
    label: 'File',
    submenu: [
      { id: 'file.new', label: 'New', command: Cmd.fileNew },
      { id: 'file.open', label: 'Open...', command: Cmd.fileOpen },
      recentMenu(),
      examplesMenu(),
      { id: 'file.save', label: 'Save', command: Cmd.fileSave },
      { id: 'file.save-as', label: 'Save As...', command: Cmd.fileSaveAs },
      { id: 'file.close', label: 'Close', command: Cmd.fileClose },
      SEP,
      {
        id: 'file.export-diagram-as',
        label: 'Export Diagram As',
        submenu: [
          { label: 'PNG...', command: Cmd.fileExportPng },
          { label: 'SVG...', command: Cmd.fileExportSvg },
          { label: 'PDF...', command: Cmd.fileExportPdf },
          SEP,
          { label: 'All to PNGs...', command: Cmd.fileExportAllPng },
          { label: 'All to SVGs...', command: Cmd.fileExportAllSvg },
          { label: 'All to One PDF...', command: Cmd.fileExportAllPdf }
        ]
      },
      { id: 'file.export-interactive-website', label: 'Export Interactive Website...', command: Cmd.fileExportWebsite },
      ...(mac
        ? []
        : [
            SEP,
            { id: 'file.preferences', label: 'Preferences...', command: Cmd.appPreferences },
            { id: 'file.keyboard-shortcuts', label: 'Keyboard Shortcuts...', command: Cmd.appKeyboardShortcuts },
            SEP,
            { label: 'Exit', role: 'quit' }
          ])
    ]
  }
  const edit: MenuNode = {
    id: 'edit',
    label: 'Edit',
    submenu: [
      { id: 'edit.undo', label: undoLabel, command: Cmd.editUndo },
      { id: 'edit.redo', label: redoLabel, command: Cmd.editRedo },
      SEP,
      { id: 'edit.cut', label: 'Cut', command: Cmd.editCut },
      { id: 'edit.copy', label: 'Copy', command: Cmd.editCopy },
      { id: 'edit.paste', label: 'Paste', command: Cmd.editPaste },
      { id: 'edit.delete', label: 'Delete', command: Cmd.editDelete },
      { id: 'edit.delete-from-model', label: 'Delete from Model', command: Cmd.editDeleteFromModel },
      SEP,
      { id: 'edit.move-up', label: 'Move Up', command: Cmd.editMoveUp },
      { id: 'edit.move-down', label: 'Move Down', command: Cmd.editMoveDown },
      SEP,
      { id: 'edit.select-all', label: 'Select All', command: Cmd.editSelectAll },
      { id: 'edit.select-in-explorer', label: 'Select in Explorer', command: Cmd.editSelectInExplorer },
      { id: 'edit.select-in-diagram', label: 'Select in Diagram', command: Cmd.editSelectInDiagram },
      SEP,
      { id: 'edit.find', label: 'Find in Model Explorer', command: Cmd.explorerFind }
    ]
  }
  const format: MenuNode = { id: 'format', label: 'Format', submenu: formatItems }
  const model: MenuNode = { id: 'model', label: 'Model', submenu: () => [addDiagramMenu(), addElementMenu(), idef0Menu()] }
  const view: MenuNode = {
    id: 'view',
    label: 'View',
    submenu: [
      { id: 'view.command-palette', label: 'Command Palette...', command: Cmd.viewCommandPalette },
      SEP,
      { id: 'view.close-diagram', label: 'Close Diagram', command: Cmd.viewCloseDiagram },
      { id: 'view.close-other-diagrams', label: 'Close Other Diagrams', command: Cmd.viewCloseOtherDiagrams },
      { id: 'view.close-all-diagrams', label: 'Close All Diagrams', command: Cmd.viewCloseAllDiagrams },
      SEP,
      { id: 'view.next-diagram', label: 'Next Diagram', command: Cmd.viewNextDiagram },
      { id: 'view.previous-diagram', label: 'Previous Diagram', command: Cmd.viewPreviousDiagram },
      SEP,
      { id: 'view.zoom-in', label: 'Zoom In', command: Cmd.viewZoomIn },
      { id: 'view.zoom-out', label: 'Zoom Out', command: Cmd.viewZoomOut },
      { id: 'view.actual-size', label: 'Actual Size', command: Cmd.viewActualSize },
      { id: 'view.fit-to-window', label: 'Fit to Window', command: Cmd.viewFitToWindow },
      SEP,
      { id: 'view.show-grid', label: 'Show Grid', command: Cmd.viewShowGrid, checkbox: true },
      { id: 'view.snap-to-grid', label: 'Snap to Grid', command: Cmd.viewSnapToGrid, checkbox: true },
      SEP,
      { id: 'view.sidebar', label: 'Sidebar', command: Cmd.viewSidebar, checkbox: true },
      { id: 'view.navigator', label: 'Navigator', command: Cmd.viewNavigator, checkbox: true },
      { id: 'view.toolbar', label: 'Toolbar', command: Cmd.viewToolbar, checkbox: true },
      { id: 'view.statusbar', label: 'Status Bar', command: Cmd.viewStatusbar, checkbox: true },
      { id: 'view.toolbox', label: 'Toolbox', command: Cmd.viewToolbox, checkbox: true },
      { id: 'view.editors', label: 'Editors', command: Cmd.viewEditors, checkbox: true },
      {
        id: 'view.panels',
        label: 'Panels',
        submenu: [
          { id: 'view.model-explorer', label: 'Model Explorer', command: Cmd.viewModelExplorer, checkbox: true },
          { id: 'view.working-diagrams', label: 'Working Diagrams', command: Cmd.viewWorkingDiagrams, checkbox: true },
          { id: 'view.styles', label: 'Styles', command: Cmd.viewStyles, checkbox: true },
          { id: 'view.properties', label: 'Properties', command: Cmd.viewProperties, checkbox: true },
          { id: 'view.documentation', label: 'Documentation', command: Cmd.viewDocumentation, checkbox: true }
        ]
      },
      SEP,
      { id: 'view.reset-layout', label: 'Reset Layout', command: Cmd.viewResetLayout }
    ]
  }
  const windowMenu: MenuNode = {
    id: 'window',
    label: 'Window',
    submenu: mac
      ? [
          { label: 'Minimize', role: 'minimize' },
          { label: 'Zoom', role: 'zoom' },
          { label: 'Enter Full Screen', role: 'togglefullscreen' },
          SEP,
          { label: 'Bring All to Front', role: 'front' },
          SEP,
          { label: 'Close Window', role: 'close' }
        ]
      : [
          { label: 'Minimize', role: 'minimize' },
          { label: 'Full Screen', role: 'togglefullscreen' }
        ]
  }
  const help: MenuNode = {
    id: 'help',
    label: 'Help',
    submenu: [
      { id: 'help.documentation', label: 'Documentation...', command: Cmd.helpDocumentation },
      { id: 'help.report-issue', label: 'Report an Issue...', command: Cmd.helpReportIssue },
      ...(mac
        ? []
        : [
            SEP,
            { id: 'help.check-for-updates', label: 'Check for Updates...', command: Cmd.helpCheckForUpdates },
            { id: 'help.about', label: 'About OpenUML', command: Cmd.helpAbout }
          ])
    ]
  }
  return [...(mac ? [appMenu] : []), file, edit, format, model, view, windowMenu, help]
}

// ---------------------------------------------------------------------------------------------
// Context menus (in-app)

export function explorerContextMenu(): MenuNode[] {
  return [
    addDiagramMenu(),
    addElementMenu(),
    SEP,
    { label: 'Cut', command: Cmd.editCut },
    { label: 'Copy', command: Cmd.editCopy },
    { label: 'Paste', command: Cmd.editPaste },
    { label: 'Rename', command: Cmd.editRename },
    { label: 'Delete from Model', command: Cmd.editDeleteFromModel },
    SEP,
    { label: 'Move Up', command: Cmd.editMoveUp },
    { label: 'Move Down', command: Cmd.editMoveDown },
    SEP,
    { label: 'Highlight', command: Cmd.editHighlight },
    { label: 'Select in Diagram', command: Cmd.editSelectInDiagram }
  ]
}

export function explorerSettingsMenu(): MenuNode[] {
  return [
    { label: 'Sort by Added', command: Cmd.explorerSortByAdded, checkbox: true },
    { label: 'Sort by Name', command: Cmd.explorerSortByName, checkbox: true },
    SEP,
    { label: 'Show Stereotype Text', command: Cmd.explorerShowStereotype, checkbox: true },
    { label: 'Group Arrows by Role', command: Cmd.explorerGroupArrows, checkbox: true },
    SEP,
    { label: 'Expand All', command: Cmd.explorerExpandAll },
    { label: 'Collapse All', command: Cmd.explorerCollapseAll },
    { label: 'Expand All Arrow Folders', command: Cmd.explorerExpandArrowFolders },
    { label: 'Collapse All Arrow Folders', command: Cmd.explorerCollapseArrowFolders }
  ]
}

export function workingDiagramsContextMenu(targetId: string | undefined): MenuNode[] {
  const args = targetId ? { id: targetId } : undefined
  return [
    { label: 'Close Diagram', command: Cmd.viewCloseDiagram, args },
    { label: 'Close Other Diagrams', command: Cmd.viewCloseOtherDiagrams, args },
    { label: 'Close All Diagrams', command: Cmd.viewCloseAllDiagrams },
    SEP,
    { label: 'Rename...', command: Cmd.viewRenameDiagram, args }
  ]
}

export function canvasContextMenu(): MenuNode[] {
  const ends = endMultiplicityMenu()
  return [
    ...(ends.length > 0 ? [...ends, SEP] : []),
    addElementMenu(),
    addDiagramMenu(),
    idef0Menu({ withSheetSize: true }),
    SEP,
    { label: 'Format', submenu: formatItems },
    SEP,
    { label: 'Cut', command: Cmd.editCut },
    { label: 'Copy', command: Cmd.editCopy },
    { label: 'Paste', command: Cmd.editPaste },
    { label: 'Select All', command: Cmd.editSelectAll },
    { label: 'Delete', command: Cmd.editDelete },
    { label: 'Delete from Model', command: Cmd.editDeleteFromModel },
    SEP,
    { label: 'Select in Explorer', command: Cmd.editSelectInExplorer },
    { label: 'Select in Diagram', command: Cmd.editSelectInDiagram }
  ]
}
