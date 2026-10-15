/**
 * Command ids used by the application shell. They follow the menu ids of the shell spec
 * (`<menu>.<item>`), extending the core `CommandIds` of `commands/`.
 */
import { CommandIds } from '../../commands'

export const Cmd = {
  ...CommandIds,
  // File
  fileOpenRecent: 'file.open-recent',
  fileOpenExample: 'file.open-example',
  fileClearRecent: 'file.clear-recent',
  fileExportPng: 'file.export-diagram-as.png',
  fileExportSvg: 'file.export-diagram-as.svg',
  fileExportAllPng: 'file.export-diagram-as.all-to-pngs',
  fileExportAllSvg: 'file.export-diagram-as.all-to-svgs',
  appPreferences: 'app.preferences',
  helpAbout: 'help.about',
  helpDocumentation: 'help.documentation',
  helpReportIssue: 'help.report-issue',
  helpCheckForUpdates: 'help.check-for-updates',
  helpDownloadUpdate: 'help.download-update',
  // Edit
  editCut: 'edit.cut',
  editCopy: 'edit.copy',
  editPaste: 'edit.paste',
  editMoveUp: 'edit.move-up',
  editMoveDown: 'edit.move-down',
  editSelectInExplorer: 'edit.select-in-explorer',
  editSelectInDiagram: 'edit.select-in-diagram',
  editHighlight: 'edit.highlight',
  editRename: 'edit.rename',
  // Format
  formatLineRectilinear: 'format.linestyle.rectilinear',
  formatLineOblique: 'format.linestyle.oblique',
  formatLineRoundRect: 'format.linestyle.roundrect',
  formatLineCurve: 'format.linestyle.curve',
  formatAutoResize: 'format.auto-resize',
  formatShowShadow: 'format.show-shadow',
  formatWordWrap: 'format.word-wrap',
  formatShowVisibility: 'format.show-visibility',
  formatShowType: 'format.show-type',
  formatShowMultiplicity: 'format.show-multiplicity',
  formatShowOperationSignature: 'format.show-operation-signature',
  formatSuppressAttributes: 'format.suppress-attributes',
  formatSuppressOperations: 'format.suppress-operations',
  formatSuppressLiterals: 'format.suppress-literals',
  // Alignment
  alignLeft: 'alignment.align-left',
  alignCenter: 'alignment.align-center',
  alignRight: 'alignment.align-right',
  alignTop: 'alignment.align-top',
  alignMiddle: 'alignment.align-middle',
  alignBottom: 'alignment.align-bottom',
  alignSpaceHorizontally: 'alignment.space-equally-horizontally',
  alignSpaceVertically: 'alignment.space-equally-vertically',
  alignSameWidth: 'alignment.set-width-equally',
  alignSameHeight: 'alignment.set-height-equally',
  alignSameSize: 'alignment.set-size-equally',
  alignMakeSameSize: 'alignment.make-same-size',
  alignSendToBack: 'alignment.send-to-back',
  alignBringToFront: 'alignment.bring-to-front',
  // Model
  modelAddDiagram: 'model.add-diagram',
  modelAdd: 'model.add',
  // View
  viewCommandPalette: 'view.command-palette',
  viewCloseDiagram: 'view.close-diagram',
  viewCloseOtherDiagrams: 'view.close-other-diagrams',
  viewCloseAllDiagrams: 'view.close-all-diagrams',
  viewNextDiagram: 'view.next-diagram',
  viewPreviousDiagram: 'view.previous-diagram',
  viewRenameDiagram: 'view.rename-diagram',
  viewZoomIn: 'view.zoom-in',
  viewZoomOut: 'view.zoom-out',
  viewActualSize: 'view.actual-size',
  viewFitToWindow: 'view.fit-to-window',
  viewShowGrid: 'view.show-grid',
  viewSnapToGrid: 'view.snap-to-grid',
  viewSidebar: 'view.sidebar',
  viewNavigator: 'view.navigator',
  viewToolbar: 'view.toolbar',
  viewStatusbar: 'view.statusbar',
  viewToolbox: 'view.toolbox',
  viewEditors: 'view.editors',
  viewModelExplorer: 'view.model-explorer',
  viewWorkingDiagrams: 'view.working-diagrams',
  viewStyles: 'view.styles',
  viewProperties: 'view.properties',
  viewDocumentation: 'view.documentation',
  viewResetLayout: 'view.reset-layout',
  // Explorer
  explorerSortByAdded: 'explorer.sort-by-added',
  explorerSortByName: 'explorer.sort-by-name',
  explorerShowStereotype: 'explorer.show-stereotype-text',
  explorerExpandAll: 'explorer.expand-all',
  explorerCollapseAll: 'explorer.collapse-all',
  explorerGroupArrows: 'explorer.group-arrows-by-role',
  explorerCollapseArrowFolders: 'explorer.collapse-arrow-folders',
  explorerExpandArrowFolders: 'explorer.expand-arrow-folders',
  // Toolbox
  toolSelect: 'tool.select'
} as const

/** Edit commands that act on a focused text field natively instead of on the model. */
export const NATIVE_EDIT_COMMANDS: Readonly<Record<string, 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'>> = {
  [Cmd.editUndo]: 'undo',
  [Cmd.editRedo]: 'redo',
  [Cmd.editCut]: 'cut',
  [Cmd.editCopy]: 'copy',
  [Cmd.editPaste]: 'paste',
  [Cmd.editSelectAll]: 'selectAll'
}

/** Commands that need arguments or only make sense from a specific widget: hidden from the palette. */
export const PALETTE_HIDDEN = new Set<string>([
  Cmd.fileOpenRecent,
  Cmd.fileOpenExample,
  Cmd.modelAdd,
  Cmd.modelAddDiagram,
  Cmd.editRename,
  Cmd.viewCommandPalette
])

/** Palette category from the id prefix. */
export function commandCategory(id: string): string {
  const prefix = id.split(/[.:]/)[0] ?? ''
  const names: Record<string, string> = {
    file: 'File',
    app: 'Application',
    edit: 'Edit',
    format: 'Format',
    alignment: 'Alignment',
    model: 'Model',
    view: 'View',
    explorer: 'Explorer',
    help: 'Help',
    tool: 'Toolbox'
  }
  return names[prefix] ?? (prefix ? prefix[0]!.toUpperCase() + prefix.slice(1) : '')
}
