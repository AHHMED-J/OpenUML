/**
 * Application version and update notices: the version shown in the window title and About, and
 * the check for a newer GitHub release (at startup and once a day when enabled in Preferences,
 * or from Help > Check for Updates). A newer release is announced with a toast and stays offered
 * in the status bar; Download opens its release page. Nothing is downloaded or installed here.
 */
import { uiStore } from '../uiStore'
import { bridge } from './bridge'

const DAY_MS = 24 * 60 * 60 * 1000
/** Delay of the automatic check after startup, so it never competes with opening a file. */
const STARTUP_CHECK_DELAY_MS = 5000

const ui = () => uiStore.getState()

/**
 * Asks for the latest release and records a newer one. `manual` (Help > Check for Updates) also
 * reports "up to date" and failures; the automatic check stays silent unless there is news.
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (!bridge) return
  let result: Awaited<ReturnType<typeof bridge.checkForUpdates>>
  try {
    result = await bridge.checkForUpdates()
  } catch (err) {
    if (manual) {
      await bridge.showMessageBox({
        type: 'warning',
        message: "Couldn't check for updates",
        detail: `${err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)}\nCheck your internet connection and try again.`,
        buttons: ['OK']
      })
    }
    return
  }
  if (!result.available || !result.latest || !result.url) {
    ui().setUpdate(null)
    if (manual) await bridge.showMessageBox({ type: 'info', message: `OpenUML ${result.current} is the latest version.`, buttons: ['OK'] })
    return
  }
  const news = ui().update?.version !== result.latest
  ui().setUpdate({ version: result.latest, url: result.url })
  if (manual) await offerUpdate()
  else if (news) ui().toast(`OpenUML ${result.latest} is available. Click "Update" in the status bar to download it.`)
}

/** Shows the available update; Download opens its release page in the browser. */
export async function offerUpdate(): Promise<void> {
  const update = ui().update
  if (!update || !bridge) return
  const current = ui().appVersion
  const choice = await bridge.showMessageBox({
    type: 'info',
    message: `OpenUML ${update.version} is available`,
    detail: `${current ? `You are using OpenUML ${current}. ` : ''}Download the new version from its release page and install it over this one; your files and settings are kept.`,
    buttons: ['Download', 'Later']
  })
  if (choice === 0) bridge.openExternal(update.url)
}

/** Loads the app version, then runs the automatic update check. Returns a cleanup function. */
export function startUpdates(): () => void {
  const b = bridge
  if (!b) return () => undefined
  b.getAppInfo()
    .then((info) => ui().setAppVersion(info.version))
    .catch(() => undefined)
  const auto = (): void => {
    if (ui().prefs.checkForUpdates) void checkForUpdates(false)
  }
  const first = setTimeout(auto, STARTUP_CHECK_DELAY_MS)
  const daily = setInterval(auto, DAY_MS)
  return () => {
    clearTimeout(first)
    clearInterval(daily)
  }
}
