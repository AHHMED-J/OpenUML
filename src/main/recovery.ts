/**
 * Crash recovery: the renderer hands over a copy of unsaved work every few seconds; it is kept in
 * one file under the user data folder (never next to the project) and offered back at the next
 * start when the app did not get to save or discard it. Kept free of Electron for unit tests.
 */
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecoverySnapshot } from '../shared/ipc'
import { writeFileAtomic } from './fileAccess'
import { isProjectPath } from './ipcValidation'

/** Largest project text kept (the same limit as an opened project file). */
const MAX_RECOVERY_BYTES = 256 * 1024 * 1024
const MAX_NAME_LENGTH = 300

/** A valid snapshot from untrusted input (IPC or the recovery file), else null. */
export function sanitizeSnapshot(value: unknown): RecoverySnapshot | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const text = v['text']
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_RECOVERY_BYTES) return null
  const filePath = isProjectPath(v['filePath']) ? (v['filePath'] as string) : null
  const name = typeof v['name'] === 'string' ? v['name'].slice(0, MAX_NAME_LENGTH) : ''
  const savedAt = typeof v['savedAt'] === 'number' && Number.isFinite(v['savedAt']) ? v['savedAt'] : 0
  return { text, filePath, name, savedAt }
}

/** The recovery file of one user data folder. */
export class RecoveryStore {
  readonly file: string

  constructor(folder: string) {
    this.file = join(folder, 'recovery', 'unsaved-project.json')
  }

  async save(snapshot: RecoverySnapshot): Promise<void> {
    await writeFileAtomic(this.file, JSON.stringify(snapshot))
  }

  /** The kept snapshot, or null when there is none or it is unreadable. */
  async read(): Promise<RecoverySnapshot | null> {
    try {
      const info = await stat(this.file)
      if (!info.isFile() || info.size > MAX_RECOVERY_BYTES * 2) return null
      return sanitizeSnapshot(JSON.parse(await readFile(this.file, 'utf8')))
    } catch {
      return null
    }
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true })
  }
}
