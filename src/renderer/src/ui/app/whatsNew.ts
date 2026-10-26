/**
 * Opens the What's New window: on the first launch of a newer version (OpenUML never installs
 * updates itself, so "after an update" means the first start of a version not seen before) and
 * from Help > What's New.
 */
import { uiStore } from '../uiStore'
import { decideWhatsNew } from '../whatsNew/logic'
import { RELEASES } from '../whatsNew/releases'
import { bridge } from './bridge'

const ui = () => uiStore.getState()

/** Help > What's New: the newest release's notes, whatever the preferences say. */
export function openLatestWhatsNew(): void {
  const latest = RELEASES[0]
  if (latest) ui().openModal({ kind: 'whatsNew', releases: [latest] })
}

/** Resolves once no dialog is open, so the window never covers another one. */
function whenNoModal(): Promise<void> {
  if (!ui().modal) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = uiStore.subscribe((s) => {
      if (s.modal) return
      unsubscribe()
      resolve()
    })
  })
}

/**
 * Startup check. Records the running version as seen (a fresh install, or a launch with the window
 * turned off, shows nothing) and opens the notes of every release since the last seen version.
 */
export async function showWhatsNewAfterUpdate(): Promise<void> {
  if (!bridge) return
  let current = ui().appVersion
  if (current === null) {
    current = (await bridge.getAppInfo()).version
    ui().setAppVersion(current)
  }
  const { record, show } = decideWhatsNew({
    releases: RELEASES,
    lastSeen: ui().prefs.lastSeenVersion,
    current,
    enabled: ui().prefs.showWhatsNew
  })
  if (record !== null) ui().setPrefs({ lastSeenVersion: record })
  if (show.length === 0) return
  await whenNoModal()
  ui().openModal({ kind: 'whatsNew', releases: show })
}
