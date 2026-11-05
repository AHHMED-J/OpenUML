/**
 * Application version and update notices: the version shown in the window title and About, and
 * the check for a newer GitHub release (at startup and once a day when enabled in Preferences,
 * or from Help > Check for Updates). While a newer release exists it is offered on every start,
 * and after Later it stays in the window title, next to the document name, and in the status bar.
 * Download opens its release page. Nothing is downloaded or installed here.
 */
import { uiStore } from '../uiStore'
import { bridge } from './bridge'

const DAY_MS = 24 * 60 * 60 * 1000

/** Who asked: Help > Check for Updates, the app starting, or the daily check of a running app. */
type UpdateCheck = 'manual' | 'startup' | 'daily'

const ui = () => uiStore.getState()

/**
 * Asks for the latest release and records a newer one. `manual` also reports "up to date" and
 * failures. An update is offered every time, except that the daily check only interrupts a running
 * app for a release it has not offered yet.
 */
export async function checkForUpdates(check: UpdateCheck): Promise<void> {
  if (!bridge) return
  const manual = check === 'manual'
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
  if (check !== 'daily' || news) await offerUpdate()
}

/** The startup check, unless Preferences turned it off. */
export async function checkForUpdatesAtStartup(): Promise<void> {
  if (ui().prefs.checkForUpdates) await checkForUpdates('startup')
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

/** Loads the app version and schedules the daily update check. Returns a cleanup function. */
export function startUpdates(): () => void {
  const b = bridge
  if (!b) return () => undefined
  b.getAppInfo()
    .then((info) => ui().setAppVersion(info.version))
    .catch(() => undefined)
  const daily = setInterval(() => {
    if (ui().prefs.checkForUpdates) void checkForUpdates('daily')
  }, DAY_MS)
  return () => clearInterval(daily)
}
