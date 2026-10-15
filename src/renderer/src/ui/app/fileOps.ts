/**
 * Project lifecycle: new, open (dialog, recent, OS), save, save as, close, export, and the
 * unsaved-changes prompt. Runs in the renderer through the preload bridge.
 */
import { diagramToPdfPage, diagramToPngBase64, diagramToSvg } from '../../export'
import { rename } from '../../commands'
import { isKindOf, type Diagram } from '../../model'
import { projectStore } from '../../store'
import { loadJson, saveJson } from '../persist'
import { baseName } from '../recentFiles'
import { uiStore } from '../uiStore'
import { bridge, isMac, platform } from './bridge'

const MDJ_FILTERS = [{ name: 'Models', extensions: ['mdj'] }]
const ps = () => projectStore.getState()
const ui = () => uiStore.getState()

/** Window title: `OpenUML 0.1.4 — name.mdj •` (bullet when there are unsaved changes). */
export function windowTitle(filePath: string | null, projectName: string, dirty: boolean, version: string | null = null): string {
  const name = filePath ? baseName(filePath) : projectName || 'Untitled'
  return `OpenUML${version ? ` ${version}` : ''} — ${name}${dirty ? ' •' : ''}`
}

function requireBridge(): NonNullable<typeof bridge> {
  if (!bridge) throw new Error('File access is only available in the desktop application.')
  return bridge
}

/** Moves focus out of text fields so pending edits (properties, documentation) commit. */
function commitPendingEdits(): void {
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.blur()
}

// ---------------------------------------------------------------------------------------------
// Working diagrams per file

interface WorkingDiagrams {
  readonly open: readonly string[]
  readonly active: string | null
}

/** The working diagrams remembered per file path (empty when the stored value is unusable). */
function loadWorkingDiagrams(): Record<string, WorkingDiagrams> {
  const all = loadJson<unknown>('workingDiagrams', {})
  return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, WorkingDiagrams>) : {}
}

function rememberWorkingDiagrams(): void {
  const s = ps()
  if (!s.filePath) return
  const all = loadWorkingDiagrams()
  // Re-insert so the entry moves to the end (most recent) of the key order.
  delete all[s.filePath]
  all[s.filePath] = { open: s.openDiagramIds, active: s.activeDiagramId }
  // Keep the map small: most recent 30 files.
  const entries = Object.entries(all).slice(-30)
  saveJson('workingDiagrams', Object.fromEntries(entries))
}

function restoreWorkingDiagrams(path: string): void {
  const saved = loadWorkingDiagrams()[path]
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.open)) return
  const s = ps()
  for (const id of saved.open) if (typeof id === 'string' && isKindOf(s.repository.get(id), 'Diagram')) ps().openDiagram(id)
  if (saved.active && isKindOf(ps().repository.get(saved.active), 'Diagram')) ps().openDiagram(saved.active)
}

// ---------------------------------------------------------------------------------------------
// Unsaved changes

/**
 * If the project has unsaved changes, asks Save / Don't Save / Cancel. Resolves true when the
 * caller may proceed (saved or discarded), false when cancelled.
 */
async function confirmDiscardChanges(): Promise<boolean> {
  commitPendingEdits()
  if (!ps().dirty) return true
  if (!bridge) return window.confirm('Discard unsaved changes?')
  const name = ps().filePath ? baseName(ps().filePath as string) : 'Untitled'
  // macOS HIG order: Save, Cancel, Don't Save.
  const buttons = isMac ? ['Save', 'Cancel', "Don't Save"] : ['Save', "Don't Save", 'Cancel']
  const choice = await bridge.showMessageBox({
    type: 'warning',
    message: `Do you want to save the changes to ${name}?`,
    detail: 'Your changes will be lost if you do not save them.',
    buttons
  })
  const label = buttons[choice]
  if (label === 'Save') return saveProject()
  return label === "Don't Save"
}

// ---------------------------------------------------------------------------------------------
// Commands

export async function newProject(): Promise<void> {
  if (!(await confirmDiscardChanges())) return
  rememberWorkingDiagrams()
  ps().newProject()
  ui().setTool(null)
}

/** Opens `text` as the project; `path` is null for a bundled example (untitled until saved). */
function loadProject(text: string, path: string | null, label = path ? baseName(path) : 'the example'): void {
  try {
    ps().openProject(text, path)
  } catch (err) {
    throw new Error(`Failed to open ${label}: ${err instanceof Error ? err.message : String(err)}`)
  }
  ui().setTool(null)
  if (path) {
    ui().addRecent(path)
    bridge?.addRecentDocument(path)
    restoreWorkingDiagrams(path)
  }
  const project = ps().project
  ui().expandMany([project._id, ...((project.ownedElements ?? []) as Array<{ _id: string }>).map((e) => e._id)])
  const warnings = ps().loadWarnings
  if (warnings.length > 0) {
    console.warn('Load warnings:', warnings)
    ui().toast(`Opened with ${warnings.length} repair${warnings.length === 1 ? '' : 's'} (see console).`)
  }
}

export async function openProjectDialog(): Promise<void> {
  const b = requireBridge()
  if (!(await confirmDiscardChanges())) return
  const result = await b.openTextFile(MDJ_FILTERS)
  if (!result) return
  rememberWorkingDiagrams()
  loadProject(result.content, result.path)
}

/** Opens a bundled example (text compiled into the app, no file access) after the unsaved-changes prompt. */
export async function openExample(text: string): Promise<void> {
  if (!(await confirmDiscardChanges())) return
  rememberWorkingDiagrams()
  loadProject(text, null)
}

export async function openProjectPath(path: string, askToSave = true): Promise<void> {
  const b = requireBridge()
  if (askToSave && !(await confirmDiscardChanges())) return
  let text: string
  try {
    text = await b.readTextFile(path)
  } catch {
    ui().removeRecent(path)
    throw new Error(`Failed to open ${path}: the file no longer exists or cannot be read.`)
  }
  rememberWorkingDiagrams()
  loadProject(text, path)
}

async function writeProject(path: string): Promise<void> {
  // Edits made while the file is being written are not in `text`: they must stay unsaved.
  const { engine } = ps()
  const point = engine.savePoint
  const text = ps().serializeProject()
  await requireBridge().writeTextFile(path, text)
  // The project was replaced (new/open) while writing: the open one was not saved.
  if (ps().engine !== engine) return
  ps().markSaved(path, point)
  ui().addRecent(path)
  bridge?.addRecentDocument(path)
  rememberWorkingDiagrams()
}

const DEFAULT_PROJECT_NAME = 'Untitled'

/**
 * A project still carrying the default name takes the name of the file it is saved as
 * (`Order System.mdj` names it "Order System"), so the Model Explorer root matches the file.
 * A name the user chose is kept. Returns true when the project was renamed.
 */
export function nameProjectAfterFile(path: string): boolean {
  const { project, engine } = ps()
  const name = project.name?.trim() ?? ''
  if (name && name !== DEFAULT_PROJECT_NAME) return false
  const stem = baseName(path).replace(/\.mdj$/i, '').trim()
  if (!stem) return false
  rename(engine, project, stem)
  return true
}

/** Writes the project to `path`; a failure is reported in a toast. Resolves false when it failed. */
async function writeOrReport(path: string): Promise<boolean> {
  try {
    await writeProject(path)
    return true
  } catch (err) {
    ui().toast(`Failed to save ${baseName(path)}: ${err instanceof Error ? err.message : String(err)}`, 'error')
    return false
  }
}

/** Saves to the current path (or asks for one). Resolves false when cancelled or failed. */
export async function saveProject(): Promise<boolean> {
  commitPendingEdits()
  const path = ps().filePath
  if (!path) return saveProjectAs()
  return writeOrReport(path)
}

export async function saveProjectAs(): Promise<boolean> {
  commitPendingEdits()
  const b = requireBridge()
  const current = ps().filePath
  const projectName = ps().project.name?.trim()
  let path = await b.chooseSavePath(current ? baseName(current) : `${projectName || DEFAULT_PROJECT_NAME}.mdj`, MDJ_FILTERS)
  if (!path) return false
  if (!/\.mdj$/i.test(path)) path += '.mdj'
  const { engine } = ps()
  const renamed = nameProjectAfterFile(path)
  const renameOp = engine.savePoint.top
  if (await writeOrReport(path)) return true
  // The file was not written: the project keeps its old name (unless edited meanwhile).
  if (renamed && ps().engine === engine && engine.savePoint.top === renameOp) engine.undo()
  return false
}

/** File > Close: closes the window (the close handler asks about unsaved changes). */
export function closeWindow(): void {
  rememberWorkingDiagrams()
  window.close()
}

/**
 * Window close requested by the main process while dirty. `beforeClose` runs once the user
 * saved or discarded the changes, just before the window closes.
 */
export async function handleCloseRequest(beforeClose?: () => Promise<void>): Promise<void> {
  if (await confirmDiscardChanges()) {
    rememberWorkingDiagrams()
    await beforeClose?.()
    bridge?.confirmClose()
  }
}

/**
 * Auto-save: writes the project to its file when it has one and unsaved changes, without moving
 * the focus or asking anything. Throws when the write fails.
 */
export async function saveSilently(): Promise<void> {
  const path = ps().filePath
  if (!path || !ps().dirty || !bridge) return
  await writeProject(path)
}

/** Opens work recovered after a crash: the project text and its file (if any), as not saved. */
export function loadRecoveredProject(text: string, path: string | null): void {
  loadProject(text, path, 'the recovered project')
  ps().markUnsaved()
}

// ---------------------------------------------------------------------------------------------
// Export

/** File-system-safe name for a diagram (`diagram` when empty). */
function exportFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim()
  return cleaned || 'diagram'
}

function activeDiagramOrThrow(): Diagram {
  const d = ps().repository.get(ps().activeDiagramId)
  if (!isKindOf(d, 'Diagram')) throw new Error('No diagram to export.')
  return d
}

export async function exportDiagram(format: 'png' | 'svg' | 'pdf'): Promise<void> {
  const b = requireBridge()
  const diagram = activeDiagramOrThrow()
  const name = `${exportFileName(diagram.name)}.${format}`
  const filters = [{ name: format.toUpperCase(), extensions: [format] }]
  let path = await b.chooseSavePath(name, filters)
  if (!path) return
  if (!path.toLowerCase().endsWith(`.${format}`)) path += `.${format}`
  if (format === 'svg') await b.writeTextFile(path, diagramToSvg(diagram._id))
  else if (format === 'pdf') await b.writePdf(path, [diagramToPdfPage(diagram._id)])
  else await b.writeBinaryFile(path, await diagramToPngBase64(diagram._id, 2))
  ui().toast(`Exported ${baseName(path)}`)
}

/** Every diagram of the project in one PDF, one page per diagram (model order). */
export async function exportAllDiagramsPdf(): Promise<void> {
  const b = requireBridge()
  const diagrams = ps().repository.diagrams()
  if (diagrams.length === 0) throw new Error('No diagram to export.')
  const name = ps().filePath ? baseName(ps().filePath as string).replace(/\.mdj$/i, '') : ps().project.name
  let path = await b.chooseSavePath(`${exportFileName(name ?? '')}.pdf`, [{ name: 'PDF', extensions: ['pdf'] }])
  if (!path) return
  if (!path.toLowerCase().endsWith('.pdf')) path += '.pdf'
  await b.writePdf(path, diagrams.map((d) => diagramToPdfPage(d._id)))
  ui().toast(`Exported ${diagrams.length} diagram${diagrams.length === 1 ? '' : 's'} to ${baseName(path)}`)
}

/** Owner chain joined by `::` (for unique export names). */
function pathName(d: Diagram): string {
  const names: string[] = []
  for (let p: Diagram['_parent'] = d; p && !isKindOf(p, 'Project'); p = p._parent) {
    names.unshift(typeof p['name'] === 'string' ? (p['name'] as string) : '')
  }
  return names.join('::')
}

export async function exportAllDiagrams(format: 'png' | 'svg'): Promise<void> {
  const b = requireBridge()
  const diagrams = ps().repository.diagrams()
  if (diagrams.length === 0) throw new Error('No diagram to export.')
  const folder = await b.chooseFolder(`Select a folder where all diagrams will be exported as ${format.toUpperCase()}s`)
  if (!folder) return
  const sep = platform === 'win32' ? '\\' : '/'
  const target = `${folder.replace(/[\\/]+$/, '')}${sep}${format}`
  let count = 0
  for (const [index, diagram] of diagrams.entries()) {
    const file = `${target}${sep}${exportFileName(pathName(diagram))}_${index}.${format}`
    if (format === 'svg') await b.writeTextFile(file, diagramToSvg(diagram._id))
    else await b.writeBinaryFile(file, await diagramToPngBase64(diagram._id, 2))
    count++
  }
  ui().toast(`Exported ${count} diagram${count === 1 ? '' : 's'} to ${target}`)
}
