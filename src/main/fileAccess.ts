/**
 * File-system guards for the IPC handlers: which paths the renderer may read and write, and
 * crash-safe writing. Kept free of Electron so it can be unit tested.
 */
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

/** Project files the renderer may read by path (recent files, files opened by the OS). */
const READABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.mdj'])

/**
 * The renderer may only write where the user pointed it: files chosen in a save dialog or opened
 * in this session, and anything under a folder chosen in a folder dialog. It may read project
 * files (`.mdj`) by path.
 */
export class FileAccess {
  private readonly files = new Set<string>()
  private readonly folders = new Set<string>()

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  private key(path: string): string {
    const full = resolve(path)
    // Windows and macOS file systems are case-insensitive by default.
    return this.platform === 'linux' ? full : full.toLowerCase()
  }

  /** Grants writing `path`, and `path.<ext>` for each extension the caller may append. */
  grantFile(path: string, extensions: readonly string[] = []): void {
    this.files.add(this.key(path))
    for (const ext of extensions) if (/^[a-z0-9]+$/i.test(ext)) this.files.add(this.key(`${path}.${ext}`))
  }

  /** Grants writing anywhere under `folder`. */
  grantFolder(folder: string): void {
    this.folders.add(this.key(folder))
  }

  canRead(path: unknown): path is string {
    return typeof path === 'string' && path.length > 0 && READABLE_EXTENSIONS.has(extname(path).toLowerCase())
  }

  canWrite(path: unknown): path is string {
    if (typeof path !== 'string' || path.length === 0) return false
    const key = this.key(path)
    if (this.files.has(key)) return true
    for (const folder of this.folders) if (key.startsWith(folder.endsWith(sep) ? folder : folder + sep)) return true
    return false
  }
}

/**
 * Writes `data` to `path` without ever leaving a half-written file there: the data goes to a
 * temporary file in the same folder, which then replaces the target. Missing folders are created;
 * a symbolic link at `path` keeps pointing to the (replaced) file it links to.
 */
export async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const target = await realpath(path).catch(() => path)
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.tmp`)
  try {
    await writeFile(tmp, data)
    await rename(tmp, target)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}
