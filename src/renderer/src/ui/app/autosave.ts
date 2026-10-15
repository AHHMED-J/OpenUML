/**
 * Protection of unsaved work, in two layers:
 * - Recovery copy: a couple of seconds after each change, the project goes to the main process,
 *   which keeps it outside the project file. It is dropped once the project is saved or its
 *   changes discarded; if the app ends first (crash, power loss), the next start offers it back.
 * - Auto-save: a project that has a file is saved to it every `prefs.autoSaveSeconds` while it has
 *   unsaved changes (Preferences > Files; 0 turns it off).
 */
import { projectStore } from '../../store'
import { uiStore } from '../uiStore'
import { bridge } from './bridge'
import { loadRecoveredProject, saveSilently } from './fileOps'

/** Quiet time after a change before the recovery copy is taken. */
const RECOVERY_DELAY_MS = 2000
/** How often the auto-save timer looks at the project. */
const AUTO_SAVE_TICK_MS = 5000
/** Auto-save waits for this much quiet after the last change (never in the middle of typing). */
const AUTO_SAVE_IDLE_MS = 1500

const ps = () => projectStore.getState()
const ui = () => uiStore.getState()

let recoveryTimer: ReturnType<typeof setTimeout> | null = null
/** Recovery writes run one after another, so an old copy never lands after a newer one. */
let recoveryQueue: Promise<void> = Promise.resolve()
/** Set when the window closes with its changes discarded: nothing may be kept after that. */
let discarded = false

function queueRecovery(job: () => Promise<void>): void {
  recoveryQueue = recoveryQueue.then(job).catch(() => undefined)
}

function cancelRecoveryTimer(): void {
  if (recoveryTimer !== null) clearTimeout(recoveryTimer)
  recoveryTimer = null
}

function keepRecoveryCopy(): void {
  recoveryTimer = null
  const b = bridge
  const s = ps()
  if (!b || discarded || !s.dirty) return
  const snapshot = { text: s.serializeProject(), filePath: s.filePath, name: s.project.name || 'Untitled', savedAt: Date.now() }
  queueRecovery(() => b.saveRecovery(snapshot))
}

/** Drops the recovery copy for good (the window closes and its changes were discarded or saved). */
export async function discardRecovery(): Promise<void> {
  discarded = true
  cancelRecoveryTimer()
  const b = bridge
  if (b) queueRecovery(() => b.clearRecovery())
  await recoveryQueue
}

/** At startup: offers the work a previous session could not save. Resolves once it is settled. */
export async function offerRecovery(): Promise<void> {
  const b = bridge
  if (!b) return
  const snapshot = await b.readRecovery().catch(() => null)
  if (!snapshot) return
  const name = snapshot.filePath ? (snapshot.filePath.split(/[\\/]/).pop() ?? snapshot.filePath) : snapshot.name || 'Untitled'
  const when = snapshot.savedAt > 0 ? ` (last kept ${new Date(snapshot.savedAt).toLocaleString()})` : ''
  const choice = await b.showMessageBox({
    type: 'warning',
    message: `Recover your unsaved changes to ${name}?`,
    detail: `OpenUML closed before these changes were saved${when}. Recover them to keep working, then save the project.`,
    buttons: ['Recover', 'Discard']
  })
  if (choice !== 0) {
    await b.clearRecovery()
    return
  }
  try {
    loadRecoveredProject(snapshot.text, snapshot.filePath)
  } catch (err) {
    await b.clearRecovery()
    ui().toast(`The unsaved changes could not be recovered: ${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}

/** Starts the recovery copies and the auto-save timer. Returns a cleanup function. */
export function startAutosave(): () => void {
  if (!bridge) return () => undefined
  const b = bridge
  let lastChange = Date.now()
  let dirtySince = Date.now()
  let lastAutoSave = Date.now()
  let saving = false
  let reportedFailure = false

  const unsubscribe = projectStore.subscribe((s, prev) => {
    if (s.version !== prev.version || s.project !== prev.project) lastChange = Date.now()
    if (s.dirty && !prev.dirty) dirtySince = Date.now()
    if (s.dirty && (s.version !== prev.version || !prev.dirty || s.filePath !== prev.filePath)) {
      discarded = false
      if (recoveryTimer === null) recoveryTimer = setTimeout(keepRecoveryCopy, RECOVERY_DELAY_MS)
    } else if (!s.dirty && prev.dirty) {
      // Saved, or replaced by another project after its changes were saved or discarded.
      cancelRecoveryTimer()
      queueRecovery(() => b.clearRecovery())
    }
  })

  const tick = async (): Promise<void> => {
    const seconds = ui().prefs.autoSaveSeconds
    const s = ps()
    if (saving || seconds <= 0 || !s.filePath || !s.dirty || ui().modal) return
    const now = Date.now()
    if (now - lastChange < AUTO_SAVE_IDLE_MS || now - dirtySince < seconds * 1000 || now - lastAutoSave < seconds * 1000) return
    saving = true
    lastAutoSave = now
    try {
      await saveSilently()
      reportedFailure = false
    } catch (err) {
      // Reported once until an auto-save works again; the recovery copy still protects the work.
      if (!reportedFailure) ui().toast(`Auto-save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      reportedFailure = true
    } finally {
      saving = false
      if (ps().dirty) dirtySince = Date.now()
    }
  }
  const timer = setInterval(() => void tick(), AUTO_SAVE_TICK_MS)

  return () => {
    unsubscribe()
    clearInterval(timer)
    cancelRecoveryTimer()
  }
}
