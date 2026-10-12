/**
 * Interactive diagram editor (spec 02 §7): renders the active diagram as SVG and handles
 * selection, rubber band, move (with snap and re-containment), resize handles, node and edge
 * creation with the current tool, edge bend/segment editing and reconnection, edge label drags,
 * inline (quick) editing, keyboard delete/nudge/tab, pan and zoom.
 *
 * It reads the model from the project store and changes it only through `commands/` operations.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { addAttribute, addEnumerationLiteral, addExtensionPoint, addOperation } from '../../commands'
import { isKindOf, type Diagram, type Elem, type Point, type View } from '../../model'
import { useProjectStore } from '../../store'
import {
  COLORS,
  GRID,
  CANVAS_FIT_PADDING,
  canvasExtent,
  clampZoom,
  edgeAnchor,
  edgeHitCursor,
  handleCursor,
  isRectilinearStyle,
  rectFromPoints,
  resizeByHandle,
  snap,
  snapWithDeadZone,
  stepZoom,
  EdgePosition,
  type HandlePosition,
  type Rect,
  type SegmentOrientation
} from '../core'
import { computeDiagramLayout } from '../layout/layoutDiagram'
import { getTextMeasurer } from '../layout/measurer'
import type { DiagramLayout, EditRegion, EditTarget, NodeDivider } from '../layout/types'
import { DiagramContent } from '../render/DiagramContent'
import { copySelection, pasteClipboard } from '../commands'
import {
  createEdgeBetween,
  createEndpointMessage,
  createNodeAt,
  createTextAt,
  deleteViews,
  findDropContainer,
  isContainmentChange,
  isNodeKind,
  moveAxisOf,
  moveEdgeLabel,
  moveSelection,
  reconnectEnd,
  resizeNode,
  resizeSubView,
  setEdgeVertices,
  type DiagramEnv,
  type ToolSpec
} from './actions'
import { releaseActiveEditor, setActiveEditor, type EditorHandle } from './activeEditor'
import { hitTestDiagram, viewsInBand, type DiagramHit } from './hitTest'
import { DragOverlay, SelectionOverlay, type DragPreview } from './Overlays'
import { applyQuickEdit } from './quickEditApply'
import { QuickEditor, type QuickEditAction, type QuickEditState } from './QuickEditor'

/** The active toolbox tool: a key of `NODE_KINDS` / `EDGE_KINDS` (plus message presets), or null for Select. */
export type ToolSelection = ToolSpec | null

export interface DiagramEditorProps {
  readonly diagramId: string
  readonly tool: ToolSelection
  /** Called after the tool created something (the UI decides whether to revert to Select). */
  readonly onToolUsed: () => void
  /** 0.1..3.0 */
  readonly zoom: number
  readonly onZoomChange: (zoom: number) => void
  readonly showGrid: boolean
  readonly snapToGrid: boolean
}

type Gesture =
  | { type: 'click'; start: Point }
  | { type: 'move'; start: Point; ids: string[]; nodes: View[]; boxes: Rect[]; primary: Rect; moved: boolean; clickedId: string; reselect: boolean; dx: number; dy: number; container: View | null; recontain: boolean; axis: 'horz' | 'vert' | null }
  | { type: 'divider'; start: Point; viewId: string; divider: NodeDivider; y: number; moved: boolean }
  | { type: 'edge-shift'; start: Point; edgeId: string; points: Point[]; dy: number; moved: boolean }
  | { type: 'resize'; start: Point; id: string; handle: HandlePosition; box: Rect; minWidth: number; minHeight: number; keepRatio: boolean; rect: Rect }
  | { type: 'band'; start: Point; additive: boolean; rect: Rect | null }
  | { type: 'create-node'; start: Point; kind: string; rect: Rect }
  | { type: 'create-edge'; start: Point; tool: ToolSpec; tailId: string; from: Point }
  | { type: 'vertex'; start: Point; edgeId: string; index: number; points: Point[]; end: 'tail' | 'head' | null; moved: boolean }
  | { type: 'segment'; start: Point; edgeId: string; index: number; orientation: SegmentOrientation; base: Point[]; points: Point[]; moved: boolean }
  | { type: 'label'; start: Point; edgeId: string; labelViewId: string | null; box: Rect; current: Rect; moved: boolean }
  | { type: 'pan'; startClient: Point; scroll: Point }

const DRAG_THRESHOLD = 3

function isTextInput(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null
  return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.isContentEditable)
}

function edgeMidBox(points: readonly Point[]): Rect {
  const a = points.length > 0 ? edgeAnchor(points, EdgePosition.Middle).anchor : { x: 0, y: 0 }
  return { left: a.x - 60, top: a.y - 10, width: 120, height: 20 }
}

export function DiagramEditor(props: DiagramEditorProps): React.JSX.Element {
  const { diagramId, tool, onToolUsed, zoom, onZoomChange, showGrid, snapToGrid } = props
  const engine = useProjectStore((s) => s.engine)
  const repository = useProjectStore((s) => s.repository)
  const version = useProjectStore((s) => s.version)
  const selectedViewIds = useProjectStore((s) => s.selectedViewIds)
  const select = useProjectStore((s) => s.select)
  const measurer = getTextMeasurer()
  const gridId = useId().replace(/:/g, '')

  const diagramEl = repository.get(diagramId)
  const diagram = isKindOf(diagramEl, 'Diagram') ? (diagramEl as Diagram) : null

  // ---- Layout (recomputed on every model change; unchanged views keep their layout object).
  const previousLayout = useRef<DiagramLayout | null>(null)
  const layout = useMemo(() => {
    if (!diagram) return null
    const next = computeDiagramLayout(diagram, repository, measurer, { previous: previousLayout.current })
    previousLayout.current = next
    return next
    // `version` changes whenever the mutable model changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram, repository, measurer, version])

  // Selection restricted to this diagram's laid-out views.
  const selected = useMemo(
    () => (layout ? selectedViewIds.filter((id) => layout.nodes.has(id) || layout.edges.has(id)) : []),
    [layout, selectedViewIds]
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const env = useMemo<DiagramEnv | null>(() => (diagram ? { engine, diagram, measurer } : null), [engine, diagram, measurer])

  // ---- Refs for event handlers (always current values).
  const scrollRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const live = useRef({ zoom, layout, selected, selectedSet, env, tool, snapToGrid })
  live.current = { zoom, layout, selected, selectedSet, env, tool, snapToGrid }

  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [cursor, setCursor] = useState<string>('default')
  const [editing, setEditing] = useState<QuickEditState | null>(null)
  const [viewport, setViewport] = useState({ width: 800, height: 600 })
  const pendingEdit = useRef<{ viewId: string; elementId?: string } | null>(null)
  // Bumped to run the pending-edit effect even when the layout did not change.
  const [editTick, setEditTick] = useState(0)
  const requestEdit = useCallback((viewId: string, elementId?: string) => {
    pendingEdit.current = elementId ? { viewId, elementId } : { viewId }
    setEditTick((n) => n + 1)
  }, [])
  const pendingScroll = useRef<{ anchor: Point; screen: Point } | null>(null)

  // ---- Viewport size.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => setViewport({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const bounds = layout?.bounds
  const canvasWidth = canvasExtent(bounds ? bounds.left + bounds.width : 0, viewport.width, zoom)
  const canvasHeight = canvasExtent(bounds ? bounds.top + bounds.height : 0, viewport.height, zoom)

  // ---- Coordinates.
  const toDiagram = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    const r = svg?.getBoundingClientRect()
    const z = live.current.zoom
    return r ? { x: (clientX - r.left) / z, y: (clientY - r.top) / z } : { x: 0, y: 0 }
  }, [])

  const snapValue = useCallback((v: number): number => (live.current.snapToGrid ? snap(v, GRID.size) : Math.round(v)), [])

  // ---- Zoom keeping a screen point fixed.
  const zoomAround = useCallback(
    (next: number, screen: Point) => {
      const el = scrollRef.current
      const z = live.current.zoom
      const target = clampZoom(next)
      if (!el || target === z) return
      pendingScroll.current = { anchor: { x: (el.scrollLeft + screen.x) / z, y: (el.scrollTop + screen.y) / z }, screen }
      onZoomChange(target)
    },
    [onZoomChange]
  )

  useLayoutEffect(() => {
    const el = scrollRef.current
    const p = pendingScroll.current
    if (!el || !p) return
    pendingScroll.current = null
    el.scrollLeft = Math.max(0, p.anchor.x * zoom - p.screen.x)
    el.scrollTop = Math.max(0, p.anchor.y * zoom - p.screen.y)
  }, [zoom])

  // Ctrl/Cmd + wheel zoom around the cursor (non-passive listener so the page does not zoom/scroll).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const z = live.current.zoom
      const next = Math.abs(e.deltaY) >= 40 ? stepZoom(z, e.deltaY < 0 ? 1 : -1) : z * Math.exp(-e.deltaY * 0.01)
      zoomAround(next, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // ---- Quick edit.
  const openRegion = useCallback((viewId: string, region: EditRegion) => {
    setEditing({ viewId, target: region.target, box: region.box, text: region.text, font: region.font, multiline: region.multiline === true })
  }, [])

  const openQuickEdit = useCallback(
    (viewId: string, elementId?: string): boolean => {
      const l = live.current.layout
      if (!l) return false
      const node = l.nodes.get(viewId)
      if (node) {
        const region = elementId
          ? node.regions.find((r) => 'elementId' in r.target && r.target.elementId === elementId)
          : node.regions[0]
        if (region) openRegion(viewId, region)
        return region !== undefined
      }
      const edge = l.edges.get(viewId)
      const view = repository.get(viewId) as View | undefined
      if (!edge || !view) return false
      const label = edge.labels.find((lb) => lb.edit && (!elementId || ('elementId' in lb.edit && lb.edit.elementId === elementId)))
      if (label?.edit) {
        openRegion(viewId, { box: label.box, target: label.edit, text: label.editText ?? label.text, font: label.font })
        return true
      }
      if (view.model && edge.points.length > 0) {
        openRegion(viewId, { box: edgeMidBox(edge.points), target: { kind: 'name', elementId: view.model._id }, text: String(view.model['name'] ?? ''), font: edge.style.font })
        return true
      }
      return false
    },
    [openRegion, repository]
  )

  // Open a quick edit requested before the layout contained its target.
  useEffect(() => {
    const p = pendingEdit.current
    if (!p || !layout) return
    pendingEdit.current = null
    openQuickEdit(p.viewId, p.elementId)
  }, [layout, openQuickEdit, editTick])

  const regionsInOrder = useCallback((viewId: string): EditRegion[] => live.current.layout?.nodes.get(viewId)?.regions.slice() ?? [], [])

  const commitEdit = useCallback(
    (text: string, action: QuickEditAction): boolean => {
      const current = editing
      if (!current) return true
      const unchanged = text === current.text
      if (!unchanged && !applyQuickEdit(engine, current.target, text)) return false
      setEditing(null)
      const target = current.target
      const view = repository.get(current.viewId) as View | undefined
      const classifierId = 'classifierId' in target ? target.classifierId : target.kind === 'name' && isKindOf(view?.model, 'UMLClassifier') ? view?.model?._id : undefined
      const classifier = classifierId ? repository.get(classifierId) : undefined
      if ((action === 'add-item' || action === 'add-operation') && classifier && view) {
        const added: { el: Elem | null } = { el: null }
        engine.transact(action === 'add-operation' ? 'Add Operation' : 'Add Attribute', (b) => {
          if (action === 'add-operation') {
            added.el = addOperation(engine, classifier)
            if (view['suppressOperations'] === true) b.set(view, 'suppressOperations', false)
          } else if (target.kind === 'literal' || (isKindOf(classifier, 'UMLEnumeration') && target.kind === 'name')) {
            added.el = addEnumerationLiteral(engine, classifier)
            if (view['suppressLiterals'] === true) b.set(view, 'suppressLiterals', false)
          } else if (isKindOf(classifier, 'UMLUseCase') && target.kind === 'name') {
            // Use case name or extension point row: add an extension point.
            added.el = addExtensionPoint(engine, classifier)
          } else {
            added.el = addAttribute(engine, classifier)
            if (view['suppressAttributes'] === true) b.set(view, 'suppressAttributes', false)
          }
        })
        if (added.el) requestEdit(current.viewId, added.el._id)
      } else if (action === 'previous' || action === 'next') {
        const regions = regionsInOrder(current.viewId)
        const key = (t: EditTarget): string => ('elementId' in t ? t.elementId : t.viewId)
        const i = regions.findIndex((r) => key(r.target) === key(target))
        const next = regions[i + (action === 'next' ? 1 : -1)]
        if (next && 'elementId' in next.target) requestEdit(current.viewId, next.target.elementId)
        else if (next) openRegion(current.viewId, next)
      }
      scrollRef.current?.focus({ preventScroll: true })
      return true
    },
    [editing, engine, repository, regionsInOrder, openRegion, requestEdit]
  )

  const cancelEdit = useCallback(() => {
    setEditing(null)
    scrollRef.current?.focus({ preventScroll: true })
  }, [])

  // ---- Active editor handle (commands: fit, paste position, quick edit, zoom).
  const handle = useMemo<EditorHandle>(
    () => ({
      diagramId,
      viewportCenter() {
        const el = scrollRef.current
        const z = live.current.zoom
        return el ? { x: (el.scrollLeft + el.clientWidth / 2) / z, y: (el.scrollTop + el.clientHeight / 2) / z } : { x: 200, y: 200 }
      },
      zoomKeepingCenter(next: number) {
        const el = scrollRef.current
        zoomAround(next, el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 })
      },
      fitToWindow() {
        const el = scrollRef.current
        const b = live.current.layout?.bounds
        if (!el || !b) return
        const z = clampZoom(Math.min(1, (el.clientWidth - 20) / (b.left + b.width + CANVAS_FIT_PADDING), (el.clientHeight - 20) / (b.top + b.height + CANVAS_FIT_PADDING)))
        pendingScroll.current = { anchor: { x: 0, y: 0 }, screen: { x: 0, y: 0 } }
        if (z === live.current.zoom) {
          el.scrollLeft = 0
          el.scrollTop = 0
        } else onZoomChange(z)
      },
      openQuickEdit(viewId: string) {
        openQuickEdit(viewId)
      },
      focus() {
        scrollRef.current?.focus({ preventScroll: true })
      }
    }),
    [diagramId, zoomAround, onZoomChange, openQuickEdit]
  )

  useEffect(() => {
    setActiveEditor(handle)
    return () => releaseActiveEditor(handle)
  }, [handle])

  // ---- Selection helpers.
  const setSelection = useCallback((ids: readonly string[]) => select({ views: ids }), [select])

  // ---- Pointer handling.
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    const { layout: l, env: en, selectedSet: sel, selected: selIds, tool: t, zoom: z } = live.current
    if (!l || !en) return
    scrollRef.current?.focus({ preventScroll: true })
    setActiveEditor(handle)
    const p = toDiagram(e.clientX, e.clientY)
    const mod = e.metaKey || e.ctrlKey
    const el = scrollRef.current

    // Pan: middle button, Space+drag, or Mod+drag on empty canvas.
    const hit = hitTestDiagram(l, p, { selected: sel, zoom: z })
    if (e.button === 1 || (e.button === 0 && (spaceDown.current || (mod && !hit && !t)))) {
      if (el) gesture.current = { type: 'pan', startClient: { x: e.clientX, y: e.clientY }, scroll: { x: el.scrollLeft, y: el.scrollTop } }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (e.button === 2) {
      // Right-click selects the view under the pointer (if not selected) for the context menu.
      const id = hit && hit.kind !== 'handle' ? hit.viewId : null
      if (!id) setSelection([])
      else if (!sel.has(id)) setSelection([id])
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (t) {
      if (isNodeKind(t.kind)) {
        const start = { x: snapValue(p.x), y: snapValue(p.y) }
        gesture.current = { type: 'create-node', start, kind: t.kind, rect: { left: start.x, top: start.y, width: 0, height: 0 } }
      } else if (t.freeEnd === 'tail') {
        // Found message: starts on empty canvas, ends on a lifeline.
        gesture.current = { type: 'create-edge', start: p, tool: t, tailId: '', from: p }
        setPreview({ kind: 'line', from: p, to: p })
      } else {
        const target = hitTestDiagram(l, p, { selected: new Set(), zoom: z, nodesOnly: true })
        if (target) {
          const box = l.nodes.get(target.viewId)?.box
          const from = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : p
          if (t.selfConnection) {
            const id = createEdgeBetween(en, l, t, target.viewId, target.viewId, p)
            if (id) {
              setSelection([id])
              onToolUsed()
              if ((repository.get(id) as View | undefined)?.model) requestEdit(id)
            }
            return
          }
          gesture.current = { type: 'create-edge', start: p, tool: t, tailId: target.viewId, from }
          setPreview({ kind: 'line', from, to: p })
        }
      }
      return
    }

    if (!hit) {
      gesture.current = { type: 'band', start: p, additive: e.shiftKey || mod, rect: null }
      return
    }
    // Edges that move along one axis (sequence messages): dragging shifts the whole edge.
    const shiftEdge = hit.kind === 'edge' || hit.kind === 'edge-segment' || (hit.kind === 'edge-vertex' && !hit.isEnd) ? l.edges.get(hit.viewId) : undefined
    if (shiftEdge?.dragAxis === 'vert' && !e.shiftKey && !mod) {
      if (!sel.has(hit.viewId)) setSelection([hit.viewId])
      gesture.current = { type: 'edge-shift', start: p, edgeId: hit.viewId, points: shiftEdge.points.map((q) => ({ ...q })), dy: 0, moved: false }
      return
    }
    switch (hit.kind) {
      case 'divider': {
        const divider = l.nodes.get(hit.viewId)?.dividers?.[hit.index]
        if (divider) gesture.current = { type: 'divider', start: p, viewId: hit.viewId, divider, y: divider.y, moved: false }
        return
      }
      case 'handle': {
        const node = l.nodes.get(hit.viewId)
        if (!node) return
        gesture.current = {
          type: 'resize',
          start: p,
          id: hit.viewId,
          handle: hit.handle,
          box: node.box,
          minWidth: node.minWidth,
          minHeight: node.minHeight,
          keepRatio: node.sizable === 'ratio',
          rect: node.box
        }
        return
      }
      case 'edge-vertex': {
        const edge = l.edges.get(hit.viewId)
        if (!edge) return
        const n = edge.points.length
        gesture.current = {
          type: 'vertex',
          start: p,
          edgeId: hit.viewId,
          index: hit.index,
          points: edge.points.map((q) => ({ ...q })),
          end: hit.isEnd ? (hit.index === 0 ? 'tail' : hit.index === n - 1 ? 'head' : null) : null,
          moved: false
        }
        return
      }
      case 'edge-segment': {
        const edge = l.edges.get(hit.viewId)
        if (!edge) return
        if (isRectilinearStyle(edge.lineStyle)) {
          gesture.current = { type: 'segment', start: p, edgeId: hit.viewId, index: hit.index, orientation: hit.orientation, base: edge.points.map((q) => ({ ...q })), points: [...edge.points], moved: false }
        } else {
          // Dragging the middle of a segment inserts a bend point there.
          const points = edge.points.map((q) => ({ ...q }))
          points.splice(hit.index + 1, 0, { x: Math.round(p.x), y: Math.round(p.y) })
          gesture.current = { type: 'vertex', start: p, edgeId: hit.viewId, index: hit.index + 1, points, end: null, moved: false }
        }
        return
      }
      case 'edge-label': {
        if (!sel.has(hit.viewId)) setSelection([hit.viewId])
        gesture.current = { type: 'label', start: p, edgeId: hit.viewId, labelViewId: hit.label.viewId, box: hit.label.box, current: hit.label.box, moved: false }
        return
      }
      case 'edge': {
        if (e.shiftKey || mod) setSelection(sel.has(hit.viewId) ? selIds.filter((id) => id !== hit.viewId) : [...selIds, hit.viewId])
        else if (!sel.has(hit.viewId)) setSelection([hit.viewId])
        gesture.current = { type: 'click', start: p }
        return
      }
      case 'node': {
        let ids: string[]
        let reselect = false
        if (e.shiftKey || mod) {
          ids = sel.has(hit.viewId) ? selIds.filter((id) => id !== hit.viewId) : [...selIds, hit.viewId]
          setSelection(ids)
          if (sel.has(hit.viewId)) {
            gesture.current = { type: 'click', start: p }
            return
          }
        } else if (!sel.has(hit.viewId)) {
          ids = [hit.viewId]
          setSelection(ids)
        } else {
          ids = selIds
          reselect = selIds.length > 1
        }
        const nodes = ids.map((id) => repository.get(id)).filter((v): v is View => isKindOf(v, 'NodeView'))
        const movable = nodes.filter((v) => l.nodes.get(v._id)?.movable !== false)
        const boxes = movable.map((v) => l.nodes.get(v._id)?.box).filter((b): b is Rect => b !== undefined)
        const primary = l.nodes.get(hit.viewId)?.box ?? boxes[0]
        if (!primary || movable.length === 0) {
          gesture.current = { type: 'click', start: p }
          return
        }
        gesture.current = {
          type: 'move',
          start: p,
          ids: ids.filter((id) => movable.some((v) => v._id === id) || l.edges.has(id)),
          nodes: movable,
          boxes,
          primary,
          moved: false,
          clickedId: hit.viewId,
          reselect,
          dx: 0,
          dy: 0,
          container: null,
          recontain: false,
          axis: moveAxisOf(l, movable.map((v) => v._id))
        }
        return
      }
    }
  }

  const updateHoverCursor = (p: Point): void => {
    const { layout: l, selectedSet: sel, zoom: z, tool: t } = live.current
    if (!l) return
    if (t) return setCursor('crosshair')
    if (spaceDown.current) return setCursor('grab')
    const hit = hitTestDiagram(l, p, { selected: sel, zoom: z })
    let c = 'default'
    if (hit?.kind === 'handle') c = handleCursor(hit.handle)
    else if (hit?.kind === 'divider' || ((hit?.kind === 'edge' || hit?.kind === 'edge-segment') && sel.has(hit.viewId) && l.edges.get(hit.viewId)?.dragAxis === 'vert')) c = 'ns-resize'
    else if (hit?.kind === 'edge-vertex') c = edgeHitCursor({ kind: 'vertex', index: hit.index, isEnd: hit.isEnd })
    else if (hit?.kind === 'edge-segment') {
      const edge = l.edges.get(hit.viewId)
      c = edge && !isRectilinearStyle(edge.lineStyle) ? 'crosshair' : edgeHitCursor({ kind: 'segment', index: hit.index, orientation: hit.orientation })
    } else if (hit?.kind === 'node' && sel.has(hit.viewId)) c = 'move'
    else if (hit?.kind === 'edge-label') c = 'move'
    if (c !== cursor) setCursor(c)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const g = gesture.current
    const p = toDiagram(e.clientX, e.clientY)
    if (!g) {
      updateHoverCursor(p)
      return
    }
    const { layout: l, env: en, snapToGrid: snapOn } = live.current
    if (!l || !en) return
    switch (g.type) {
      case 'pan': {
        const el = scrollRef.current
        if (el) {
          el.scrollLeft = g.scroll.x - (e.clientX - g.startClient.x)
          el.scrollTop = g.scroll.y - (e.clientY - g.startClient.y)
        }
        return
      }
      case 'click':
        return
      case 'move': {
        const rawDx = p.x - g.start.x
        const rawDy = p.y - g.start.y
        if (!g.moved && Math.hypot(rawDx, rawDy) * live.current.zoom < DRAG_THRESHOLD) return
        g.moved = true
        const grid = snapOn ? GRID.size : 1
        g.dx = g.axis === 'vert' ? 0 : snapWithDeadZone(g.primary.left, g.primary.left + rawDx, grid) - g.primary.left
        g.dy = g.axis === 'horz' ? 0 : snapWithDeadZone(g.primary.top, g.primary.top + rawDy, grid) - g.primary.top
        const container = findDropContainer(en, l, p, g.nodes)
        g.container = container
        g.recontain = isContainmentChange(g.nodes, container)
        setPreview({
          kind: 'boxes',
          rects: g.boxes.map((b) => ({ ...b, left: b.left + g.dx, top: b.top + g.dy })),
          container: g.recontain && container ? (l.nodes.get(container._id)?.box ?? null) : null
        })
        return
      }
      case 'divider': {
        if (!g.moved && Math.abs(p.y - g.start.y) * live.current.zoom < DRAG_THRESHOLD) return
        g.moved = true
        const raw = g.divider.y + p.y - g.start.y
        g.y = Math.min(g.divider.maxY, Math.max(g.divider.minY, snapOn ? snap(raw, GRID.size) : Math.round(raw)))
        setPreview({ kind: 'polyline', points: [{ x: g.divider.left, y: g.y }, { x: g.divider.left + g.divider.width, y: g.y }] })
        return
      }
      case 'edge-shift': {
        if (!g.moved && Math.abs(p.y - g.start.y) * live.current.zoom < DRAG_THRESHOLD) return
        g.moved = true
        const y0 = g.points[0]?.y ?? 0
        g.dy = (snapOn ? snap(y0 + p.y - g.start.y, GRID.size) : Math.round(y0 + p.y - g.start.y)) - y0
        setPreview({ kind: 'polyline', points: g.points.map((q) => ({ x: q.x, y: q.y + g.dy })) })
        return
      }
      case 'resize': {
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        let r = resizeByHandle(g.box, g.handle, dx, dy, { minWidth: g.minWidth, minHeight: g.minHeight, keepRatio: g.keepRatio })
        if (snapOn && !g.keepRatio) r = snapResized(r, g.box, g.handle, g.minWidth, g.minHeight)
        g.rect = r
        setPreview({ kind: 'boxes', rects: [r] })
        return
      }
      case 'band': {
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) * live.current.zoom < DRAG_THRESHOLD && !g.rect) return
        g.rect = rectFromPoints(g.start, p)
        setPreview({ kind: 'band', rect: g.rect })
        return
      }
      case 'create-node': {
        const end = { x: snapValue(p.x), y: snapValue(p.y) }
        g.rect = rectFromPoints(g.start, end)
        if (g.rect.width > 0 || g.rect.height > 0) setPreview({ kind: 'boxes', rects: [g.rect] })
        return
      }
      case 'create-edge':
        setPreview({ kind: 'line', from: g.from, to: p })
        return
      case 'vertex': {
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) * live.current.zoom < DRAG_THRESHOLD) return
        g.moved = true
        const q = g.end ? p : { x: snapOn ? snap(p.x, GRID.size) : Math.round(p.x), y: snapOn ? snap(p.y, GRID.size) : Math.round(p.y) }
        g.points[g.index] = q
        setPreview({ kind: 'polyline', points: [...g.points] })
        return
      }
      case 'segment': {
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) * live.current.zoom < DRAG_THRESHOLD) return
        g.moved = true
        const pts = g.base.map((q) => ({ ...q }))
        const a = pts[g.index] as Point
        const b = pts[g.index + 1] as Point
        if (g.orientation === 'horizontal') {
          const y = snapOn ? snap(a.y + (p.y - g.start.y), GRID.size) : Math.round(a.y + (p.y - g.start.y))
          pts[g.index] = { x: a.x, y }
          pts[g.index + 1] = { x: b.x, y }
        } else {
          const x = snapOn ? snap(a.x + (p.x - g.start.x), GRID.size) : Math.round(a.x + (p.x - g.start.x))
          pts[g.index] = { x, y: a.y }
          pts[g.index + 1] = { x, y: b.y }
        }
        // Keep the ends attached: an end segment that moved gets a connecting vertex.
        if (g.index === 0) pts.splice(1, 0, { ...(g.base[0] as Point), ...(g.orientation === 'horizontal' ? { y: (pts[0] as Point).y } : { x: (pts[0] as Point).x }) })
        if (g.index + 1 === g.base.length - 1) pts.push({ ...(g.base[g.base.length - 1] as Point) })
        g.points = pts
        setPreview({ kind: 'polyline', points: pts })
        return
      }
      case 'label': {
        g.moved = true
        g.current = { ...g.box, left: Math.round(g.box.left + p.x - g.start.x), top: Math.round(g.box.top + p.y - g.start.y) }
        setPreview({ kind: 'boxes', rects: [g.current] })
        return
      }
    }
  }

  const finishGesture = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean): void => {
    const g = gesture.current
    gesture.current = null
    setPreview(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const { layout: l, env: en, selected: selIds } = live.current
    if (!g || !l || !en || cancelled) return
    const p = toDiagram(e.clientX, e.clientY)
    switch (g.type) {
      case 'move':
        if (g.moved) moveSelection(en, g.ids, g.dx, g.dy, g.recontain ? { container: g.container } : undefined)
        else if (g.reselect) setSelection([g.clickedId])
        return
      case 'resize':
        if (g.rect !== g.box) resizeNode(en, g.id, g.rect)
        return
      case 'divider':
        if (g.moved) resizeSubView(en, g.divider.viewId, g.y - g.divider.top)
        return
      case 'edge-shift':
        if (g.moved && g.dy !== 0) moveSelection(en, [g.edgeId], 0, g.dy)
        return
      case 'band': {
        if (!g.rect) {
          if (!g.additive) setSelection([])
          return
        }
        const ids = viewsInBand(l, g.rect)
        setSelection(g.additive ? [...new Set([...selIds, ...ids])] : ids)
        return
      }
      case 'create-node': {
        const id = createNodeAt(en, l, g.kind as never, g.rect)
        if (id) {
          setSelection([id])
          onToolUsed()
          requestEdit(id)
        } else console.warn(`${g.kind} cannot be placed here.`)
        return
      }
      case 'create-edge': {
        const target = hitTestDiagram(l, p, { selected: new Set(), zoom: live.current.zoom, nodesOnly: true })
        if (g.tool.freeEnd) {
          // Found message (free tail, lifeline at the release point) or lost message (free head).
          const id =
            g.tool.freeEnd === 'tail'
              ? target
                ? createEndpointMessage(en, l, g.tool, target.viewId, g.start, g.start.y)
                : null
              : target
                ? null
                : createEndpointMessage(en, l, g.tool, g.tailId, p, g.start.y)
          if (id) {
            setSelection([id])
            onToolUsed()
            requestEdit(id)
          } else console.warn(`Invalid connection (${g.tool.kind})`)
          return
        }
        const id = target ? createEdgeBetween(en, l, g.tool, g.tailId, target.viewId, g.start) : null
        if (id) {
          setSelection([id])
          onToolUsed()
          const view = repository.get(id) as View | undefined
          if (view?.model) requestEdit(id)
        } else if (target) console.warn(`Invalid connection (${g.tool.kind})`)
        return
      }
      case 'vertex': {
        if (!g.moved) return
        if (g.end) {
          const target = hitTestDiagram(l, p, { selected: new Set(), zoom: live.current.zoom, nodesOnly: true })
          if (target) reconnectEnd(en, g.edgeId, g.end, target.viewId)
          return
        }
        setEdgeVertices(en, g.edgeId, g.points)
        return
      }
      case 'segment':
        if (g.moved) setEdgeVertices(en, g.edgeId, g.points)
        return
      case 'label':
        if (g.moved && g.labelViewId) moveEdgeLabel(en, l, g.edgeId, g.labelViewId, g.current)
        return
      default:
        return
    }
  }

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const { layout: l, env: en, selectedSet: sel, zoom: z, tool: t } = live.current
    if (!l || !en || t) return
    const p = toDiagram(e.clientX, e.clientY)
    const hit: DiagramHit | null = hitTestDiagram(l, p, { selected: sel, zoom: z })
    if (!hit) {
      const id = createTextAt(en, { x: snapValue(p.x), y: snapValue(p.y) })
      if (id) {
        setSelection([id])
        requestEdit(id)
      }
      return
    }
    if (hit.kind === 'node') {
      if (hit.region) openRegion(hit.viewId, hit.region)
      else openQuickEdit(hit.viewId)
    } else if (hit.kind === 'edge-label') {
      const label = hit.label
      if (label.edit) openRegion(hit.viewId, { box: label.box, target: label.edit, text: label.editText ?? label.text, font: label.font })
    } else if (hit.kind === 'edge' || hit.kind === 'edge-segment' || hit.kind === 'edge-vertex') {
      openQuickEdit(hit.viewId)
    }
  }

  // ---- Keyboard (canvas focused).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.defaultPrevented || isTextInput(e.target)) return
    const { env: en, selected: selIds, layout: l } = live.current
    if (!en || !l) return
    const mod = e.metaKey || e.ctrlKey
    if (e.key === ' ') {
      spaceDown.current = true
      setCursor('grab')
      e.preventDefault()
      return
    }
    if (e.key === 'Escape') {
      if (gesture.current) {
        gesture.current = null
        setPreview(null)
        e.preventDefault()
      }
      return
    }
    if (mod) {
      const key = e.key.toLowerCase()
      if (key === 'a') {
        setSelection(l.order.filter((id) => l.nodes.has(id) || l.edges.has(id)))
      } else if (key === 'c') {
        copySelection()
      } else if (key === 'x') {
        if (copySelection()) deleteViews(en, selIds)
      } else if (key === 'v') {
        void pasteClipboard()
      } else return
      e.preventDefault()
      return
    }
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (selIds.length > 0) deleteViews(en, selIds)
        break
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (selIds.length === 0) return
        const step = e.shiftKey ? GRID.size : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        moveSelection(en, selIds, dx, dy)
        break
      }
      case 'Enter':
        if (selIds[0]) openQuickEdit(selIds[0])
        break
      case 'Tab': {
        const order = l.order
        if (order.length === 0) return
        const last = selIds[selIds.length - 1]
        const i = last ? order.indexOf(last) : -1
        const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length]
        if (next) setSelection([next])
        break
      }
      default:
        return
    }
    e.preventDefault()
  }

  const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === ' ') {
      spaceDown.current = false
      setCursor('default')
    }
  }

  if (!diagram || !layout) {
    return <div className="ou-diagram-editor ou-diagram-editor--empty">Diagram not found.</div>
  }

  const width = canvasWidth * zoom
  const height = canvasHeight * zoom
  const effectiveCursor = gesture.current?.type === 'pan' ? 'grabbing' : tool ? 'crosshair' : cursor

  return (
    <div
      ref={scrollRef}
      className="ou-diagram-editor"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={() => setActiveEditor(handle)}
      style={{ position: 'relative', overflow: 'auto', width: '100%', height: '100%', outline: 'none', background: COLORS.background }}
    >
      <div style={{ position: 'relative', width, height }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', cursor: effectiveCursor, userSelect: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishGesture(e, false)}
          onPointerCancel={(e) => finishGesture(e, true)}
          onDoubleClick={onDoubleClick}
        >
          <g transform={`scale(${zoom})`}>
            {showGrid && (
              <>
                <defs>
                  <pattern id={gridId} width={GRID.size * GRID.lineEvery} height={GRID.size * GRID.lineEvery} patternUnits="userSpaceOnUse">
                    <path
                      d={`M${GRID.size * GRID.lineEvery} 0 L0 0 L0 ${GRID.size * GRID.lineEvery}`}
                      fill="none"
                      stroke={GRID.color}
                      strokeWidth={1 / zoom}
                    />
                  </pattern>
                </defs>
                <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill={`url(#${gridId})`} pointerEvents="none" />
              </>
            )}
            <DiagramContent layout={layout} />
            <SelectionOverlay layout={layout} selected={selected} zoom={zoom} />
            <DragOverlay preview={preview} zoom={zoom} />
          </g>
        </svg>
        {editing && <QuickEditor key={`${editing.viewId}:${JSON.stringify(editing.target)}`} state={editing} zoom={zoom} onCommit={commitEdit} onCancel={cancelEdit} />}
      </div>
    </div>
  )
}

/** Snaps the moving sides of a resized box to the grid, keeping the minimum size. */
function snapResized(r: Rect, original: Rect, handle: HandlePosition, minW: number, minH: number): Rect {
  let left = r.left
  let top = r.top
  let right = r.left + r.width
  let bottom = r.top + r.height
  const origRight = original.left + original.width
  const origBottom = original.top + original.height
  if (handle.includes('w')) left = Math.min(snap(left, GRID.size), origRight - minW)
  if (handle.includes('e')) right = Math.max(snap(right, GRID.size), original.left + minW)
  if (handle.includes('n')) top = Math.min(snap(top, GRID.size), origBottom - minH)
  if (handle.includes('s')) bottom = Math.max(snap(bottom, GRID.size), original.top + minH)
  return { left, top, width: right - left, height: bottom - top }
}

