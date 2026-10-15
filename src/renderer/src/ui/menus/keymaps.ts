/** Default key bindings (portable `cmdctrl` token; per-platform entries where they differ). */
import type { KeyBinding } from '../keymap'
import { Cmd } from './commandIds'

const MAC = ['darwin']

/** Context key of the keyboard dispatcher: a toolbox tool other than Select is active. */
export const WHEN_TOOL_ACTIVE = 'toolActive'
const OTHERS = ['win32', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix']

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  // File
  { key: 'cmdctrl-n', command: Cmd.fileNew },
  { key: 'cmdctrl-o', command: Cmd.fileOpen },
  { key: 'cmdctrl-s', command: Cmd.fileSave },
  { key: 'cmdctrl-shift-s', command: Cmd.fileSaveAs },
  { key: 'cmd-,', command: Cmd.appPreferences, platforms: MAC },
  // Edit
  { key: 'cmdctrl-z', command: Cmd.editUndo },
  // Redo shows (and is registered natively as) ⇧⌘Z on macOS, Ctrl+Y elsewhere.
  { key: 'cmd-shift-z', command: Cmd.editRedo, platforms: MAC },
  { key: 'cmdctrl-y', command: Cmd.editRedo },
  { key: 'cmdctrl-shift-z', command: Cmd.editRedo },
  { key: 'cmdctrl-x', command: Cmd.editCut },
  { key: 'cmdctrl-c', command: Cmd.editCopy },
  { key: 'cmdctrl-v', command: Cmd.editPaste },
  { key: 'delete', command: Cmd.editDelete },
  { key: 'backspace', command: Cmd.editDelete, platforms: MAC },
  { key: 'cmdctrl-delete', command: Cmd.editDeleteFromModel, platforms: OTHERS },
  { key: 'cmd-backspace', command: Cmd.editDeleteFromModel, platforms: MAC },
  { key: 'cmd-delete', command: Cmd.editDeleteFromModel, platforms: MAC },
  { key: 'cmdctrl-shift-up', command: Cmd.editMoveUp },
  { key: 'cmdctrl-shift-down', command: Cmd.editMoveDown },
  { key: 'cmdctrl-a', command: Cmd.editSelectAll },
  { key: 'cmdctrl-e', command: Cmd.editSelectInExplorer },
  { key: 'cmdctrl-d', command: Cmd.editSelectInDiagram },
  { key: 'cmdctrl-f', command: Cmd.explorerFind },
  // Format
  { key: 'cmdctrl-l', command: Cmd.formatLineRectilinear },
  { key: 'cmdctrl-b', command: Cmd.formatLineOblique },
  { key: 'cmdctrl-alt-l', command: Cmd.formatLineRoundRect },
  { key: 'cmdctrl-alt-b', command: Cmd.formatLineCurve },
  { key: 'cmdctrl-shift-r', command: Cmd.formatAutoResize },
  { key: 'cmdctrl-shift-h', command: Cmd.formatShowShadow },
  { key: 'cmdctrl-shift-w', command: Cmd.formatWordWrap },
  { key: 'cmdctrl-shift-v', command: Cmd.formatShowVisibility },
  { key: 'cmdctrl-shift-y', command: Cmd.formatShowType },
  { key: 'cmdctrl-shift-m', command: Cmd.formatShowMultiplicity },
  { key: 'cmdctrl-shift-j', command: Cmd.formatShowOperationSignature },
  { key: 'cmdctrl-shift-a', command: Cmd.formatSuppressAttributes },
  { key: 'cmdctrl-shift-o', command: Cmd.formatSuppressOperations },
  { key: 'cmdctrl-shift-t', command: Cmd.formatSuppressLiterals },
  // View
  { key: 'cmdctrl-shift-p', command: Cmd.viewCommandPalette },
  { key: 'f4', command: Cmd.viewCloseDiagram },
  { key: 'cmdctrl-f4', command: Cmd.viewCloseOtherDiagrams },
  { key: 'shift-f4', command: Cmd.viewCloseAllDiagrams },
  { key: 'cmdctrl-shift-]', command: Cmd.viewNextDiagram },
  { key: 'cmdctrl-shift-[', command: Cmd.viewPreviousDiagram },
  { key: 'cmdctrl-plus', command: Cmd.viewZoomIn },
  { key: 'cmdctrl-=', command: Cmd.viewZoomIn },
  { key: 'cmdctrl-minus', command: Cmd.viewZoomOut },
  { key: 'cmdctrl-0', command: Cmd.viewActualSize },
  { key: 'cmdctrl-9', command: Cmd.viewFitToWindow },
  { key: 'cmdctrl-g', command: Cmd.viewShowGrid },
  { key: 'cmdctrl-shift-g', command: Cmd.viewSnapToGrid },
  { key: 'cmdctrl-1', command: Cmd.viewSidebar },
  { key: 'cmdctrl-2', command: Cmd.viewNavigator },
  { key: 'cmdctrl-3', command: Cmd.viewToolbar },
  { key: 'cmdctrl-4', command: Cmd.viewStatusbar },
  { key: 'cmdctrl-5', command: Cmd.viewToolbox },
  { key: 'cmdctrl-6', command: Cmd.viewEditors },
  // Toolbox: Esc, or A while a tool is active (outside text fields), returns to the Select tool.
  { key: 'esc', command: Cmd.toolSelect },
  { key: 'a', command: Cmd.toolSelect, when: WHEN_TOOL_ACTIVE }
]
