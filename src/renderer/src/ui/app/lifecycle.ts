/**
 * Connects the shell to the outside world: window title and dirty flag, the close prompt,
 * files opened by the OS, the native application menu (rebuilt when state changes) and the
 * global keyboard dispatcher. `startShell()` returns a cleanup function.
 */
import { setRadAutoThread } from '../../model'
import { projectStore } from '../../store'
import { bindingToDispatch, eventToDescriptor } from '../keymap'
import { buildAppMenu } from '../menus/appMenu'
import { Cmd, NATIVE_EDIT_COMMANDS } from '../menus/commandIds'
import { resolveMenu, toNativeMenu, type MenuContext } from '../menus/menuModel'
import { uiStore } from '../uiStore'
import { bridge, isTextInputFocused, platform } from './bridge'
import { initCommands, keymap, registry, reportError, runCommand } from './commands'
import { handleCloseRequest, openProjectPath, windowTitle } from './fileOps'
import { decodeMenuCommand } from '../menus/menuModel'

export function menuContext(): MenuContext {
  return {
    commands: registry,
    platform,
    keystrokeFor: (command) => keymap.keystrokeFor(command),
    forceEnabled: isTextInputFocused() ? new Set(Object.keys(NATIVE_EDIT_COMMANDS)) : undefined
  }
}

function syncTitle(): void {
  const s = projectStore.getState()
  const title = windowTitle(s.filePath, s.project.name, s.dirty)
  if (bridge) bridge.setDirty(s.dirty, title)
  else document.title = title
}

let lastMenuJson = ''

function syncMenu(): void {
  if (!bridge) return
  const resolved = resolveMenu(buildAppMenu(platform), menuContext())
  const menu = toNativeMenu(resolved, platform)
  const json = JSON.stringify(menu)
  if (json === lastMenuJson) return
  lastMenuJson = json
  bridge.setMenu(menu)
}

const TEXT_BLOCKED_COMMANDS: ReadonlySet<string> = new Set([Cmd.toolSelect])

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return
  const descriptor = eventToDescriptor(e)
  if (!descriptor) return
  const ui = uiStore.getState()
  // Modal dialogs and open menus handle their own keys.
  if (ui.modal || ui.contextMenu) return
  // Menu accelerators are dispatched here as well (see `bindingToDispatch`): the native menu only
  // receives keys the page leaves unhandled, so this is the single path for the canvas and panels.
  const binding = bindingToDispatch(keymap, descriptor, { textFocused: isTextInputFocused(), textBlockedCommands: TEXT_BLOCKED_COMMANDS })
  if (!binding) return
  e.preventDefault()
  e.stopPropagation()
  runCommand(binding.command, binding.args)
}

export function startShell(): () => void {
  initCommands()
  const cleanups: Array<() => void> = []

  // Title, dirty flag and menu state follow the stores.
  let menuTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleMenu = (): void => {
    if (menuTimer !== null) return
    menuTimer = setTimeout(() => {
      menuTimer = null
      syncMenu()
    }, 30)
  }
  syncTitle()
  syncMenu()
  setRadAutoThread(uiStore.getState().prefs.radAutoThread)
  cleanups.push(
    uiStore.subscribe((s, prev) => {
      if (s.prefs.radAutoThread !== prev.prefs.radAutoThread) setRadAutoThread(s.prefs.radAutoThread)
    })
  )
  cleanups.push(
    projectStore.subscribe((s, prev) => {
      if (s.dirty !== prev.dirty || s.filePath !== prev.filePath || s.project !== prev.project || s.version !== prev.version) {
        syncTitle()
      }
      scheduleMenu()
    })
  )
  cleanups.push(
    uiStore.subscribe((s, prev) => {
      if (s.panels !== prev.panels || s.dock !== prev.dock || s.prefs !== prev.prefs || s.recentFiles !== prev.recentFiles || s.sortBy !== prev.sortBy) {
        scheduleMenu()
      }
    })
  )
  // Text focus changes whether Edit items act natively (and so their enablement).
  const onFocusChange = (): void => scheduleMenu()
  document.addEventListener('focusin', onFocusChange)
  document.addEventListener('focusout', onFocusChange)
  window.addEventListener('focus', onFocusChange)
  cleanups.push(() => {
    document.removeEventListener('focusin', onFocusChange)
    document.removeEventListener('focusout', onFocusChange)
    window.removeEventListener('focus', onFocusChange)
    if (menuTimer !== null) clearTimeout(menuTimer)
  })

  window.addEventListener('keydown', onKeyDown)
  cleanups.push(() => window.removeEventListener('keydown', onKeyDown))

  if (bridge) {
    cleanups.push(
      bridge.onCommand((token) => {
        const { command, args } = decodeMenuCommand(token)
        runCommand(command, args)
      })
    )
    cleanups.push(bridge.onCloseRequested(() => void handleCloseRequest().catch(reportError)))
    cleanups.push(bridge.onOpenFile((path) => void openProjectPath(path).catch(reportError)))
    void bridge
      .takeStartupFile()
      .then((path) => (path ? openProjectPath(path, false) : undefined))
      .catch(reportError)
  }

  return () => cleanups.forEach((fn) => fn())
}
