/**
 * The application's command registry, keymap and dispatcher. Every entry point (native menu,
 * in-app menus, keyboard, toolbar, command palette) runs commands through `runCommand`.
 */
import { CommandRegistry } from '../../commands'
import { registerDiagramCommands } from '../../diagram'
import { projectStore, registerCoreCommands } from '../../store'
import { Keymap } from '../keymap'
import { Cmd, NATIVE_EDIT_COMMANDS } from '../menus/commandIds'
import { DEFAULT_KEYMAP } from '../menus/keymaps'
import { diagramCanHostView } from '../toolbox/palettes'
import { uiStore } from '../uiStore'
import { registerAppCommands } from './appCommands'
import { registerIdef0 } from './idef0'
import { bridge, isTextInputFocused, platform } from './bridge'

export const registry = new CommandRegistry()
export const keymap = new Keymap(platform, DEFAULT_KEYMAP)

let initialized = false

/**
 * Registers all commands once: the diagram module's first, then the core commands (except
 * `file.new`, which the shell wraps with the unsaved-changes prompt), then the shell's own
 * commands for every id still free.
 */
export function initCommands(): void {
  if (initialized) return
  initialized = true
  try {
    registerDiagramCommands(registry, {
      getZoom: () => uiStore.getState().zoomOf(projectStore.getState().activeDiagramId),
      setZoom: (zoom: number) => {
        const id = projectStore.getState().activeDiagramId
        if (id) uiStore.getState().setZoom(id, zoom)
      },
      canHostView: diagramCanHostView,
      notify: (message) => uiStore.getState().toast(message, 'error')
    })
  } catch (err) {
    console.error('Failed to register diagram commands', err)
    uiStore.getState().toast('Some diagram commands could not be loaded and are unavailable', 'error')
  }
  const core = new CommandRegistry()
  registerCoreCommands(core, projectStore)
  for (const command of core.all()) {
    if (command.id !== Cmd.fileNew && !registry.has(command.id)) registry.register(command)
  }
  registerIdef0(registry)
  registerAppCommands(registry)
  for (const warning of keymap.warnings) console.warn(warning)
}

export function reportError(err: unknown): void {
  const text = err instanceof Error ? err.message : String(err)
  console.error(err)
  uiStore.getState().toast(text, 'error')
}

/**
 * Runs a command. Edit commands (undo, redo, cut, copy, paste, select all) act natively on a
 * focused text field instead of on the model.
 */
export function runCommand(id: string, args?: unknown): void {
  const nativeAction = NATIVE_EDIT_COMMANDS[id]
  if (nativeAction && isTextInputFocused()) {
    if (bridge) bridge.nativeEdit(nativeAction)
    else document.execCommand(nativeAction)
    return
  }
  try {
    const result = args === undefined ? registry.execute(id) : registry.execute(id, args)
    if (result instanceof Promise) result.catch(reportError)
  } catch (err) {
    reportError(err)
  }
}

/** Keystroke label for a command (`⌘S` / `Ctrl+S`), if bound. */
export function keystrokeFor(command: string): string | undefined {
  return keymap.keystrokeFor(command)
}
