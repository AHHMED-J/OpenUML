/**
 * Compact layout of a role activity diagram (Diagram > Compact Layout): takes the dead space out
 * of a drawing without changing its order.
 *
 * - Vertically, symbols are grouped in rows (centers within a few units of each other, across all
 *   roles), and the gap between consecutive rows shrinks toward one step (`RAD_STEP`), never below
 *   what the labels of the two rows need. Whole rows move, so interaction links stay level and the
 *   branches of a refinement stay on its row; nothing changes order.
 * - Roles then take the height (and width) of their content, and side-by-side roles close up to
 *   `RAD_ROLE_GAP` apart, keeping room for stubs reaching outside them.
 * - Bend points, notes and anything else on the diagram follow the same (piecewise) shifts.
 *
 * One undoable step. A drawing with overlapping symbols is left as it is, and so is the result
 * if it would make two things overlap that did not before.
 */
import { isKindOf, type EdgeView, type Elem, type NodeView, type View } from '../../model'
import type { Rect } from '../core'
import { layoutOf, withGeometry, type DiagramEnv } from '../editor/actions'
import type { DiagramLayout, NodeLayout } from '../layout/types'
import { radRoleOf } from './look'

/** Distance between consecutive steps after compacting. */
export const RAD_STEP = 42
/** Gap between side-by-side roles after compacting. */
export const RAD_ROLE_GAP = 28
/** Centers closer than this (vertically) are one row. */
const ROW_TOLERANCE = 6
/** Room kept between the labels of two consecutive rows. */
const ROW_MARGIN = 6

export type CompactOutcome = { readonly ok: true; readonly changed: boolean } | { readonly ok: false; readonly reason: string }

const OVERLAPPING_SYMBOLS = 'Some symbols overlap: move them apart, then compact the diagram again.'
const UNSAFE_RESULT = 'Compacting this diagram would make some elements overlap, so it was left as it is.'

interface Item {
  readonly view: NodeView
  readonly node: NodeLayout
  /** The role view it sits in (null for a role view itself or a view outside any role). */
  readonly role: NodeView | null
}

function bottomOf(r: Rect): number {
  return r.top + r.height
}

function rightOf(r: Rect): number {
  return r.left + r.width
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < rightOf(b) - 0.5 && b.left < rightOf(a) - 0.5 && a.top < bottomOf(b) - 0.5 && b.top < bottomOf(a) - 0.5
}

/** What a node draws: its box and what reaches outside it (labels, stubs). */
function rectsOf(node: NodeLayout): Rect[] {
  return [node.box, ...(node.extraBounds ?? [])].filter((r) => r.width > 0 || r.height > 0)
}

function span(rects: readonly Rect[]): { top: number; bottom: number; left: number; right: number } {
  return {
    top: Math.min(...rects.map((r) => r.top)),
    bottom: Math.max(...rects.map(bottomOf)),
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map(rightOf))
  }
}

/** Piecewise-linear map through `anchors` (sorted by `from`), constant shift beyond the ends. */
function pieceMap(anchors: ReadonlyArray<{ from: number; to: number }>): (v: number) => number {
  return (v) => {
    const first = anchors[0]
    const last = anchors[anchors.length - 1]
    if (!first || !last) return v
    if (v <= first.from) return v + (first.to - first.from)
    if (v >= last.from) return v + (last.to - last.from)
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1] as { from: number; to: number }
      const b = anchors[i] as { from: number; to: number }
      if (v <= b.from) return b.from === a.from ? b.to : a.to + ((v - a.from) * (b.to - a.to)) / (b.from - a.from)
    }
    return v
  }
}

function itemsOf(env: DiagramEnv, layout: DiagramLayout): { roles: Item[]; symbols: Item[]; others: Item[] } {
  const repo = env.engine.repository
  const roleViews = new Map<Elem, NodeView>()
  for (const [id, node] of layout.nodes) {
    const v = repo.get(id) as NodeView | undefined
    if (v && node.viewType === 'RADRoleView' && v.model) roleViews.set(v.model, v)
  }
  const roles: Item[] = []
  const symbols: Item[] = []
  const others: Item[] = []
  for (const [id, node] of layout.nodes) {
    const view = repo.get(id) as NodeView | undefined
    if (!view) continue
    if (node.viewType === 'RADRoleView') {
      roles.push({ view, node, role: null })
      continue
    }
    const container = view.containerView
    const role = container && container._type === 'RADRoleView' ? (container as NodeView) : (roleViews.get(radRoleOf(view) as Elem) ?? null)
    if (role && view._type.startsWith('RAD')) symbols.push({ view, node, role })
    else others.push({ view, node, role: null })
  }
  return { roles, symbols, others }
}

function overlappingPairs(items: readonly Item[]): Set<string> {
  const pairs = new Set<string>()
  const rects = items.map((it) => rectsOf(it.node))
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = rects[i] as Rect[]
      const b = rects[j] as Rect[]
      if (a.some((ra) => b.some((rb) => overlaps(ra, rb)))) pairs.add([(items[i] as Item).view._id, (items[j] as Item).view._id].sort().join('|'))
    }
  }
  return pairs
}

/** Symbols whose drawn shapes (not their labels) lie on top of each other. */
function hasOverlappingSymbols(symbols: readonly Item[]): boolean {
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (overlaps((symbols[i] as Item).node.box, (symbols[j] as Item).node.box)) return true
    }
  }
  return false
}

interface Row {
  readonly ref: number
  readonly items: Item[]
  above: number
  below: number
}

/** Rows of symbols by their center, top to bottom. */
function rowsOf(symbols: readonly Item[]): Row[] {
  const sorted = [...symbols].sort((a, b) => centerY(a) - centerY(b))
  const rows: Row[] = []
  let current: Row | null = null
  let lastY = -Infinity
  for (const it of sorted) {
    const y = centerY(it)
    if (!current || y - lastY > ROW_TOLERANCE) {
      current = { ref: y, items: [], above: 0, below: 0 }
      rows.push(current)
    }
    current.items.push(it)
    lastY = y
    const s = span(rectsOf(it.node))
    current.above = Math.max(current.above, current.ref - s.top)
    current.below = Math.max(current.below, s.bottom - current.ref)
  }
  return rows
}

function centerY(it: Item): number {
  return it.node.box.top + it.node.box.height / 2
}

function moveNode(b: { setAll(el: Elem, values: Record<string, unknown>): void }, view: NodeView, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  b.setAll(view, { left: Math.round(view.left + dx), top: Math.round(view.top + dy) })
}

/**
 * Compacts the RAD diagram of `env` (see the module comment). Returns whether it changed, or why
 * it was left as it is.
 */
export function compactRadDiagram(env: DiagramEnv): CompactOutcome {
  if (!isKindOf(env.diagram, 'RADDiagram')) return { ok: false, reason: 'Only role activity diagrams can be compacted.' }
  const before = layoutOf(env)
  const first = itemsOf(env, before)
  if (first.symbols.length === 0 && first.roles.length === 0) return { ok: true, changed: false }
  if (hasOverlappingSymbols(first.symbols)) return { ok: false, reason: OVERLAPPING_SYMBOLS }
  const everything = [...first.roles, ...first.symbols, ...first.others]
  const overlapBefore = overlappingPairs(everything)
  const repo = env.engine.repository
  const start = geometryOf(env)
  try {
    withGeometry(env, 'Compact Layout', (b) => {
      // 1. Rows closer together.
      const rows = rowsOf(first.symbols)
      const yAnchors: Array<{ from: number; to: number }> = []
      let y = rows[0]?.ref ?? 0
      rows.forEach((row, i) => {
        if (i > 0) {
          const prev = rows[i - 1] as Row
          const gap = row.ref - prev.ref
          const need = prev.below + row.above + ROW_MARGIN
          y += Math.min(gap, Math.max(RAD_STEP, Math.ceil(need)))
        }
        yAnchors.push({ from: row.ref, to: y })
        for (const it of row.items) moveNode(b, it.view, 0, y - row.ref)
      })
      const mapY = pieceMap(yAnchors)

      // 2. Each role fits its content: a zero size at the content's middle lets the role
      //    layout grow it to exactly what it holds (header and padding included).
      const afterRows = layoutOf(env)
      for (const role of first.roles) {
        const inside = first.symbols.filter((s) => s.role === role.view).map((s) => afterRows.nodes.get(s.view._id)).filter((n): n is NodeLayout => !!n)
        if (inside.length === 0) {
          // An empty role keeps its size and follows the rows.
          b.setAll(role.view, { top: Math.round(mapY(role.view.top)) })
          continue
        }
        const s = span(inside.map((n) => n.box))
        b.setAll(role.view, { left: Math.round((s.left + s.right) / 2), top: Math.round((s.top + s.bottom) / 2), width: 0, height: 0 })
      }
      const fitted = layoutOf(env)
      for (const role of first.roles) {
        const n = fitted.nodes.get(role.view._id)
        if (n) b.setAll(role.view, { left: n.box.left, top: n.box.top, width: n.box.width, height: n.box.height })
      }

      // 3. Side-by-side roles close up (left to right), keeping room for what reaches out of them.
      const extents = first.roles
        .map((role) => {
          const n = fitted.nodes.get(role.view._id) as NodeLayout
          const inside = first.symbols.filter((s) => s.role === role.view).map((s) => fitted.nodes.get(s.view._id)).filter((x): x is NodeLayout => !!x)
          return { role, ...span([n.box, ...inside.flatMap(rectsOf)]) }
        })
        .sort((a, c) => a.left - c.left)
      const sideBySide = extents.every((e, i) => i === 0 || e.left >= (extents[i - 1] as { right: number }).right)
      const xAnchors: Array<{ from: number; to: number }> = []
      if (sideBySide) {
        let right = -Infinity
        for (const e of extents) {
          const dx = Number.isFinite(right) ? Math.min(0, right + RAD_ROLE_GAP - e.left) : 0
          xAnchors.push({ from: e.left, to: e.left + dx }, { from: e.right, to: e.right + dx })
          right = e.right + dx
          if (dx === 0) continue
          const roleView = repo.get(e.role.view._id) as NodeView
          moveNode(b, roleView, dx, 0)
          for (const s of first.symbols) if (s.role === e.role.view) moveNode(b, s.view, dx, 0)
        }
      }
      const mapX = pieceMap(xAnchors)

      // 4. Everything else follows: bend points of the lines, notes and other views.
      for (const it of first.others) {
        const nx = Math.round(mapX(it.view.left))
        const ny = Math.round(mapY(it.view.top))
        if (nx !== it.view.left || ny !== it.view.top) b.setAll(it.view, { left: nx, top: ny })
      }
      for (const v of (env.diagram.ownedViews ?? []) as View[]) {
        if (!isKindOf(v, 'EdgeView')) continue
        const points = (v as EdgeView).points
        if (!points || points.length <= 2) continue
        const moved = points.map((p) => ({ x: Math.round(mapX(p.x)), y: Math.round(mapY(p.y)) }))
        if (moved.some((p, i) => p.x !== points[i]?.x || p.y !== points[i]?.y)) b.set(v, 'points', moved)
      }

      // 5. Nothing may end up on top of something it was clear of.
      const after = itemsOf(env, layoutOf(env))
      const overlapAfter = overlappingPairs([...after.roles, ...after.symbols, ...after.others])
      for (const pair of overlapAfter) if (!overlapBefore.has(pair)) throw new UnsafeCompaction()
      // Already compact: no empty step in the undo history.
      if (geometryOf(env) === start) throw new NothingToDo()
    })
  } catch (err) {
    if (err instanceof UnsafeCompaction) return { ok: false, reason: UNSAFE_RESULT }
    if (err instanceof NothingToDo) return { ok: true, changed: false }
    throw err
  }
  return { ok: true, changed: true }
}

/** Positions, sizes and bend points of the diagram's views, to tell whether anything moved. */
function geometryOf(env: DiagramEnv): string {
  return JSON.stringify(((env.diagram.ownedViews ?? []) as View[]).map((v) => [v._id, v['left'], v['top'], v['width'], v['height'], v['points']]))
}

class NothingToDo extends Error {}

class UnsafeCompaction extends Error {
  constructor() {
    super(UNSAFE_RESULT)
  }
}
