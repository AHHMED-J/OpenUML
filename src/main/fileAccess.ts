/**
 * File-system guards for the IPC handlers: which paths the renderer may read and write, and
 * crash-safe writing. Kept free of Electron so it can be unit tested.
 */
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isAbsolutePath } from './ipcValidation'

/** Project files the renderer may read by path (recent files, files opened by the OS). */
const READABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.mdj'])

/**
 * Largest project file read (256 MiB). Far above real models; it keeps a hostile or wrong file
 * from exhausting memory in the main process and the renderer, which parses the text.
 */
const MAX_PROJECT_BYTES = 256 * 1024 * 1024

/**
 * The renderer may only write where the user pointed it: files chosen in a save dialog or opened
 * in this session, and anything under a folder chosen in a folder dialog. It may read project
 * files (`.mdj`) by path. Paths must be absolute.
 */
export class FileAccess {
  private readonly files = new Set<string>()
  /** Granted folders: comparison key → path as granted (for resolving symbolic links). */
  private readonly folders = new Map<string, string>()

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
    this.folders.set(this.key(folder), folder)
  }

  canRead(path: unknown): path is string {
    return isAbsolutePath(path, this.platform) && READABLE_EXTENSIONS.has(extname(path).toLowerCase())
  }

  /** Lexical check: `path` is a granted file or lies under a granted folder. */
  canWrite(path: unknown): path is string {
    if (!isAbsolutePath(path, this.platform)) return false
    const key = this.key(path)
    if (this.files.has(key)) return true
    for (const folder of this.folders.keys()) if (key.startsWith(folder.endsWith(sep) ? folder : folder + sep)) return true
    return false
  }

  /**
   * `canWrite`, plus for folder grants: after resolving symbolic links the target must still lie
   * inside the real granted folder (a link inside the folder must not lead the write elsewhere).
   * Files the user picked in a save dialog are written through links as before.
   */
  async canWriteResolved(path: unknown): Promise<boolean> {
    if (!this.canWrite(path)) return false
    if (this.files.has(this.key(path))) return true
    const real = await realpathOfLongestExisting(path)
    for (const [key, folder] of this.folders) {
      if (!this.key(path).startsWith(key.endsWith(sep) ? key : key + sep)) continue
      const realFolder = await realpath(folder).catch(() => null)
      if (realFolder && isInside(realFolder, real, this.platform)) return true
    }
    return false
  }
}

function isInside(folder: string, path: string, platform: NodeJS.Platform): boolean {
  const norm = (p: string): string => (platform === 'linux' ? p : p.toLowerCase())
  const rel = relative(norm(folder), norm(path))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** `realpath` of `path`, or of its nearest existing ancestor with the missing rest appended. */
async function realpathOfLongestExisting(path: string): Promise<string> {
  let current = resolve(path)
  const rest: string[] = []
  for (;;) {
    try {
      return join(await realpath(current), ...rest)
    } catch {
      const parent = dirname(current)
      if (parent === current) return resolve(path)
      rest.unshift(basename(current))
      current = parent
    }
  }
}

export class FileTooLargeError extends Error {
  constructor(path: string, size: number) {
    super(`${basename(path)} is too large to open (${Math.round(size / (1024 * 1024))} MB; the limit is ${MAX_PROJECT_BYTES / (1024 * 1024)} MB)`)
    this.name = 'FileTooLargeError'
  }
}

/**
 * Reads a project file as UTF-8 text. Only regular files up to `MAX_PROJECT_BYTES` are read (no
 * devices or pipes). With `requireProjectTarget`, a symbolic link must lead to a `.mdj` file, so
 * a planted `model.mdj` link cannot expose another file.
 */
export async function readProjectFile(path: string, requireProjectTarget: boolean, maxBytes = MAX_PROJECT_BYTES): Promise<string> {
  if (requireProjectTarget) {
    const target = await realpath(path)
    if (!READABLE_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error(`${basename(path)} is not a project file`)
  }
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`${basename(path)} is not a file`)
  if (info.size > maxBytes) throw new FileTooLargeError(path, info.size)
  return readFile(path, 'utf8')
}

/**
 * Writes `data` to `path` without ever leaving a half-written file there: the data goes to a
 * temporary file in the same folder, which then replaces the target. Missing folders are created;
 * a symbolic link at `path` keeps pointing to the (replaced) file it links to, and a replaced file
 * keeps its permissions.
 */
export async function writeFileAtomic(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const target = await realpath(path).catch(() => path)
  const tmp = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.tmp`)
  try {
    await writeFile(tmp, data)
    const mode = await stat(target).then((info) => info.mode & 0o7777, () => null)
    if (mode !== null) await chmod(tmp, mode)
    await rename(tmp, target)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}
