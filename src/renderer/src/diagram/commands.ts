/**
 * Diagram commands registered into the shared `CommandRegistry` (IDs follow the shell's menu ids,
 * spec 02 §2–3): select all, clipboard (cut/copy/paste/duplicate), zoom, alignment and z-order,
 * line style and view format toggles, nudge and quick edit. IDs that another module already
 * registered are skipped, so registration order does not matter.
 */
import { deleteFromView, setFieldsOfAll, type CommandDefinition, type CommandRegistry } from '../commands'
import { fieldOf, isKindOf, type Diagram, type View } from '../model'
import { activeDiagram, projectStore, selectedViews } from '../store'
import { GRID, LineStyle, stepZoom, ZOOM } from './core'
import { canCopyViewsOf, copyViews, duplicateViews, parseClipboard, pasteViews, serializeClipboard, type ViewClipboardPayload } from './clipboard'
import { moveSelection, type DiagramEnv } from './editor/actions'
import { getActiveEditor } from './editor/activeEditor'
import { ALIGN_OPS, alignViews, reorderViews } from './editor/alignment'
import { computeDiagramLayout } from './layout/layoutDiagram'
import { getTextMeasurer } from './layout/measurer'

export interface DiagramCommandContext {
  getZoom(): number
  setZoom(zoom: number): void
}

/** Command IDs registered by `registerDiagramCommands`. */
export const DiagramCommandIds = {
  selectAll: 'edit.select-all',
  cut: 'edit.cut',
  copy: 'edit.copy',
  paste: 'edit.paste',
  duplicate: 'edit.duplicate',
  zoomIn: 'view.zoom-in',
  zoomOut: 'view.zoom-out',
  actualSize: 'view.actual-size',
  fitToWindow: 'view.fit-to-window',
  lineRectilinear: 'format.linestyle.rectilinear',
  lineOblique: 'format.linestyle.oblique',
  lineRoundRect: 'format.linestyle.roundrect',
  lineCurve: 'format.linestyle.curve',
  autoResize: 'format.auto-resize',
  sendToBack: 'alignment.send-to-back',
  bringToFront: 'alignment.bring-to-front',
  nudgeLeft: 'diagram.nudge-left',
  nudgeRight: 'diagram.nudge-right',
  nudgeUp: 'diagram.nudge-up',
  nudgeDown: 'diagram.nudge-down',
  quickEdit: 'diagram.quick-edit'
} as const

// ---------------------------------------------------------------------------------------------
// Clipboard storage: kept in memory and mirrored to the system clipboard as text.

let memoryClipboard: ViewClipboardPayload | null = null

export function getClipboardPayload(): ViewClipboardPayload | null {
  return memoryClipboard
}

function writeSystemClipboard(text: string): void {
  try {
    void globalThis.navigator?.clipboard?.writeText(text).catch(() => undefined)
  } catch {
    // Clipboard API unavailable (tests, unfocused window).
  }
}

async function readSystemClipboard(): Promise<ViewClipboardPayload | null> {
  try {
    const text = await globalThis.navigator?.clipboard?.readText()
    return text ? parseClipboard(text) : null
  } catch {
    return null
  }
}

function isTextFieldFocused(): boolean {
  const el = globalThis.document?.activeElement as HTMLElement | null | undefined
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

function nativeEdit(command: 'copy' | 'cut' | 'paste' | 'selectAll'): boolean {
  if (!isTextFieldFocused()) return false
  globalThis.document.execCommand(command)
  return true
}

// ---------------------------------------------------------------------------------------------

function state() {
  return projectStore.getState()
}

function envOf(diagram: Diagram): DiagramEnv {
  return { engine: state().engine, diagram, measurer: getTextMeasurer() }
}

function currentDiagram(): Diagram | null {
  return activeDiagram(state())
}

function selection(): View[] {
  return selectedViews(state())
}

function selectViews(ids: readonly string[]): void {
  state().select({ views: ids })
}

/** Copies the selected views; returns true when something was copied. */
export function copySelection(): boolean {
  const diagram = currentDiagram()
  if (!diagram) return false
  const s = state()
  const layout = computeDiagramLayout(diagram, s.repository, getTextMeasurer())
  const payload = copyViews(s.repository, diagram, s.selectedViewIds, layout)
  if (!payload) return false
  memoryClipboard = payload
  writeSystemClipboard(serializeClipboard(payload))
  return true
}

/** Pastes the clipboard into the active diagram, centered in its viewport. */
export async function pasteClipboard(): Promise<string[]> {
  const diagram = currentDiagram()
  if (!diagram) return []
  const payload = (await readSystemClipboard()) ?? memoryClipboard
  if (!payload) return []
  const center = getActiveEditor(diagram._id)?.viewportCenter()
  try {
    const ids = pasteViews(state().engine, diagram, payload, center)
    selectViews(ids)
    return ids
  } catch (err) {
    console.warn('Paste failed:', (err as Error).message)
    return []
  }
}

function setLineStyle(style: LineStyle): void {
  const edges = selection().filter((v) => isKindOf(v, 'EdgeView'))
  if (edges.length > 0) setFieldsOfAll(state().engine, edges, { lineStyle: style }, 'Change Line Style')
}

function lineStyleChecked(style: LineStyle): boolean {
  const edges = selection().filter((v) => isKindOf(v, 'EdgeView'))
  return edges.length > 0 && edges.every((e) => e['lineStyle'] === style)
}

/** Boolean view format toggles (spec 02 §2.4); applied to the selected views that have the field. */
const FORMAT_TOGGLES: ReadonlyArray<readonly [id: string, field: string, label: string]> = [
  ['format.auto-resize', 'autoResize', 'Auto Resize'],
  ['format.show-shadow', 'showShadow', 'Show Shadow'],
  ['format.word-wrap', 'wordWrap', 'Word Wrap'],
  ['format.show-visibility', 'showVisibility', 'Show Visibility'],
  ['format.show-namespace', 'showNamespace', 'Show Namespace'],
  ['format.show-property', 'showProperty', 'Show Property'],
  ['format.show-type', 'showType', 'Show Type'],
  ['format.show-multiplicity', 'showMultiplicity', 'Show Multiplicity'],
  ['format.show-operation-signature', 'showOperationSignature', 'Show Operation Signature'],
  ['format.suppress-attributes', 'suppressAttributes', 'Suppress Attributes'],
  ['format.suppress-operations', 'suppressOperations', 'Suppress Operations'],
  ['format.suppress-literals', 'suppressLiterals', 'Suppress Literals']
]

function viewsWithField(field: string): View[] {
  return selection().filter((v) => fieldOf(v, field) !== undefined)
}

const ALIGN_LABELS: Record<string, string> = {
  'align-left': 'Align Left',
  'align-right': 'Align Right',
  'align-center': 'Align Center',
  'align-top': 'Align Top',
  'align-bottom': 'Align Bottom',
  'align-middle': 'Align Middle',
  'space-equally-horizontally': 'Space Equally Horizontally',
  'space-equally-vertically': 'Space Equally Vertically',
  'set-width-equally': 'Set Width Equally',
  'set-height-equally': 'Set Height Equally',
  'set-size-equally': 'Set Size Equally'
}

/**
 * Registers the diagram commands. Returns a function that unregisters the ones registered here.
 */
export function registerDiagramCommands(registry: CommandRegistry, ctx: DiagramCommandContext): () => void {
  const disposers: Array<() => void> = []
  const add = (command: CommandDefinition): void => {
    if (!registry.has(command.id)) disposers.push(registry.register(command))
  }
  const hasDiagram = (): boolean => currentDiagram() !== null
  const hasSelection = (): boolean => hasDiagram() && state().selectedViewIds.length > 0

  add({
    id: DiagramCommandIds.selectAll,
    label: 'Select All',
    isEnabled: hasDiagram,
    run: () => {
      if (nativeEdit('selectAll')) return
      const diagram = currentDiagram()
      if (diagram) selectViews(diagram.ownedViews.filter((v) => v.visible !== false).map((v) => v._id))
    }
  })
  add({
    id: DiagramCommandIds.copy,
    label: 'Copy',
    isEnabled: () => isTextFieldFocused() || (hasSelection() && canCopyViewsOf(currentDiagram() as Diagram)),
    run: () => {
      if (!nativeEdit('copy')) copySelection()
    }
  })
  add({
    id: DiagramCommandIds.cut,
    label: 'Cut',
    isEnabled: () => isTextFieldFocused() || (hasSelection() && canCopyViewsOf(currentDiagram() as Diagram)),
    run: () => {
      if (nativeEdit('cut')) return
      if (copySelection()) deleteFromView(state().engine, selection(), 'Cut')
    }
  })
  add({
    id: DiagramCommandIds.paste,
    label: 'Paste',
    isEnabled: () => isTextFieldFocused() || (hasDiagram() && memoryClipboard !== null),
    run: () => {
      if (nativeEdit('paste')) return undefined
      return pasteClipboard()
    }
  })
  add({
    id: DiagramCommandIds.duplicate,
    label: 'Duplicate',
    isEnabled: () => hasSelection() && canCopyViewsOf(currentDiagram() as Diagram),
    run: () => {
      const diagram = currentDiagram()
      if (!diagram) return
      const ids = duplicateViews(state().engine, diagram, state().selectedViewIds)
      if (ids.length > 0) selectViews(ids)
    }
  })

  // Zoom.
  const zoomTo = (z: number): void => {
    const editor = getActiveEditor(state().activeDiagramId)
    if (editor) editor.zoomKeepingCenter(z)
    else ctx.setZoom(z)
  }
  add({ id: DiagramCommandIds.zoomIn, label: 'Zoom In', isEnabled: hasDiagram, run: () => zoomTo(stepZoom(ctx.getZoom(), 1)) })
  add({ id: DiagramCommandIds.zoomOut, label: 'Zoom Out', isEnabled: hasDiagram, run: () => zoomTo(stepZoom(ctx.getZoom(), -1)) })
  add({ id: DiagramCommandIds.actualSize, label: 'Actual Size', isEnabled: hasDiagram, run: () => zoomTo(ZOOM.default) })
  add({
    id: DiagramCommandIds.fitToWindow,
    label: 'Fit to Window',
    isEnabled: hasDiagram,
    run: () => getActiveEditor(state().activeDiagramId)?.fitToWindow()
  })

  // Alignment and z-order.
  for (const op of ALIGN_OPS) {
    add({
      id: `alignment.${op}`,
      label: ALIGN_LABELS[op] ?? op,
      isEnabled: () => selection().filter((v) => isKindOf(v, 'NodeView')).length >= (op.startsWith('space') ? 3 : 2),
      run: () => {
        const diagram = currentDiagram()
        if (diagram) alignViews(envOf(diagram), state().selectedViewIds, op)
      }
    })
  }
  for (const [id, where, label] of [
    [DiagramCommandIds.bringToFront, 'front', 'Bring to Front'],
    [DiagramCommandIds.sendToBack, 'back', 'Send to Back']
  ] as const) {
    add({
      id,
      label,
      isEnabled: hasSelection,
      run: () => {
        const diagram = currentDiagram()
        if (diagram) reorderViews(envOf(diagram), state().selectedViewIds, where)
      }
    })
  }

  // Line styles.
  for (const [id, style, label] of [
    [DiagramCommandIds.lineRectilinear, LineStyle.Rectilinear, 'Rectilinear'],
    [DiagramCommandIds.lineOblique, LineStyle.Oblique, 'Oblique'],
    [DiagramCommandIds.lineRoundRect, LineStyle.RoundedRectilinear, 'Rounded Rectilinear'],
    [DiagramCommandIds.lineCurve, LineStyle.Curve, 'Curve']
  ] as const) {
    add({
      id,
      label,
      isEnabled: () => selection().some((v) => isKindOf(v, 'EdgeView')),
      isChecked: () => lineStyleChecked(style),
      run: () => setLineStyle(style)
    })
  }

  // View format toggles.
  for (const [id, field, label] of FORMAT_TOGGLES) {
    add({
      id,
      label,
      isEnabled: () => viewsWithField(field).length > 0,
      isChecked: () => {
        const views = viewsWithField(field)
        return views.length > 0 && views.every((v) => v[field] === true)
      },
      run: () => {
        const views = viewsWithField(field)
        if (views.length === 0) return
        const next = !views.every((v) => v[field] === true)
        setFieldsOfAll(state().engine, views, { [field]: next }, label)
      }
    })
  }

  // Nudge (arrow keys on the canvas): 1 unit, or one grid step when `step` is passed.
  const nudge = (dx: number, dy: number) => (step?: unknown) => {
    const diagram = currentDiagram()
    if (!diagram) return
    const k = typeof step === 'number' ? step : 1
    moveSelection(envOf(diagram), state().selectedViewIds, dx * k, dy * k)
  }
  add({ id: DiagramCommandIds.nudgeLeft, label: 'Nudge Left', isEnabled: hasSelection, run: nudge(-1, 0) })
  add({ id: DiagramCommandIds.nudgeRight, label: 'Nudge Right', isEnabled: hasSelection, run: nudge(1, 0) })
  add({ id: DiagramCommandIds.nudgeUp, label: 'Nudge Up', isEnabled: hasSelection, run: nudge(0, -1) })
  add({ id: DiagramCommandIds.nudgeDown, label: 'Nudge Down', isEnabled: hasSelection, run: nudge(0, 1) })
  add({
    id: DiagramCommandIds.quickEdit,
    label: 'Quick Edit',
    isEnabled: hasSelection,
    run: () => {
      const id = state().selectedViewIds[0]
      if (id) getActiveEditor(state().activeDiagramId)?.openQuickEdit(id)
    }
  })

  return () => disposers.forEach((d) => d())
}

/** Grid step used for Shift+Arrow nudging. */
export const NUDGE_GRID_STEP = GRID.size
