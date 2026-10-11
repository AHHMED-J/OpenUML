/**
 * Connects the shell to the outside world: window title and dirty flag, the close prompt,
 * files opened by the OS, the native application menu (rebuilt when state changes) and the
 * global keyboard dispatcher. `startShell()` returns a cleanup function.
 */
import { projectStore } from '../../store'
import { eventToDescriptor, isNativeEditKeystroke } from '../keymap'
import { buildAppMenu } from '../menus/appMenu'
import { Cmd, NATIVE_EDIT_COMMANDS } from '../menus/commandIds'
import { nativeAcceleratorDescriptors, resolveMenu, toNativeMenu, type MenuContext } from '../menus/menuModel'
import { uiStore } from '../uiStore'
import { bridge, isTextInputFocused, platform } from './bridge'
import { initCommands, keymap, registry, reportError, runCommand } from './commands'
import { handleCloseRequest, openProjectPath, windowTitle } from './fileOps'
import { decodeMenuCommand } from '../menus/menuModel'

/** Descriptors handled by native menu accelerators (the keyboard dispatcher skips them). */
let nativeAccelerators = new Set<string>()

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
  nativeAccelerators = nativeAcceleratorDescriptors(resolved)
  const menu = toNativeMenu(resolved, platform)
  const json = JSON.stringify(menu)
  if (json === lastMenuJson) return
  lastMenuJson = json
  bridge.setMenu(menu)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return
  const descriptor = eventToDescriptor(e)
  if (!descriptor) return
  const ui = uiStore.getState()
  const textFocused = isTextInputFocused()
  if (textFocused && isNativeEditKeystroke(descriptor, platform)) return
  // Modal dialogs and open menus handle their own keys.
  if (ui.modal || ui.contextMenu) return
  // Keys registered as native menu accelerators are dispatched by the menu.
  if (bridge && nativeAccelerators.has(descriptor)) return
  const binding = keymap.match(descriptor)
  if (!binding) return
  if (textFocused && (binding.command === Cmd.toolSelect || !/^(cmd|ctrl|alt)-/.test(descriptor))) return
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
      if (s.panels !== prev.panels || s.prefs !== prev.prefs || s.recentFiles !== prev.recentFiles || s.sortBy !== prev.sortBy) {
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
